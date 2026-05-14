import fs from 'node:fs'
import path from 'node:path'
import { BREAKPOINTS, camelToKebab, generateClassHash, normalizeMediaQuery } from '../utils'

/**
 * The compiled representation of a single `css({})` call.
 * Produced by `StyleCollector` and consumed by the PostCSS plugin.
 */
export interface CompiledStyle {
	/** Scoped class name, e.g. `"ns-1x2y3z"`. */
	className: string
	/** Base CSS rule block for this class. */
	css: string
	/** Map of normalized media query string → CSS rule block. */
	mediaQueries: Record<string, string>
	/** Map of pseudo selector (e.g. `":hover"`) → CSS rule block. */
	pseudoClasses: Record<string, string>
	/** Concatenated `@keyframes` blocks referenced by this style. */
	keyframes: string
	/** Map of `@supports` condition → CSS rule block. */
	supports: Record<string, string>
	/** Map of `@layer` name → CSS rule block. */
	layers: Record<string, string>
}

/**
 * Collects, compiles, and deduplicates styles registered via `css()` and `global()`.
 *
 * A single shared instance is held by the runtime module. The PostCSS plugin
 * calls `getAllStyles()` at build time to drain the collected CSS.
 *
 * @example
 * const collector = new StyleCollector()
 * const className = collector.addStyle({ color: 'red' }) // "ns-abc123"
 * const css = collector.getAllStyles() // ".ns-abc123 { color: red; }"
 */
export class StyleCollector {
	private styles = new Map<string, CompiledStyle>()

	/**
	 * Compiles a style object and registers it in the collector.
	 * Returns the same class name for identical style objects (deduplication).
	 *
	 * @param styleObj - Raw style object from a `css({})` call.
	 * @returns Scoped class name string.
	 */
	addStyle(styleObj: any): string {
		const hash = generateClassHash(styleObj)
		const className = `ns-${hash}`
		if (this.styles.has(className)) {
			return className
		}
		const compiled = this.compileStyle(styleObj)
		this.styles.set(className, compiled)
		return className
	}

	/**
	 * Registers a global style rule (no scoped class).
	 * Subsequent calls with the same selector are ignored (idempotent).
	 *
	 * @param selector - CSS selector string, e.g. `"body"` or `"h1, h2"`.
	 * @param styleObj - Style properties to apply to the selector.
	 */
	addGlobalStyle(selector: string, styleObj: any): void {
		const key = `global:${selector}`
		if (this.styles.has(key)) return
		const props = this.buildDeclarations(styleObj)
		if (!props) return
		this.styles.set(key, {
			className: key,
			css: `${selector} {\n${props}}`,
			mediaQueries: {},
			pseudoClasses: {},
			keyframes: '',
			supports: {},
			layers: {}
		})
	}

	private compileStyle(styleObj: any): CompiledStyle {
		const { mediaQueries, pseudoClasses, normalStyles, keyframes, supports, container, layer } =
			this.parseStyles(styleObj)
		const hash = generateClassHash(styleObj)
		const className = `ns-${hash}`

		const declarations = this.buildDeclarations(normalStyles)
		const css = `.${className} {\n${declarations}}`

		const compiledMedia: Record<string, string> = {}
		Object.entries(mediaQueries).forEach(([query, styles]) => {
			const normalized = normalizeMediaQuery(query)
			const inner = this.buildDeclarations(styles as Record<string, any>, '    ')
			if (compiledMedia[normalized]) {
				const existing = compiledMedia[normalized]
				const existingDeclarations = existing.split('\n').slice(2, -2).join('\n')
				compiledMedia[normalized] =
					`${normalized} {\n  .${className} {\n${existingDeclarations}\n${inner}  }\n}`
			} else {
				compiledMedia[normalized] = `${normalized} {\n  .${className} {\n${inner}  }\n}`
			}
		})

		Object.entries(container).forEach(([query, styles]) => {
			const inner = this.buildDeclarations(styles as Record<string, any>, '    ')
			compiledMedia[query] = `${query} {\n  .${className} {\n${inner}  }\n}`
		})

		const compiledPseudos: Record<string, string> = {}
		Object.entries(pseudoClasses).forEach(([pseudo, styles]) => {
			const inner = this.buildDeclarations(styles as Record<string, any>)
			compiledPseudos[pseudo] = `.${className}${pseudo} {\n${inner}}`
		})

		let keyframesCss = ''
		Object.entries(keyframes).forEach(([name, frames]) => {
			keyframesCss += `@keyframes ${name} {\n`
			Object.entries(frames as Record<string, any>).forEach(([stop, props]) => {
				const inner = this.buildDeclarations(props as Record<string, any>, '    ')
				keyframesCss += `  ${stop} {\n${inner}  }\n`
			})
			keyframesCss += '}\n'
		})

		const compiledSupports: Record<string, string> = {}
		Object.entries(supports).forEach(([condition, styles]) => {
			const inner = this.buildDeclarations(styles as Record<string, any>, '    ')
			compiledSupports[condition] = `@supports ${condition} {\n  .${className} {\n${inner}  }\n}`
		})

		const compiledLayers: Record<string, string> = {}
		Object.entries(layer).forEach(([name, styles]) => {
			const inner = this.buildDeclarations(styles as Record<string, any>, '  ')
			compiledLayers[name] = `@layer ${name} {\n${inner}}`
		})

		return {
			className,
			css,
			mediaQueries: compiledMedia,
			pseudoClasses: compiledPseudos,
			keyframes: keyframesCss,
			supports: compiledSupports,
			layers: compiledLayers
		}
	}

