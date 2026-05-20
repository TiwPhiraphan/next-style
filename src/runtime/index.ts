import type { Properties, Pseudos } from 'csstype'
import { StyleCollector } from '../compiler'

export type CSSProperties = Properties<string | number>

type PseudoStyles = { [P in Pseudos]?: CSSProperties }

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
 */
export type CSSObject = CSSProperties &
	PseudoStyles &
	AtRuleStyles & {
		[key: string]: any
	}

/**
 * Converts a style object into a unique CSS class name.
 * Styles are collected at build time by the PostCSS plugin and emitted as
 * a single static CSS file — there is zero runtime overhead in production.
 *
 * @example
 * const button = css({
 *   padding: '8px 16px',
 *   backgroundColor: '#7F77DD',
 *   ':hover': { backgroundColor: '#534AB7' },
 *   '@md': { padding: '10px 20px' },
 * })
 */
export function css(styles: CSSObject): string {
	const className = collector.addStyle(styles)
	if (typeof window === 'undefined') {
		collector.flush()
	}
	return className
}

/**
 * Registers global CSS styles applied directly to selectors (no scoped class).
 *
 * @example
 * global({
 *   '*': { boxSizing: 'border-box', margin: '0' },
 *   'body': { fontFamily: 'Inter, sans-serif', lineHeight: '1.6' },
 * })
 */
export function global(styles: Record<string, CSSObject>): void {
	Object.entries(styles).forEach(([selector, styleObj]) => {
		collector.addGlobalStyle(selector, styleObj)
	})
	if (typeof window === 'undefined') {
		collector.flush()
	}
}

/** @internal Consumed by the PostCSS plugin at build time. */
export { collector as styleCollector }

const collector = new StyleCollector()
