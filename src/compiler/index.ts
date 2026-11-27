import fs from 'node:fs'
import path from 'node:path'
import { BREAKPOINTS, addPxIfNeeded, camelToKebab, canonicalizeObject, generateClassHash } from '../utils'

function isPlainObject(v: unknown): v is Record<string, any> {
	return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function deepMergeObjects(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = { ...target }
	for (const [k, v] of Object.entries(source)) {
		if (isPlainObject(v) && isPlainObject(result[k])) {
			result[k] = deepMergeObjects(result[k], v)
		} else {
			result[k] = v
		}
	}
	return result
}

function normaliseStyleKeys(obj: Record<string, any>): Record<string, any> {
	if (!isPlainObject(obj)) return {}
	const out: Record<string, any> = {}
	for (const [k, v] of Object.entries(obj)) {
		const key = BREAKPOINTS[k] ?? k
		const val = isPlainObject(v) ? normaliseStyleKeys(v) : v
		if (isPlainObject(val) && isPlainObject(out[key])) {
			out[key] = deepMergeObjects(out[key], val)
		} else {
			out[key] = val
		}
	}
	return out
}

function resolveSelector(parentSelector: string, childKey: string): string {
	const parents = parentSelector
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)
	const children = childKey
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)

	const resolved: string[] = []
	for (const child of children) {
		for (const parent of parents) {
			if (child.includes('&')) {
				resolved.push(child.replace(/&/g, parent))
			} else if (child.startsWith(':')) {
				resolved.push(`${parent}${child}`)
			} else {
				resolved.push(`${parent} ${child}`)
			}
		}
	}
	return resolved.join(', ')
}

function normaliseAtRuleKey(key: string): string | null {
	if (key in BREAKPOINTS) {
		return BREAKPOINTS[key]
	}
	if (key.startsWith('@media')) {
		return key
	}
	if (key.startsWith('@supports')) {
		const condition = key.slice('@supports'.length).trim()
		return condition ? `@supports ${condition}` : '@supports'
	}
	if (key.startsWith('@container')) {
		return key
	}
	if (key.startsWith('@layer')) {
		const name = key.slice('@layer'.length).trim() || 'default'
		return `@layer ${name}`
	}
	return null
}

function compileKeyframes(name: string, frames: Record<string, any>): string {
	let css = `@keyframes ${name} {\n`
	for (const [stop, props] of Object.entries(frames)) {
		if (!isPlainObject(props)) continue
		const decls: string[] = []
		for (const [propKey, propVal] of Object.entries(props)) {
			if (typeof propVal === 'string' || typeof propVal === 'number') {
				decls.push(`    ${camelToKebab(propKey)}: ${addPxIfNeeded(propKey, propVal)};\n`)
			}
		}
		css += `  ${stop} {\n${decls.join('')}  }\n`
	}
	css += '}\n'
	return css
}

export interface StyleRule {
	wrappers: string[]
	selector: string
	decls: string[]
	isNestedSelector?: boolean
}

export interface CompiledStyle {
	className: string
	rules: StyleRule[]
	keyframes: string[]
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
	private canonicalByClass = new Map<string, string>()
	private globalObjects = new Map<string, Record<string, any>>()

	/**
	 * Compiles a style object and registers it in the collector.
	 * Returns the same class name for identical style objects (deduplication).
	 *
	 * @param styleObj - Raw style object from a `css({})` call.
	 * @returns Scoped class name string.
	 */
	addStyle(styleObj: any): string {
		if (!isPlainObject(styleObj)) {
			return 'next-0'
		}
		const normalised = normaliseStyleKeys(styleObj)
		const canonical = JSON.stringify(canonicalizeObject(normalised))
		const baseHash = generateClassHash(normalised)
		let className = `next-${baseHash}`
		let attempt = 0
		while (this.styles.has(className)) {
			if (this.canonicalByClass.get(className) === canonical) {
				return className
			}
			attempt++
			className = `next-${generateClassHash(`${canonical}#${attempt}`)}`
		}
		const rules: StyleRule[] = []
		const keyframes: string[] = []
		this.walk(`.${className}`, normalised, [], { rules, keyframes }, false)
		this.styles.set(className, { className, rules, keyframes })
		this.canonicalByClass.set(className, canonical)
		return className
	}

