import fs from 'node:fs'
import path from 'node:path'
import { BREAKPOINTS, addPxIfNeeded, camelToKebab, generateClassHash, normalizeMediaQuery } from '../utils'

function normaliseStyleKeys(obj: Record<string, any>): Record<string, any> {
	if (!obj || typeof obj !== 'object') return {}
	const out: Record<string, any> = {}
	for (const [k, v] of Object.entries(obj)) {
		const key = BREAKPOINTS[k] ?? k
		out[key] = v && typeof v === 'object' && !Array.isArray(v) ? normaliseStyleKeys(v) : v
	}
	return out
}

export interface CompiledStyle {
	className: string
	css: string
	mediaQueries: Record<string, string>
	pseudoClasses: Record<string, string>
	keyframes: string
	supports: Record<string, string>
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
 * const className = collector.addStyle({ color: 'red' }) // "next-abc123"
 * const css = collector.getAllStyles() // ".next-abc123 { color: red; }"
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
		if (!styleObj || typeof styleObj !== 'object') {
			return 'next-0'
		}
		const normalised = normaliseStyleKeys(styleObj)
		const hash = generateClassHash(normalised)
		const className = `next-${hash}`
		if (this.styles.has(className)) {
			return className
		}
		const compiled = this.compileStyle(normalised, className)
		this.styles.set(className, compiled)
		return className
	}

	/**
	 * Registers a global style rule (no scoped class).
	 * If the selector was previously registered, subsequent styles are merged.
	 *
	 * @param selector - CSS selector string, e.g. `"body"` or `"h1, h2"`.
	 * @param styleObj - Style properties to apply to the selector.
	 */
	addGlobalStyle(selector: string, styleObj: any): void {
		if (!styleObj || typeof styleObj !== 'object') return
		const key = `global:${selector}`
		const existing = this.styles.get(key)
		const { mediaQueries, pseudoClasses, normalStyles } = this.parseStyles(styleObj)

		const declarations = this.buildDeclarations(normalStyles)
		let baseCss = ''
		if (declarations.trim()) {
			baseCss = `${selector} {\n${declarations}}`
		}

		const compiledMedia: Record<string, string> = {}
		Object.entries(mediaQueries).forEach(([query, styles]) => {
			if (styles && typeof styles === 'object') {
				const normalized = normalizeMediaQuery(query)
				const inner = this.buildDeclarations(styles as Record<string, any>, '    ')
				if (inner.trim()) {
					compiledMedia[normalized] = `${normalized} {\n  ${selector} {\n${inner}  }\n}`
				}
			}
		})

		const compiledPseudos: Record<string, string> = {}
		Object.entries(pseudoClasses).forEach(([pseudo, styles]) => {
			if (styles && typeof styles === 'object') {
				const inner = this.buildDeclarations(styles as Record<string, any>)
				if (inner.trim()) {
					const target = pseudo.startsWith('&') ? pseudo.replace(/&/g, selector) : `${selector}${pseudo}`
					compiledPseudos[pseudo] = `${target} {\n${inner}}`
				}
			}
		})

		if (existing) {
			if (baseCss) {
				existing.css = existing.css ? `${existing.css}\n${baseCss}` : baseCss
			}
			Object.assign(existing.mediaQueries, compiledMedia)
			Object.assign(existing.pseudoClasses, compiledPseudos)
		} else {
			this.styles.set(key, {
				className: key,
				css: baseCss,
				mediaQueries: compiledMedia,
				pseudoClasses: compiledPseudos,
				keyframes: '',
				supports: {},
				layers: {}
			})
		}
	}

	private compileStyle(styleObj: any, className: string): CompiledStyle {
		const { mediaQueries, pseudoClasses, normalStyles, keyframes, supports, container, layer } =
			this.parseStyles(styleObj)

		const declarations = this.buildDeclarations(normalStyles)
		const css = declarations.trim() ? `.${className} {\n${declarations}}` : ''
		const compiledMedia: Record<string, string> = {}

		Object.entries(mediaQueries).forEach(([query, styles]) => {
			if (styles && typeof styles === 'object') {
				const normalized = normalizeMediaQuery(query)
				const inner = this.buildDeclarations(styles as Record<string, any>, '    ')
				if (inner.trim()) {
					if (compiledMedia[normalized]) {
						const existing = compiledMedia[normalized]
						const existingDeclarations = existing.split('\n').slice(2, -2).join('\n')
						compiledMedia[normalized] =
							`${normalized} {\n  .${className} {\n${existingDeclarations}\n${inner}  }\n}`
					} else {
						compiledMedia[normalized] = `${normalized} {\n  .${className} {\n${inner}  }\n}`
					}
				}
			}
		})

		Object.entries(container).forEach(([query, styles]) => {
			if (styles && typeof styles === 'object') {
				const inner = this.buildDeclarations(styles as Record<string, any>, '    ')
				if (inner.trim()) {
					compiledMedia[query] = `${query} {\n  .${className} {\n${inner}  }\n}`
				}
			}
		})

		const compiledPseudos: Record<string, string> = {}
		Object.entries(pseudoClasses).forEach(([pseudo, styles]) => {
			if (styles && typeof styles === 'object') {
				const inner = this.buildDeclarations(styles as Record<string, any>)
				if (inner.trim()) {
					const selectors = pseudo
						.split(',')
						.map(p => {
							const trimmed = p.trim()
							if (trimmed.startsWith('&')) {
								return trimmed.replace(/&/g, `.${className}`)
							}
							return `.${className}${trimmed}`
						})
						.join(', ')
					compiledPseudos[pseudo] = `${selectors} {\n${inner}}`
				}
			}
		})

		let keyframesCss = ''
		Object.entries(keyframes).forEach(([name, frames]) => {
			if (frames && typeof frames === 'object') {
				keyframesCss += `@keyframes ${name} {\n`
				Object.entries(frames as Record<string, any>).forEach(([stop, props]) => {
					if (props && typeof props === 'object') {
						const inner = this.buildDeclarations(props as Record<string, any>, '    ')
						keyframesCss += `  ${stop} {\n${inner}  }\n`
					}
				})
				keyframesCss += '}\n'
			}
		})

		const compiledSupports: Record<string, string> = {}
		Object.entries(supports).forEach(([condition, styles]) => {
			if (styles && typeof styles === 'object') {
				const inner = this.buildDeclarations(styles as Record<string, any>, '    ')
				if (inner.trim()) {
					compiledSupports[condition] = `@supports ${condition} {\n  .${className} {\n${inner}  }\n}`
				}
			}
		})

		const compiledLayers: Record<string, string> = {}
		Object.entries(layer).forEach(([name, styles]) => {
			if (styles && typeof styles === 'object') {
				const inner = this.buildDeclarations(styles as Record<string, any>, '    ')
				if (inner.trim()) {
					compiledLayers[name] = `@layer ${name} {\n  .${className} {\n${inner}  }\n}`
				}
			}
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

		if (!styleObj || typeof styleObj !== 'object') {
			return { normalStyles, mediaQueries, pseudoClasses, keyframes, supports, container, layer }
		}

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
			} else if (key.startsWith(':') || key.startsWith('::') || key.startsWith('&')) {
				pseudoClasses[key] = value
			} else {
				normalStyles[key] = value
			}
		})
		return { normalStyles, mediaQueries, pseudoClasses, keyframes, supports, container, layer }
	}

	private buildDeclarations(styles: Record<string, any>, indent = '  '): string {
		let css = ''
		if (!styles || typeof styles !== 'object') return css
		Object.entries(styles).forEach(([key, value]) => {
			if (typeof value === 'string' || typeof value === 'number') {
				const prop = camelToKebab(key)
				const formattedVal = addPxIfNeeded(key, value)
				css += `${indent}${prop}: ${formattedVal};\n`
			}
		})
		return css
	}

	/**
	 * Serialises all collected styles into a single CSS string.
	 *
	 * Output order:
	 * 1. `@keyframes` blocks (deduplicated)
	 * 2. Base class and global rules
	 * 3. Pseudo-class/element rules
	 * 4. `@layer` blocks
	 * 5. `@supports` blocks
	 * 6. Media queries (ascending `min-width`, mobile-first)
	 *
	 * @returns Full CSS string ready to be injected or written to a file.
	 */
	getAllStyles(): string {
		const keyframesSet = new Set<string>()
		const baseRules: string[] = []
		const pseudoRules: string[] = []
		const layerRules: string[] = []
		const supportsRules: string[] = []
		const mediaQueryMap = new Map<string, string[]>()

		this.styles.forEach(style => {
			if (style.keyframes && !keyframesSet.has(style.keyframes)) {
				keyframesSet.add(style.keyframes)
			}
			if (style.css?.trim()) {
				baseRules.push(style.css)
			}
			Object.values(style.pseudoClasses).forEach(css => {
				if (css.trim()) pseudoRules.push(css)
			})
			Object.values(style.layers).forEach(css => {
				if (css.trim()) layerRules.push(css)
			})
			Object.values(style.supports).forEach(css => {
				if (css.trim()) supportsRules.push(css)
			})
			Object.entries(style.mediaQueries).forEach(([query, css]) => {
				if (css.trim()) {
					const list = mediaQueryMap.get(query) ?? []
					list.push(css)
					mediaQueryMap.set(query, list)
				}
			})
		})

		let allCss = ''
		keyframesSet.forEach(kf => {
			allCss += `${kf}\n`
		})
		baseRules.forEach(rule => {
			allCss += `${rule}\n`
		})
		pseudoRules.forEach(rule => {
			allCss += `${rule}\n`
		})
		layerRules.forEach(rule => {
			allCss += `${rule}\n`
		})
		supportsRules.forEach(rule => {
			allCss += `${rule}\n`
		})

		const sortedMedia = Array.from(mediaQueryMap.keys()).sort((a, b) => {
			return this.extractMinWidth(a) - this.extractMinWidth(b)
		})

		sortedMedia.forEach(query => {
			const rules = mediaQueryMap.get(query) ?? []
			rules.forEach(rule => {
				allCss += `${rule}\n`
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
	 * Safely guarded against browser / non-Node environments.
	 *
	 * @param filePath - Destination file path.
	 */
	flush(filePath?: string): void {
		if (typeof globalThis !== 'undefined' && (globalThis as any).window !== undefined) return
		try {
			if (!fs || typeof fs.mkdirSync !== 'function') return
			const dest = filePath ?? StyleCollector.defaultCacheFile()
			fs.mkdirSync(path.dirname(dest), { recursive: true })
			fs.writeFileSync(dest, this.getAllStyles(), 'utf-8')
		} catch {
			// Do not throw or spam errors in restricted environments
		}
	}

	/**
	 * Returns the default cache file path, resolved at call-time from
	 * `process.cwd()`.
	 */
	static defaultCacheFile(): string {
		return path.join(process.cwd(), 'node_modules', '.cache', 'next-style', 'styles.css')
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
