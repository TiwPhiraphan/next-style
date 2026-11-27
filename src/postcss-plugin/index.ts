import fs from 'node:fs'
import path from 'node:path'
import cssnano from 'cssnano'
import postcss from 'postcss'
import ts from 'typescript'
import { StyleCollector } from '../compiler'

function isNextStyleImport(params: string): boolean {
	const cleaned = params
		.replace(/^url\(/, '')
		.replace(/\)$/, '')
		.replace(/['"]/g, '')
		.trim()
	return cleaned === 'next-style' || cleaned.startsWith('next-style ')
}

function findProjectRoot(fromFile: string): string | null {
	let dir = path.dirname(fromFile)
	while (true) {
		if (fs.existsSync(path.join(dir, 'package.json'))) return dir
		const parent = path.dirname(dir)
		if (parent === dir) return null
		dir = parent
	}
}

export function resolveCacheFile(from: string | undefined): string {
	const projectRoot = (from ? findProjectRoot(from) : null) ?? process.cwd()
	return path.join(projectRoot, 'node_modules', '.cache', 'next-style', 'styles.css')
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'out', '.cache', '.turbo', 'build', 'coverage'])

function collectSourceFiles(dir: string): string[] {
	const files: string[] = []
	let entries: fs.Dirent[]
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true })
	} catch {
		return files
	}
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...collectSourceFiles(full))
		} else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
			files.push(full)
		}
	}
	return files
}

function getScriptKind(filePath: string): ts.ScriptKind {
	const ext = path.extname(filePath).toLowerCase()
	switch (ext) {
		case '.tsx':
			return ts.ScriptKind.TSX
		case '.jsx':
			return ts.ScriptKind.JSX
		case '.js':
		case '.mjs':
			return ts.ScriptKind.JS
		default:
			return ts.ScriptKind.TS
	}
}

function unwrapExpression(node: ts.Expression): ts.Expression {
	let current = node
	while (true) {
		if (ts.isParenthesizedExpression(current)) {
			current = current.expression
		} else if (
			ts.isAsExpression(current) ||
			ts.isSatisfiesExpression(current) ||
			ts.isTypeAssertionExpression(current)
		) {
			current = current.expression
		} else {
			return current
		}
	}
}

export function evalLiteral(node: ts.Expression): any {
	const expr = unwrapExpression(node)

	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
		return expr.text
	}

	if (ts.isNumericLiteral(expr)) {
		return Number(expr.text)
	}

	if (ts.isPrefixUnaryExpression(expr)) {
		const operand = unwrapExpression(expr.operand)
		if (ts.isNumericLiteral(operand)) {
			if (expr.operator === ts.SyntaxKind.MinusToken) return -Number(operand.text)
			if (expr.operator === ts.SyntaxKind.PlusToken) return Number(operand.text)
		}
		throw new Error(`Unsupported unary expression: ${expr.getText()}`)
	}

	if (ts.isObjectLiteralExpression(expr)) {
		const out: Record<string, any> = {}
		for (const prop of expr.properties) {
			if (ts.isSpreadAssignment(prop)) {
				throw new Error('Spread properties are not supported in static style extraction')
			}
			if (ts.isShorthandPropertyAssignment(prop)) {
				throw new Error(`Shorthand property "${prop.name.text}" is not supported in static style extraction`)
			}
			if (ts.isComputedPropertyName(prop.name)) {
				throw new Error('Computed property keys are not supported in static style extraction')
			}
			if (!ts.isPropertyAssignment(prop)) {
				throw new Error('Unsupported property in style object')
			}
			let key: string
			if (
				ts.isIdentifier(prop.name) ||
				ts.isStringLiteral(prop.name) ||
				ts.isNoSubstitutionTemplateLiteral(prop.name) ||
				ts.isNumericLiteral(prop.name)
			) {
				key = prop.name.text
			} else {
				throw new Error('Unsupported property key in style object')
			}
			out[key] = evalLiteral(prop.initializer)
		}
		return out
	}

	throw new Error(`Dynamic or unsupported expression: ${expr.getText()}`)
}

