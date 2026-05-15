import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

/**
 * PostCSS plugin for next-style.
 *
 * How it works with Turbopack:
 * 1. `css()` / `global()` calls in component files write compiled CSS to a
 *    temp file (`os.tmpdir()/next-style.css`) via `styleCollector.flush()`.
 * 2. This plugin reads that temp file and replaces `@import "next-style"`
 *    with its contents at PostCSS processing time.
 *
 * Because PostCSS runs in a separate process from the module graph,
 * in-memory collectors cannot be shared. The temp file is the IPC bridge.
 *
 * Usage in postcss.config.js:
 *   export default { plugins: { "next-style/plugin": {} } }
 */

const IMPORT_RE = /^next-style$/

/**
 * Walks up the directory tree from `fromFile` until it finds a directory
 * containing `package.json`. Returns that directory, or `null` if none is
 * found before reaching the filesystem root.
 */
function findProjectRoot(fromFile: string): string | null {
	let dir = path.dirname(fromFile)
	while (true) {
		if (fs.existsSync(path.join(dir, 'package.json'))) return dir
		const parent = path.dirname(dir)
		if (parent === dir) return null
		dir = parent
	}
}

/**
 * Resolves the cache file path from the PostCSS `result.opts.from` field.
 * Falls back to `process.cwd()` when `from` is absent (e.g. standalone runs).
 */
export function resolveCacheFile(from: string | undefined): string {
	const projectRoot = (from ? findProjectRoot(from) : null) ?? process.cwd()
	return path.join(projectRoot, 'node_modules', '.cache', 'next-style', 'styles.css')
}

interface PluginOptions {
	/**
	 * Override the cache file path.
	 * When omitted, the path is derived from the CSS file being processed
	 * (`result.opts.from`) by walking up to the nearest `package.json`.
	 */
	cacheFile?: string
}

function nextStylePlugin(opts: PluginOptions = {}) {
	const plugin: postcss.Plugin = {
		postcssPlugin: 'next-style',

		Once(root, { result }) {
			const cacheFile = opts.cacheFile ?? resolveCacheFile(result.opts.from)

			result.messages.push({
				type: 'dependency',
				plugin: 'next-style',
				file: cacheFile,
				parent: result.opts.from ?? '',
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
			let replaced = false
			root.walkAtRules('import', atRule => {
				const val = atRule.params.replace(/['"]/g, '').trim()
				if (!IMPORT_RE.test(val)) return
				if (cssContent.trim()) {
					atRule.replaceWith(postcss.parse(cssContent))
				} else {
					atRule.remove()
				}
				replaced = true
			})
			if (!replaced && cssContent.trim()) {
				root.prepend(postcss.parse(cssContent))
			}
		}
	}
	return plugin
}

nextStylePlugin.postcss = true

export default nextStylePlugin
export const plugin = nextStylePlugin
