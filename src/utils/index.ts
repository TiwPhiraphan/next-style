/**
 * Set of CSS property names (camelCase and kebab-case) that accept unitless numbers.
 */
const UNITLESS_PROPERTIES = new Set([
	'animationIterationCount',
	'animation-iteration-count',
	'borderImageOutset',
	'border-image-outset',
	'borderImageSlice',
	'border-image-slice',
	'borderImageWidth',
	'border-image-width',
	'boxFlex',
	'box-flex',
	'boxFlexGroup',
	'box-flex-group',
	'boxOrdinalGroup',
	'box-ordinal-group',
	'columnCount',
	'column-count',
	'columns',
	'flex',
	'flexGrow',
	'flex-grow',
	'flexPositive',
	'flex-positive',
	'flexShrink',
	'flex-shrink',
	'flexNegative',
	'flex-negative',
	'flexOrder',
	'flex-order',
	'gridArea',
	'grid-area',
	'gridRow',
	'grid-row',
	'gridRowEnd',
	'grid-row-end',
	'gridRowSpan',
	'grid-row-span',
	'gridRowStart',
	'grid-row-start',
	'gridColumn',
	'grid-column',
	'gridColumnEnd',
	'grid-column-end',
	'gridColumnSpan',
	'grid-column-span',
	'gridColumnStart',
	'grid-column-start',
	'fontWeight',
	'font-weight',
	'lineClamp',
	'line-clamp',
	'lineHeight',
	'line-height',
	'opacity',
	'order',
	'orphans',
	'tabSize',
	'tab-size',
	'widows',
	'zIndex',
	'z-index',
	'zoom',
	'fillOpacity',
	'fill-opacity',
	'floodOpacity',
	'flood-opacity',
	'stopOpacity',
	'stop-opacity',
	'strokeDasharray',
	'stroke-dasharray',
	'strokeDashoffset',
	'stroke-dashoffset',
	'strokeMiterlimit',
	'stroke-miterlimit',
	'strokeOpacity',
	'stroke-opacity',
	'strokeWidth',
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
	if (typeof value === 'number' && value !== 0 && !UNITLESS_PROPERTIES.has(prop)) {
		return `${value}px`
	}
	return value
}

/**
 * Recursively canonicalizes an object by sorting its keys alphabetically.
 * Ensures consistent serialization regardless of property insertion order.
 */
function canonicalizeObject(obj: any): any {
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
