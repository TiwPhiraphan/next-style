import fs from 'node:fs'
import path from 'node:path'
import cssnano from 'cssnano'
import postcss from 'postcss'
import { StyleCollector } from '../compiler'
import { BREAKPOINTS } from '../utils'

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

export function safeEvalObject(src: string): Record<string, any> | null {
	try {
		const fn = new Function(`"use strict"; return (${src});`)
		const result = fn()
		if (result && typeof result === 'object' && !Array.isArray(result)) return result
	} catch {}
	try {
		const sanitised = src
			.replace(/\s+(?:as|satisfies)\s+[^,}\n]+/g, '')
			.replace(/\.\.\.[a-zA-Z_$][\w$.]*/g, '')
			.replace(/`[^`]*`/g, '""')
			.replace(/(?<=:\s*)([a-zA-Z_$][\w$.]*\s*\([^)]*\))(?=\s*[,}\n])/g, '""')
			.replace(/(?<=:\s*)([a-zA-Z_$][\w$.]*)(?=\s*[,}\n])/g, (_m, id) => {
				const trimmed = id.trim()
				if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || trimmed === 'undefined') {
					return trimmed
				}
				return '""'
			})
			.replace(/,\s*,/g, ',')
			.replace(/\{\s*,/g, '{')
			.replace(/,\s*\}/g, '}')
		const fn2 = new Function(`"use strict"; return (${sanitised});`)
		const result2 = fn2()
		if (result2 && typeof result2 === 'object' && !Array.isArray(result2)) return result2
	} catch {}
	return null
}

export function extractBalancedBraces(src: string, startIdx: number): string | null {
	let depth = 0
	let i = startIdx
	let inStr: string | null = null
	const tmplBraceStack: number[] = []

	while (i < src.length) {
		const ch = src[i]
		const next = src[i + 1]

		// Skip comments if not inside string
		if (!inStr) {
			if (ch === '/' && next === '/') {
				i += 2
				while (i < src.length && src[i] !== '\n') i++
				continue
			}
			if (ch === '/' && next === '*') {
				i += 2
				while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
				i += 2
				continue
			}
		}

		if (inStr === '`') {
			if (ch === '\\') {
				i += 2
				continue
			}
			if (ch === '`') {
				inStr = null
			} else if (ch === '$' && next === '{') {
				tmplBraceStack.push(depth)
				inStr = null
				i += 2
				continue
			}
		} else if (inStr) {
			if (ch === '\\') {
				i += 2
				continue
			}
			if (ch === inStr) {
				inStr = null
			}
		} else {
			if (ch === '"' || ch === "'" || ch === '`') {
				inStr = ch
			} else if (ch === '{') {
				depth++
			} else if (ch === '}') {
				if (tmplBraceStack.length > 0 && depth === tmplBraceStack[tmplBraceStack.length - 1]) {
					tmplBraceStack.pop()
					inStr = '`'
				} else {
					depth--
					if (depth === 0) return src.slice(startIdx, i + 1)
				}
			}
		}
		i++
	}
	return null
}

function scanFile(src: string, collector: StyleCollector): number {
	let found = 0
	const cssRe = /\bcss\s*(?:<[^>]*>)?\s*\(\s*(\{)/g
	let m: RegExpExecArray | null
	while ((m = cssRe.exec(src)) !== null) {
		const braceStart = m.index + m[0].length - 1
		const raw = extractBalancedBraces(src, braceStart)
		if (!raw) continue
		const obj = safeEvalObject(raw)
		if (!obj) continue
		const normalised = normaliseCSSObject(obj)
		collector.addStyle(normalised)
		found++
	}
	const globalRe = /\bglobal\s*(?:<[^>]*>)?\s*\(\s*(\{)/g
	while ((m = globalRe.exec(src)) !== null) {
		const braceStart = m.index + m[0].length - 1
		const raw = extractBalancedBraces(src, braceStart)
		if (!raw) continue
		const obj = safeEvalObject(raw)
		if (!obj || typeof obj !== 'object') continue
		for (const [selector, styles] of Object.entries(obj)) {
			if (styles && typeof styles === 'object') {
				collector.addGlobalStyle(selector, styles as any)
				found++
			}
		}
	}
	return found
}

function normaliseCSSObject(obj: Record<string, any>): Record<string, any> {
	if (!obj || typeof obj !== 'object') return {}
	const out: Record<string, any> = {}
	for (const [k, v] of Object.entries(obj)) {
		const key = BREAKPOINTS[k] ?? k
		out[key] = v && typeof v === 'object' && !Array.isArray(v)
			? normaliseCSSObject(v)
			: v
	}
	return out
}

function scanProjectStyles(projectRoot: string): string {
	const collector = new StyleCollector()
	const files = collectSourceFiles(projectRoot)
	for (const file of files) {
		let src: string
		try { src = fs.readFileSync(file, 'utf-8') } catch { continue }
		scanFile(src, collector)
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
				process.env.NODE_ENV === 'production' ||
				process.env.NEXT_PHASE === 'phase-production-build'
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