	/**
	 * Registers a global style rule (no scoped class).
	 * If the selector was previously registered, subsequent styles are deep-merged and recompiled.
	 *
	 * @param selector - CSS selector string, e.g. `"body"` or `"h1, h2"`.
	 * @param styleObj - Style properties to apply to the selector.
	 */
	addGlobalStyle(selector: string, styleObj: any): void {
		if (!isPlainObject(styleObj)) return
		const normalised = normaliseStyleKeys(styleObj)
		const existing = this.globalObjects.get(selector)
		const merged = existing ? deepMergeObjects(existing, normalised) : normalised
		this.globalObjects.set(selector, merged)

		const key = `global:${selector}`
		const rules: StyleRule[] = []
		const keyframes: string[] = []

		if (selector.startsWith('@keyframes ') || selector === '@keyframes') {
			this.walk('', { [selector]: merged }, [], { rules, keyframes }, false)
		} else {
			this.walk(selector, merged, [], { rules, keyframes }, false)
		}

		this.styles.set(key, {
			className: key,
			rules,
			keyframes
		})
	}

	private walk(
		selector: string,
		node: Record<string, any>,
		wrappers: string[],
		out: { rules: StyleRule[]; keyframes: string[] },
		isNestedSelector: boolean
	): void {
		const decls: string[] = []
		const nested: Array<[string, Record<string, any>]> = []

		for (const [key, value] of Object.entries(node)) {
			if (typeof value === 'string' || typeof value === 'number') {
				const prop = camelToKebab(key)
				const formattedVal = addPxIfNeeded(key, value)
				decls.push(`${prop}: ${formattedVal};`)
			} else if (isPlainObject(value)) {
				nested.push([key, value])
			}
		}

		if (decls.length > 0 && selector) {
			out.rules.push({
				wrappers: [...wrappers],
				selector,
				decls,
				isNestedSelector
			})
		}

		for (const [key, value] of nested) {
			if (key.startsWith('@keyframes ')) {
				const name = key.slice('@keyframes '.length).trim()
				if (name) {
					out.keyframes.push(compileKeyframes(name, value))
				}
				continue
			}
			if (key === '@keyframes') {
				for (const [name, frames] of Object.entries(value)) {
					if (isPlainObject(frames)) {
						out.keyframes.push(compileKeyframes(name, frames))
					}
				}
				continue
			}

			const atRule = normaliseAtRuleKey(key)
			if (atRule) {
				this.walk(selector, value, [...wrappers, atRule], out, isNestedSelector)
				continue
			}

			const nextSelector = selector ? resolveSelector(selector, key) : key
			this.walk(nextSelector, value, wrappers, out, true)
		}
	}

