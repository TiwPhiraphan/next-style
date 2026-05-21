import fs from 'node:fs'
import path from 'node:path'
import cssnano from 'cssnano'
import postcss from 'postcss'
import { StyleCollector } from '../compiler'
import { BREAKPOINTS } from '../utils'

/**
 * PostCSS plugin for next-style.
 *
 * Strategy (in priority order):
 * 1. Read from cache file (written by runtime flush() during dev/watch).
 * 2. If cache is missing or empty, fall back to static source scan —
 *    walks the project source tree, extracts css()/global() call arguments
 *    via regex, evaluates them through StyleCollector, and injects the result.
 *    This makes cold production builds (GitHub Actions, Vercel, etc.) work
 *    without requiring a prior dev-server run.
 */

const IMPORT_RE = /^next-style$/

// ---------------------------------------------------------------------------
// Project-root helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Static source scanner
// ---------------------------------------------------------------------------

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'out', '.cache'])

/** Recursively collect all source file paths under `dir`. */
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

/**
 * Very small JS/TS object literal evaluator.
 * Handles string, number, nested object, and array literals only.
 * Returns `null` when the text cannot be safely evaluated.
 *
 * Strategy:
 * 1. Try direct eval of the raw text (works for pure literal objects).
 * 2. If that fails, strip TypeScript type assertions (`as Foo`, `satisfies Foo`)
 *    and replace template literals / variable references with placeholder
 *    strings, then try again. This handles the common pattern of
 *    `css({ color: someVar })` — the property will be skipped at runtime
 *    but the selector (and thus the class-name hash) will still be stable
 *    for fully-literal properties.
 */
function safeEvalObject(src: string): Record<string, any> | null {
	// Attempt 1: raw eval
	try {
		const fn = new Function(`"use strict"; return (${src});`)
		const result = fn()
		if (result && typeof result === 'object' && !Array.isArray(result)) return result
	} catch { /* fall through */ }

	// Attempt 2: sanitise common non-literal constructs and retry
	try {
		const sanitised = src
			// Remove TypeScript type assertions: `as Foo`, `satisfies Bar`
			.replace(/\s+(?:as|satisfies)\s+\w[\w.<>[\], |&]*/g, '')
			// Replace template literals with a placeholder string
			.replace(/`[^`]*`/g, '"__tmpl__"')
			// Replace identifiers used as values (not as keys) with a placeholder.
			// Pattern: after `:` or after `[`, an unquoted word that is not a
			// reserved JSON keyword (true/false/null) nor a number.
			.replace(/(?<=:\s*)([a-zA-Z_$][\w$.]*)(?=\s*[,}])/g, (_m, id) => {
				if (id === 'true' || id === 'false' || id === 'null' || id === 'undefined') return id
				return '"__ref__"'
			})
		const fn2 = new Function(`"use strict"; return (${sanitised});`)
		const result2 = fn2()
		if (result2 && typeof result2 === 'object' && !Array.isArray(result2)) return result2
	} catch { /* fall through */ }

	return null
}

/**
 * Extract the balanced object literal that starts at `startIdx` (the `{`)
 * inside `src`. Returns the raw text or `null` if unbalanced.
 * Correctly skips over string literals (including template literals with
 * nested `${...}` expressions) so that brace characters inside strings are
 * not counted toward the depth.
 */
function extractBalancedBraces(src: string, startIdx: number): string | null {
	let depth = 0
	let i = startIdx
	let inStr: string | null = null
	let tmplDepth = 0  // nesting depth of ${} inside template literals

	while (i < src.length) {
		const ch = src[i]
		if (inStr === '`') {
			// Inside a template literal
			if (ch === '\\') { i += 2; continue }
			if (ch === '`') { inStr = null }
			else if (ch === '$' && src[i + 1] === '{') {
				// Enter a template expression — treat its braces as normal code
				tmplDepth++
				i += 2
				continue
			}
		} else if (inStr) {
			// Inside a regular string
			if (ch === '\\') { i += 2; continue }
			if (ch === inStr) inStr = null
		} else {
			if (ch === '"' || ch === "'" || ch === '`') {
				inStr = ch
			} else if (ch === '{') {
				if (tmplDepth > 0) tmplDepth++
				else depth++
			} else if (ch === '}') {
				if (tmplDepth > 0) {
					tmplDepth--
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

/**
 * Scan a single source file and register all css()/global() calls into
 * the provided StyleCollector. Returns how many calls were found.
 */
function scanFile(src: string, collector: StyleCollector): number {
	let found = 0

	// css({ ... })
	const cssRe = /\bcss\s*\(\s*(\{)/g
	let m: RegExpExecArray | null
	// biome-ignore lint: intentional assignment in condition
	while ((m = cssRe.exec(src)) !== null) {
		const braceStart = m.index + m[0].length - 1
		const raw = extractBalancedBraces(src, braceStart)
		if (!raw) continue
		const obj = safeEvalObject(raw)
		if (!obj) continue
		// Normalise shorthand breakpoints so the hash matches runtime
		const normalised = normaliseCSSObject(obj)
		collector.addStyle(normalised)
		found++
	}

	// global({ selector: { ... }, ... })
	const globalRe = /\bglobal\s*\(\s*(\{)/g
	// biome-ignore lint: intentional assignment in condition
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

/** Recursively replace shorthand breakpoint keys with full @media strings. */
function normaliseCSSObject(obj: Record<string, any>): Record<string, any> {
	const out: Record<string, any> = {}
	for (const [k, v] of Object.entries(obj)) {
		const key = BREAKPOINTS[k] ?? k
		out[key] = v && typeof v === 'object' && !Array.isArray(v)
			? normaliseCSSObject(v)
			: v
	}
	return out
}

/**
 * Walk the project source tree and collect all css()/global() styles.
 * Returns the full CSS string, or '' when nothing is found.
 */
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

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

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

			// Register cache file as a PostCSS dependency so hot-reload works.
			result.messages.push({
				type: 'dependency',
				plugin: 'next-style',
				file: cacheFile,
				parent: result.opts.from ?? ''
			})

			// --- 1. Try cache file (populated by runtime flush() in dev/watch) ---
			let cssContent = ''
			try {
				cssContent = fs.readFileSync(cacheFile, 'utf-8')
			} catch (err) {
				const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
				if (!isNotFound) {
					console.warn('[next-style] Failed to read cache file:', err)
				}
			}

			// --- 2. Fallback: static source scan (cold build / CI / deploy) ---
			if (!cssContent.trim()) {
				cssContent = scanProjectStyles(projectRoot)
				if (cssContent.trim()) {
					// Persist scanned CSS so the runtime picks it up on first request.
					try {
						fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
						fs.writeFileSync(cacheFile, cssContent, 'utf-8')
					} catch {
						// Non-fatal — styles will still be injected this build.
					}
				}
			}

			// --- 3. Minify in production ---
			if (process.env.NODE_ENV === 'production' && cssContent.trim()) {
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

			// --- 4. Inject into CSS (replace @import "next-style" only) ---
			// Do NOT fall back to prepend when no @import is found.
			// Next.js/Turbopack runs PostCSS against every CSS chunk, so
			// prepending would duplicate the entire stylesheet into every
			// chunk that doesn't explicitly opt in via @import "next-style".
			root.walkAtRules('import', atRule => {
				const val = atRule.params.replace(/['"]/g, '').trim()
				if (!IMPORT_RE.test(val)) return
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