	private parseStyles(styleObj: any): {
		normalStyles: Record<string, any>
		mediaQueries: Record<string, any>
		pseudoClasses: Record<string, any>
		keyframes: Record<string, any>
		supports: Record<string, any>
		container: Record<string, any>
		layer: Record<string, any>
	} {
		const normalStyles: Record<string, any> = {}
		const mediaQueries: Record<string, any> = {}
		const pseudoClasses: Record<string, any> = {}
		const keyframes: Record<string, any> = {}
		const supports: Record<string, any> = {}
		const container: Record<string, any> = {}
		const layer: Record<string, any> = {}

		Object.entries(styleObj).forEach(([key, value]) => {
			if (key.startsWith('@keyframes ')) {
				keyframes[key.slice('@keyframes '.length)] = value
			} else if (key === '@keyframes' && typeof value === 'object') {
				Object.assign(keyframes, value)
			} else if (key.startsWith('@supports')) {
				const condition = key.slice(0, 9) === '@supports' ? key.slice(9).trim() : key
				supports[condition] = value
			} else if (key.startsWith('@container')) {
				container[key] = value
			} else if (key.startsWith('@layer')) {
				layer[key.slice('@layer '.length) || 'default'] = value
			} else if (key in BREAKPOINTS || key.startsWith('@media')) {
				mediaQueries[key] = value
			} else if (key.startsWith(':') || key.startsWith('::')) {
				pseudoClasses[key] = value
			} else {
				normalStyles[key] = value
			}
		})

		return { normalStyles, mediaQueries, pseudoClasses, keyframes, supports, container, layer }
	}

	private buildDeclarations(styles: Record<string, any>, indent = '  '): string {
		let css = ''
		Object.entries(styles).forEach(([key, value]) => {
			if (typeof value === 'string' || typeof value === 'number') {
				css += `${indent}${camelToKebab(key)}: ${value};\n`
			}
		})
		return css
	}

	/**
	 * Serialises all collected styles into a single CSS string.
	 *
	 * Output order:
	 * 1. `@keyframes` blocks
	 * 2. Base class rules
	 * 3. Pseudo-class/element rules
	 * 4. `@layer` blocks
	 * 5. `@supports` blocks
	 * 6. Media queries (ascending `min-width`, mobile-first)
	 *
	 * @returns Full CSS string ready to be injected or written to a file.
	 */
	getAllStyles(): string {
		let allCss = ''
		this.styles.forEach(style => {
			if (style.keyframes) allCss += `${style.keyframes}\n`
			if (style.css) allCss += `${style.css}\n`
			Object.values(style.pseudoClasses).forEach(css => {
				allCss += `${css}\n`
			})
			Object.values(style.layers).forEach(css => {
				allCss += `${css}\n`
			})
			Object.values(style.supports).forEach(css => {
				allCss += `${css}\n`
			})
			const mediaEntries = Object.entries(style.mediaQueries).sort(
				([a], [b]) => this.extractMinWidth(a) - this.extractMinWidth(b)
			)
			mediaEntries.forEach(([, css]) => {
				allCss += `${css}\n`
			})
		})
		return allCss
	}

	private extractMinWidth(query: string): number {
		const match = query.match(/min-width:\s*(\d+)px/)
		return match ? parseInt(match[1], 10) : 0
	}

	/**
	 * Writes all collected styles to a temp file so the PostCSS plugin
	 * (which runs in a separate process) can read them.
	 *
	 * Call this after all `css()` / `global()` calls have been evaluated,
	 * e.g. at the end of a build-time entry point.
	 *
	 * @param filePath - Destination file path. Defaults to `os.tmpdir()/next-style.css`.
	 */
	flush(filePath?: string): void {
		try {
			const dest = filePath ?? path.join(process.cwd(), 'node_modules', '.cache', 'next-style', 'styles.css')
			fs.mkdirSync(path.dirname(dest), { recursive: true })
			fs.writeFileSync(dest, this.getAllStyles(), 'utf-8')
		} catch (err) {
			console.error('Failed to flush styles to cache file:', err)
		}
	}

	/**
	 * Returns a snapshot of the internal style map.
	 * Intended for inspection and testing — not for direct mutation.
	 */
	getStyleMap() {
		return new Map(this.styles)
	}
}

/**
 * Creates an isolated `StyleCollector` paired with a transform helper.
 *
 * Primarily used by SWC/Babel transforms and test harnesses that need
 * a fresh collector per file or per test, independent of the shared
 * runtime instance.
 *
 * @example
 * const { collector, transformCssCall } = createTransformer()
 * const className = transformCssCall({ color: 'red' })
 * const css = collector.getAllStyles()
 */
export function createTransformer() {
	const collector = new StyleCollector()
	return {
		collector,
		/**
		 * Equivalent to calling `css()` against this transformer's isolated collector.
		 * @param styleObj - Raw style object.
		 * @returns Scoped class name string.
		 */
		transformCssCall(styleObj: any): string {
			return collector.addStyle(styleObj)
		}
	}
}