export function scanFile(src: string, collector: StyleCollector, filePath = '<inline>'): number {
	let found = 0
	const sourceFile = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true, getScriptKind(filePath))

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const fnName = node.expression.text
			if ((fnName === 'css' || fnName === 'global') && node.arguments.length > 0) {
				const arg = unwrapExpression(node.arguments[0])
				if (arg.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(arg) && arg.text === 'undefined')) {
					ts.forEachChild(node, visit)
					return
				}
				try {
					const evaluated = evalLiteral(arg)
					if (evaluated && typeof evaluated === 'object' && !Array.isArray(evaluated)) {
						if (fnName === 'css') {
							collector.addStyle(evaluated)
							found++
						} else {
							for (const [selector, styles] of Object.entries(evaluated)) {
								if (styles && typeof styles === 'object') {
									collector.addGlobalStyle(selector, styles as any)
									found++
								}
							}
						}
					}
				} catch (err) {
					const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
					const message = err instanceof Error ? err.message : String(err)
					console.warn(`[next-style] Skipping ${fnName}() at ${filePath}:${line + 1}: ${message}`)
				}
			}
		}
		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	return found
}

function scanProjectStyles(projectRoot: string): string {
	const collector = new StyleCollector()
	const files = collectSourceFiles(projectRoot)
	for (const file of files) {
		let src: string
		try {
			src = fs.readFileSync(file, 'utf-8')
		} catch {
			continue
		}
		scanFile(src, collector, file)
	}
	return collector.getAllStyles()
}

interface PluginOptions {
	/**
	 * Override the cache file path.
	 * When omitted, derived from the CSS file being processed.
	 */
	cacheFile?: string
}

function nextStylePlugin(opts: PluginOptions = {}) {
	const plugin: postcss.Plugin = {
		postcssPlugin: 'next-style',
		async Once(root, { result }) {
			const cacheFile = opts.cacheFile ?? resolveCacheFile(result.opts.from)
			const projectRoot = (result.opts.from ? findProjectRoot(result.opts.from) : null) ?? process.cwd()
			result.messages.push({
				type: 'dependency',
				plugin: 'next-style',
				file: cacheFile,
				parent: result.opts.from ?? ''
			})
			let cssContent = ''
			try {
				cssContent = fs.readFileSync(cacheFile, 'utf-8')
			} catch (err) {
				const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
				if (!isNotFound) {
					console.warn('[next-style] Failed to read cache file:', err)
				}
			}
			if (!cssContent.trim() || process.env.NODE_ENV !== 'production') {
				const scanned = scanProjectStyles(projectRoot)
				if (scanned.trim()) {
					cssContent = scanned
					try {
						fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
						fs.writeFileSync(cacheFile, cssContent, 'utf-8')
					} catch {}
				}
			}
			const isProduction =
				process.env.NODE_ENV === 'production' || process.env.NEXT_PHASE === 'phase-production-build'
			if (isProduction && cssContent.trim()) {
				try {
					const minifyResult = await postcss([
						cssnano({
							preset: [
								'default',
								{
									discardComments: { removeAll: true },
									normalizeWhitespace: true,
									mergeLonghand: true,
									reduceTransforms: true,
									convertValues: true,
									zindex: false,
									svgo: false,
									autoprefixer: false,
									mergeRules: true,
									discardDuplicates: true,
									reduceInitial: true
								}
							]
						})
					]).process(cssContent, { from: undefined })
					cssContent = minifyResult.css
				} catch (e) {
					console.warn('[next-style] CSS minification failed:', e)
				}
			}
			root.walkAtRules('import', atRule => {
				if (!isNextStyleImport(atRule.params.trim())) return
				if (cssContent.trim()) {
					atRule.replaceWith(postcss.parse(cssContent))
				} else {
					atRule.remove()
				}
			})
		}
	}
	return plugin
}

nextStylePlugin.postcss = true

export default nextStylePlugin
export const plugin = nextStylePlugin
