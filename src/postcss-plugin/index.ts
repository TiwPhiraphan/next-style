import postcss from 'postcss'
import type { StyleCollector } from '../compiler'

const IMPORT_RE = /^next-style$/

/**
 * PostCSS plugin for next-style.
 *
 * Replaces `@import "next-style";` (or `@import 'next-style';`) in CSS files
 * with the compiled CSS collected by the StyleCollector.
 *
 * The collector is populated by the runtime `css()` / `global()` calls that
 * run during the build-time module evaluation (SWC / tsc transform pass).
 * At that point all `css({})` calls have been executed and their styles are
 * sitting in the collector — the PostCSS plugin just needs to drain it.
 *
 * Usage in postcss.config.js:
 *   import nextStylePlugin from 'next-style/plugin'
 *   export default { plugins: { 'next-style/plugin': {} } }
 */

interface PluginOptions {
	/** Provide a custom collector (useful for testing / server integration). */
	collector?: StyleCollector
}

function nextStylePlugin(opts: PluginOptions = {}) {
	// Lazy-import the runtime collector so the plugin works even when
	// the runtime module hasn't been evaluated yet (returns empty string then).
	let collector: StyleCollector | null = opts.collector ?? null

	const plugin: postcss.Plugin = {
		postcssPlugin: 'next-style',

		Once(root) {
			// Resolve collector from runtime if not provided
			if (!collector) {
				try {
					// Dynamic require so the plugin can be loaded before the
					// runtime module is on disk (e.g. during type-check only builds).
					// eslint-disable-next-line @typescript-eslint/no-var-requires
					const runtime = require('../runtime')
					collector = runtime.styleCollector as StyleCollector
				} catch {
					// Runtime not available — skip injection silently
					return
				}
			}

			const cssContent = collector.getAllStyles()
			if (!cssContent.trim()) return

			// Walk @import "next-style" / @import 'next-style' declarations
			let injected = false
			root.walkAtRules('import', atRule => {
				const val = atRule.params.replace(/['"]/g, '').trim()
				if (!IMPORT_RE.test(val)) return
				const parsed = postcss.parse(cssContent)
				atRule.replaceWith(parsed)
				injected = true
			})

			// If there was no @import directive, prepend styles at the top
			if (!injected) {
				const parsed = postcss.parse(cssContent)
				root.prepend(parsed)
			}
		}
	}

	return plugin
}

nextStylePlugin.postcss = true

export default nextStylePlugin
export const plugin = nextStylePlugin
