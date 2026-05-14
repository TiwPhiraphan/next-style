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

/** Path to the temp file used as IPC bridge between runtime and PostCSS. */
export const CACHE_FILE = path.join(process.cwd(), 'node_modules', '.cache', 'next-style', 'styles.css')

interface PluginOptions {
	/**
	 * Override the cache file path.
	 * Defaults to `process.cwd()/node_modules/.cache/next-style/styles.css`.
	 */
	cacheFile?: string
}

function nextStylePlugin(opts: PluginOptions = {}) {
	const cacheFile = opts.cacheFile ?? CACHE_FILE

	const plugin: postcss.Plugin = {
		postcssPlugin: 'next-style',

		Once(root, { result }) {
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
