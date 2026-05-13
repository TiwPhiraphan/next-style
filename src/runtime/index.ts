import type { Properties, Pseudos } from 'csstype'
import { StyleCollector } from '../compiler'

/**
 * CSS properties with full type safety and autocomplete via csstype.
 * Accepts both string and number values (e.g. `fontSize: 16` or `fontSize: '16px'`).
 */
export type CSSProperties = Properties<string | number>

/** @internal Mapped type for pseudo-classes/elements — avoids index signature limitation */
type PseudoStyles = { [P in Pseudos]?: CSSProperties }

/** @internal At-rule keys (@media, @container, @supports, @layer, @keyframes) */
type AtRuleStyles = {
	'@sm'?: CSSProperties
	'@md'?: CSSProperties
	'@lg'?: CSSProperties
	'@xl'?: CSSProperties
	'@2xl'?: CSSProperties
	[media: `@media ${string}`]: CSSProperties
	[container: `@container ${string}`]: CSSProperties
	[supports: `@supports ${string}`]: CSSProperties
	[layer: `@layer ${string}`]: CSSProperties
	[keyframes: `@keyframes ${string}`]: Record<string, CSSProperties>
}

/**
 * Style object passed to `css()` and `global()`.
 *
 * Supports:
 * - All CSS properties (typed via csstype)
 * - Responsive breakpoints: `'@sm'`, `'@md'`, `'@lg'`, `'@xl'`, `'@2xl'`
 * - Arbitrary media queries: `'@media (min-width: 900px)'`
 * - Pseudo-classes and pseudo-elements: `':hover'`, `'::before'`, etc.
 * - Container queries: `'@container sidebar (min-width: 300px)'`
 * - Feature queries: `'@supports (display: grid)'`
 * - Keyframe animations: `'@keyframes fadeIn'`
 * - Cascade layers: `'@layer utilities'`
 *
 * @example
 * const style: CSSObject = {
 *   fontSize: '16px',
 *   '@md': { fontSize: '20px' },
 *   ':hover': { color: 'blue' },
 *   '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
 * }
 */
export type CSSObject = CSSProperties &
	PseudoStyles &
	AtRuleStyles & {
		[key: string]: any
	}

/**
 * Converts a style object into a unique CSS class name.
 *
 * Styles are collected at build time by the PostCSS plugin and emitted as
 * a single static CSS file — there is zero runtime overhead in production.
 * Identical style objects always return the same class name (deduplication).
 *
 * @param styles - A `CSSObject` describing the styles for this element.
 * @returns A stable class name string (e.g. `"ns-1x2y3z"`).
 *
 * @example
 * const button = css({
 *   padding: '8px 16px',
 *   borderRadius: '6px',
 *   backgroundColor: '#7F77DD',
 *   ':hover': { backgroundColor: '#534AB7' },
 *   '@md': { padding: '10px 20px' },
 * })
 *
 * export function Button() {
 *   return <button className={button}>Click me</button>
 * }
 */
export function css(styles: CSSObject): string {
	return collector.addStyle(styles)
}

/**
 * Registers global CSS styles applied directly to selectors (no scoped class).
 *
 * Useful for CSS resets, base typography, and third-party element overrides.
 * Like `css()`, styles are extracted at build time — no runtime cost.
 *
 * @param styles - A record mapping CSS selectors to `CSSObject` style definitions.
 *
 * @example
 * global({
 *   '*': { boxSizing: 'border-box', margin: '0' },
 *   'body': { fontFamily: 'Inter, sans-serif', lineHeight: '1.6' },
 *   'h1, h2, h3': { fontWeight: 500 },
 * })
 */
export function global(styles: Record<string, CSSObject>): void {
	Object.entries(styles).forEach(([selector, styleObj]) => {
		collector.addGlobalStyle(selector, styleObj)
	})
}

/**
 * The shared `StyleCollector` instance.
 *
 * Consumed by the PostCSS plugin at build time to drain all registered styles
 * into the output CSS file. Not intended for direct use in application code.
 *
 * @internal
 */
export { collector as styleCollector }

const collector = new StyleCollector()

/** @deprecated Use `styleCollector` instead. */
export const styleRegistry = {
	get: (key: string) => collector.getStyleMap().get(key),
	getAllStyles: () => collector.getAllStyles()
}