	/**
	 * Serialises all collected styles into a single CSS string.
	 *
	 * Output order:
	 * 1. `@keyframes` blocks (deduplicated)
	 * 2. Base class and global rules
	 * 3. Pseudo-class/element and nested selector rules
	 * 4. `@layer` blocks
	 * 5. `@supports` blocks
	 * 6. `@container` blocks
	 * 7. Media queries (`min-width` ascending, `max-width` descending, others in insertion order)
	 *
	 * @returns Full CSS string ready to be injected or written to a file.
	 */
	getAllStyles(): string {
		const keyframesSet = new Set<string>()
		const baseRules: string[] = []
		const pseudoRules: string[] = []
		const wrappedGroups = new Map<string, { wrappers: string[]; rules: StyleRule[]; index: number }>()
		let groupIndex = 0

		for (const style of this.styles.values()) {
			for (const kf of style.keyframes) {
				if (kf && !keyframesSet.has(kf)) {
					keyframesSet.add(kf)
				}
			}

			for (const rule of style.rules) {
				if (rule.decls.length === 0) continue
				if (rule.wrappers.length === 0) {
					const formatted = this.formatSingleRule(rule, '  ')
					if (rule.isNestedSelector) {
						pseudoRules.push(formatted)
					} else {
						baseRules.push(formatted)
					}
				} else {
					const groupKey = rule.wrappers.join('\0')
					let group = wrappedGroups.get(groupKey)
					if (!group) {
						group = { wrappers: rule.wrappers, rules: [], index: groupIndex++ }
						wrappedGroups.set(groupKey, group)
					}
					const existingRule = group.rules.find(r => r.selector === rule.selector)
					if (existingRule) {
						existingRule.decls.push(...rule.decls)
					} else {
						group.rules.push({
							wrappers: rule.wrappers,
							selector: rule.selector,
							decls: [...rule.decls]
						})
					}
				}
			}
		}

		let allCss = ''
		for (const kf of keyframesSet) {
			allCss += `${kf}\n`
		}
		for (const rule of baseRules) {
			allCss += `${rule}\n`
		}
		for (const rule of pseudoRules) {
			allCss += `${rule}\n`
		}

		const sortedGroups = this.sortWrapperGroups(Array.from(wrappedGroups.values()))
		for (const group of sortedGroups) {
			allCss += `${this.formatWrappedGroup(group.wrappers, group.rules)}\n`
		}

		return allCss
	}

	private formatSingleRule(rule: StyleRule, declIndent: string, ruleIndent = ''): string {
		const body = rule.decls.map(d => `${declIndent}${d}`).join('\n')
		return `${ruleIndent}${rule.selector} {\n${body}\n${ruleIndent}}`
	}

	private formatWrappedGroup(wrappers: string[], rules: StyleRule[]): string {
		const depth = wrappers.length
		const ruleIndent = '  '.repeat(depth)
		const declIndent = '  '.repeat(depth + 1)
		let content = rules.map(rule => this.formatSingleRule(rule, declIndent, ruleIndent)).join('\n')
		for (let i = depth - 1; i >= 0; i--) {
			const indent = '  '.repeat(i)
			content = `${indent}${wrappers[i]} {\n${content}\n${indent}}`
		}
		return content
	}

	private sortWrapperGroups<T extends { wrappers: string[]; index: number }>(groups: T[]): T[] {
		const classify = (group: T) => {
			const primary = group.wrappers[0] ?? ''
			if (primary.startsWith('@layer')) return { category: 0, mediaKind: 2, mediaVal: 0 }
			if (primary.startsWith('@supports')) return { category: 1, mediaKind: 2, mediaVal: 0 }
			if (primary.startsWith('@container')) return { category: 2, mediaKind: 2, mediaVal: 0 }
			if (primary.startsWith('@media')) {
				const minMatch = primary.match(/min-width:\s*([\d.]+)px/)
				if (minMatch) {
					return { category: 3, mediaKind: 0, mediaVal: Number.parseFloat(minMatch[1]) }
				}
				const maxMatch = primary.match(/max-width:\s*([\d.]+)px/)
				if (maxMatch) {
					return { category: 3, mediaKind: 1, mediaVal: Number.parseFloat(maxMatch[1]) }
				}
				return { category: 3, mediaKind: 2, mediaVal: 0 }
			}
			return { category: 4, mediaKind: 2, mediaVal: 0 }
		}

		return [...groups].sort((a, b) => {
			const ca = classify(a)
			const cb = classify(b)
			if (ca.category !== cb.category) return ca.category - cb.category
			if (ca.mediaKind !== cb.mediaKind) return ca.mediaKind - cb.mediaKind
			if (ca.mediaKind === 0) return ca.mediaVal - cb.mediaVal || a.index - b.index
			if (ca.mediaKind === 1) return cb.mediaVal - ca.mediaVal || a.index - b.index
			return a.index - b.index
		})
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
