/**
 * Converts a camelCase CSS property name to kebab-case.
 *
 * @param str - camelCase string, e.g. `"backgroundColor"`.
 * @returns kebab-case string, e.g. `"background-color"`.
 *
 * @example
 * camelToKebab('fontSize')        // "font-size"
 * camelToKebab('borderTopWidth')  // "border-top-width"
 */
export function camelToKebab(str: string): string {
	return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

/**
 * Generates a short, stable hash string from a style object or string.
 * Used to produce unique class name suffixes (e.g. `"ns-1x2y3z"`).
 *
 * @param styles - Style object or pre-serialised string.
 * @returns Base-36 hash string.
 */
export function generateClassHash(styles: any): string {
	const str = typeof styles === 'string' ? styles : JSON.stringify(styles)
	let hash = 2166136261
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i)
		hash = (hash * 16777619) >>> 0
	}
	return hash.toString(36)
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
 *
 * @example
 * normalizeMediaQuery('@md')                        // "@media (min-width: 768px)"
 * normalizeMediaQuery('@media (max-width: 600px)')  // "@media (max-width: 600px)"
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
	if (typeof value === 'object' && !Array.isArray(value)) {
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
		const serialized = JSON.stringify(value)
		if (!seen.has(serialized)) {
			seen.add(serialized)
			deduplicated.set(key, value)
		}
	})
	return deduplicated
}
