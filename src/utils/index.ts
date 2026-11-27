/**
 * Set of kebab-case CSS property names that accept unitless numbers.
 */
const UNITLESS_PROPERTIES = new Set([
	'animation-iteration-count',
	'aspect-ratio',
	'border-image-outset',
	'border-image-slice',
	'border-image-width',
	'box-flex',
	'box-flex-group',
	'box-ordinal-group',
	'column-count',
	'columns',
	'flex',
	'flex-grow',
	'flex-positive',
	'flex-shrink',
	'flex-negative',
	'flex-order',
	'grid-area',
	'grid-row',
	'grid-row-end',
	'grid-row-span',
	'grid-row-start',
	'grid-column',
	'grid-column-end',
	'grid-column-span',
	'grid-column-start',
	'font-weight',
	'line-clamp',
	'line-height',
	'opacity',
	'order',
	'orphans',
	'tab-size',
	'widows',
	'z-index',
	'zoom',
	'fill-opacity',
	'flood-opacity',
	'stop-opacity',
	'stroke-dasharray',
	'stroke-dashoffset',
	'stroke-miterlimit',
	'stroke-opacity',
	'stroke-width',
	'scale'
])

/**
 * Converts a camelCase CSS property name to kebab-case.
 * Preserves CSS variables (starting with `--`) and handles `ms` vendor prefixes.
 *
 * @param str - Property name string, e.g. `"backgroundColor"`, `"--myVar"`.
 * @returns kebab-case string, e.g. `"background-color"`.
 */
export function camelToKebab(str: string): string {
	if (str.startsWith('--')) {
		return str
	}
	const kebab = str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
	if (kebab.startsWith('ms-')) {
		return `-${kebab}`
	}
	return kebab
}

/**
 * Appends 'px' to numeric CSS property values when appropriate (e.g. fontSize, width).
 * Leaves unitless properties (e.g. zIndex, opacity, lineHeight) and zero unchanged.
 *
 * @param prop - CSS property name in camelCase or kebab-case.
 * @param value - Property value to check and format.
 * @returns Formatted value with 'px' appended if needed.
 */
export function addPxIfNeeded(prop: string, value: any): string | number {
	if (typeof value !== 'number' || value === 0 || prop.startsWith('--')) {
		return value
	}
	const key = camelToKebab(prop).replace(/^-(webkit|moz|ms|o)-/, '')
	return UNITLESS_PROPERTIES.has(key) ? value : `${value}px`
}

/**
 * Recursively canonicalizes an object by sorting its keys alphabetically.
 * Ensures consistent serialization regardless of property insertion order.
 */
export function canonicalizeObject(obj: any): any {
	if (obj === null || typeof obj !== 'object') {
		return obj
	}
	if (Array.isArray(obj)) {
		return obj.map(canonicalizeObject)
	}
	const sortedKeys = Object.keys(obj).sort()
	const sortedObj: Record<string, any> = {}
	for (const key of sortedKeys) {
		sortedObj[key] = canonicalizeObject(obj[key])
	}
	return sortedObj
}

/**
 * Generates a short, stable hash string from a style object or string.
 * Used to produce unique class name suffixes (e.g. `"next-1x2y3z"`).
 *
 * Keys are canonicalized before hashing to ensure identical style objects
 * with different key orders always produce the exact same hash.
 *
 * @param styles - Style object or pre-serialised string.
 * @returns Base-36 hash string.
 */
export function generateClassHash(styles: any): string {
	if (styles === null || styles === undefined) {
		return '0'
	}
	const str = typeof styles === 'string' ? styles : JSON.stringify(canonicalizeObject(styles))
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash
	}
	return Math.abs(hash).toString(36)
}

/**
 * Shorthand breakpoint aliases mapped to their full `@media` query strings.
 *
 * | Key    | Expands to                          |
 * |--------|-------------------------------------|
 * | `@sm`  | `@media (min-width: 640px)`  |
 * | `@md`  | `@media (min-width: 768px)`  |
 * | `@lg`  | `@media (min-width: 1024px)` |
 * | `@xl`  | `@media (min-width: 1280px)` |
 * | `@2xl` | `@media (min-width: 1536px)` |
 */
export const BREAKPOINTS: Record<string, string> = {
	'@sm': '@media (min-width: 640px)',
	'@md': '@media (min-width: 768px)',
	'@lg': '@media (min-width: 1024px)',
	'@xl': '@media (min-width: 1280px)',
	'@2xl': '@media (min-width: 1536px)'
}

/**
 * Resolves a breakpoint shorthand to its full `@media` query string.
 * Passes through unrecognised strings unchanged.
 *
 * @param query - Shorthand key (e.g. `"@md"`) or an arbitrary media query.
 * @returns Full media query string (e.g. `"@media (min-width: 768px)"`).
 */
export function normalizeMediaQuery(query: string): string {
	return BREAKPOINTS[query] ?? query
}

/**
 * Returns `true` if the value is a valid CSS property value that can be
 * serialised to a declaration (string, number, or nested object).
 *
 * @param _key - CSS property name (unused, reserved for future validation).
 * @param value - Value to check.
 */
export function validateCSSProperty(_key: string, value: any): boolean {
	if (typeof value === 'string' || typeof value === 'number') {
		return true
	}
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		return true
	}
	return false
}

/**
 * Removes duplicate entries from a style map, keeping the first occurrence.
 * Two entries are considered duplicates when their serialised values are identical.
 *
 * @param styles - Map of class name → style data.
 * @returns New map with duplicates removed.
 */
export function deduplicateStyles(styles: Map<string, any>): Map<string, any> {
	const deduplicated = new Map<string, any>()
	const seen = new Set<string>()
	styles.forEach((value, key) => {
		const serialized = JSON.stringify(canonicalizeObject(value))
		if (!seen.has(serialized)) {
			seen.add(serialized)
			deduplicated.set(key, value)
		}
	})
	return deduplicated
}
