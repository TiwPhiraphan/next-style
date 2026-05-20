import { BREAKPOINTS, camelToKebab, generateClassHash, normalizeMediaQuery } from '../utils'

export interface CompiledStyle {
	className: string
	css: string
	mediaQueries: Record<string, string>
	pseudoClasses: Record<string, string>
	keyframes: string
	supports: Record<string, string>
	layers: Record<string, string>
}

export class StyleCollector {
	private styles = new Map<string, CompiledStyle>()

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

	getAllStyles(): string {
		let allCss = ''
		this.styles.forEach(style => {
			if (style.keyframes) allCss += `${style.keyframes}\n`
			if (style.css) allCss += `${style.css}\n`
			Object.values(style.pseudoClasses).forEach(css => { allCss += `${css}\n` })
			Object.values(style.layers).forEach(css => { allCss += `${css}\n` })
			Object.values(style.supports).forEach(css => { allCss += `${css}\n` })
			const mediaEntries = Object.entries(style.mediaQueries).sort(
				([a], [b]) => this.extractMinWidth(a) - this.extractMinWidth(b)
			)
			mediaEntries.forEach(([, css]) => { allCss += `${css}\n` })
		})
		return allCss
	}

	private extractMinWidth(query: string): number {
		const match = query.match(/min-width:\s*(\d+)px/)
		return match ? parseInt(match[1], 10) : 0
	}

	flush(filePath?: string): void {
		if (typeof window !== 'undefined') return
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require('node:fs') as typeof import('node:fs')
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const path = require('node:path') as typeof import('node:path')
			const dest = filePath ?? StyleCollector.defaultCacheFile()
			fs.mkdirSync(path.dirname(dest), { recursive: true })
			fs.writeFileSync(dest, this.getAllStyles(), 'utf-8')
		} catch (err) {
			console.error('[next-style] Failed to flush styles to cache file:', err)
		}
	}

	static defaultCacheFile(): string {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const path = require('node:path') as typeof import('node:path')
		return path.join(process.cwd(), 'node_modules', '.cache', 'next-style', 'styles.css')
	}

	getStyleMap() {
		return new Map(this.styles)
	}
}
