import { describe, expect, it } from 'bun:test'
import { StyleCollector } from '../src/compiler'
import { generateClassHash } from '../src/utils'

describe('compiler', () => {
	it('should automatically append px to numeric dimension values', () => {
		const collector = new StyleCollector()
		collector.addStyle({
			fontSize: 16,
			width: 200,
			zIndex: 10,
			opacity: 0.5,
			lineHeight: 1.5,
			margin: 0
		})
		const output = collector.getAllStyles()
		expect(output).toContain('font-size: 16px;')
		expect(output).toContain('width: 200px;')
		expect(output).toContain('z-index: 10;')
		expect(output).toContain('opacity: 0.5;')
		expect(output).toContain('line-height: 1.5;')
		expect(output).toContain('margin: 0;')
	})

	it('should wrap @layer declarations with the class selector', () => {
		const collector = new StyleCollector()
		const className = collector.addStyle({
			'@layer utilities': {
				color: 'red'
			}
		})
		const output = collector.getAllStyles()
		expect(output).toContain(`@layer utilities {\n  .${className} {\n    color: red;\n  }\n}`)
		expect(output).not.toContain('@layer utilities {\n  color: red;\n}')
	})

	it('should prefix all comma-separated pseudo classes with the class selector', () => {
		const collector = new StyleCollector()
		const className = collector.addStyle({
			':hover, :focus': {
				color: 'blue'
			}
		})
		const output = collector.getAllStyles()
		expect(output).toContain(`.${className}:hover, .${className}:focus`)
		expect(output).not.toContain(`.${className}:hover, :focus`)
	})

	it('should support & selectors (nesting)', () => {
		const collector = new StyleCollector()
		const className = collector.addStyle({
			color: 'black',
			'&:hover': {
				color: 'red'
			},
			'&.active': {
				fontWeight: 'bold'
			},
			'& > span': {
				fontSize: 14
			}
		})
		const output = collector.getAllStyles()
		expect(output).toContain(`.${className}:hover {\n  color: red;\n}`)
		expect(output).toContain(`.${className}.active {\n  font-weight: bold;\n}`)
		expect(output).toContain(`.${className} > span {\n  font-size: 14px;\n}`)
	})

	it('should merge duplicate global styles and support media queries inside global', () => {
		const collector = new StyleCollector()
		collector.addGlobalStyle('body', {
			margin: 0,
			'@md': {
				margin: 20
			}
		})
		collector.addGlobalStyle('body', {
			color: 'black'
		})
		const output = collector.getAllStyles()
		expect(output).toContain('margin: 0;')
		expect(output).toContain('color: black;')
		expect(output).toContain('@media (min-width: 768px)')
		expect(output).toContain('body {\n    margin: 20px;\n  }')
	})

	it('should sort media queries mobile-first globally across components', () => {
		const collector = new StyleCollector()
		// Component 1 uses @md (768px)
		collector.addStyle({
			color: 'red',
			'@md': { color: 'blue' }
		})
		// Component 2 uses @sm (640px)
		collector.addStyle({
			padding: 10,
			'@sm': { padding: 20 }
		})

		const output = collector.getAllStyles()
		const smIndex = output.indexOf('640px')
		const mdIndex = output.indexOf('768px')
		expect(smIndex).toBeGreaterThan(-1)
		expect(mdIndex).toBeGreaterThan(-1)
		// 640px (@sm) must appear before 768px (@md) globally!
		expect(smIndex).toBeLessThan(mdIndex)
	})

	it('should not emit empty base rules when normalStyles is empty', () => {
		const collector = new StyleCollector()
		collector.addStyle({
			'@md': { color: 'red' }
		})
		const output = collector.getAllStyles()
		// Should not have a base rule with nothing inside
		expect(output.match(/\.next-[a-z0-9]+\s*\{\s*\}/)).toBeNull()
	})

	it('should merge @md and @media (min-width: 768px) in the same object without losing properties', () => {
		const collector = new StyleCollector()
		const className = collector.addStyle({
			'@md': { color: 'red' },
			'@media (min-width: 768px)': { padding: 12 }
		})
		const output = collector.getAllStyles()
		expect(output).toContain(
			`@media (min-width: 768px) {\n  .${className} {\n    color: red;\n    padding: 12px;\n  }\n}`
		)
	})

	it('should deep-merge repeated global() calls for the same selector including @md', () => {
		const collector = new StyleCollector()
		collector.addGlobalStyle('body', {
			margin: 0,
			'@md': { fontSize: 16 }
		})
		collector.addGlobalStyle('body', {
			color: 'black',
			'@md': { padding: 20 }
		})
		const output = collector.getAllStyles()
		expect(output).toContain('margin: 0;')
		expect(output).toContain('color: black;')
		expect(output).toContain('font-size: 16px;')
		expect(output).toContain('padding: 20px;')
		expect(output.match(/@media \(min-width: 768px\)/g)?.length).toBe(1)
	})

	it('should compile nested pseudo and @md in both nesting orders', () => {
		const collector = new StyleCollector()
		const c1 = collector.addStyle({
			':hover': {
				'@md': { color: 'red' }
			}
		})
		const c2 = collector.addStyle({
			'@md': {
				':hover': { backgroundColor: 'blue' }
			}
		})
		const output = collector.getAllStyles()
		expect(output).toContain(
			`@media (min-width: 768px) {\n  .${c1}:hover {\n    color: red;\n  }\n  .${c2}:hover {\n    background-color: blue;\n  }\n}`
		)
	})

	it('should support @keyframes and @supports inside global()', () => {
		const collector = new StyleCollector()
		collector.addGlobalStyle('body', {
			'@keyframes fadeIn': {
				from: { opacity: 0 },
				to: { opacity: 1 }
			},
			'@supports (display: grid)': {
				display: 'grid'
			}
		})
		const output = collector.getAllStyles()
		expect(output).toContain('@keyframes fadeIn {\n  from {\n    opacity: 0;\n  }\n  to {\n    opacity: 1;\n  }\n}')
		expect(output).toContain('@supports (display: grid) {\n  body {\n    display: grid;\n  }\n}')
	})

	it('should leave --custom-props, aspectRatio, and WebkitLineClamp unitless', () => {
		const collector = new StyleCollector()
		collector.addStyle({
			'--x': 10,
			aspectRatio: 1.5,
			WebkitLineClamp: 3
		})
		const output = collector.getAllStyles()
		expect(output).toContain('--x: 10;')
		expect(output).toContain('aspect-ratio: 1.5;')
		expect(output).toContain('-webkit-line-clamp: 3;')
		expect(output).not.toContain('10px')
		expect(output).not.toContain('1.5px')
		expect(output).not.toContain('3px')
	})

	it('should sort min-width ascending and max-width descending while preserving other media queries', () => {
		const collector = new StyleCollector()
		collector.addStyle({
			'@media (prefers-reduced-motion: reduce)': { transition: 'none' },
			'@media (max-width: 600px)': { fontSize: 12 },
			'@media (max-width: 1024px)': { fontSize: 14 },
			'@lg': { fontSize: 18 },
			'@sm': { fontSize: 15 }
		})
		const output = collector.getAllStyles()
		const smIdx = output.indexOf('min-width: 640px')
		const lgIdx = output.indexOf('min-width: 1024px')
		const max1024Idx = output.indexOf('max-width: 1024px')
		const max600Idx = output.indexOf('max-width: 600px')
		const motionIdx = output.indexOf('prefers-reduced-motion: reduce')

		expect(smIdx).toBeGreaterThan(-1)
		expect(lgIdx).toBeGreaterThan(smIdx)
		expect(max1024Idx).toBeGreaterThan(lgIdx)
		expect(max600Idx).toBeGreaterThan(max1024Idx)
		expect(motionIdx).toBeGreaterThan(max600Idx)
	})

	it('should assign distinct class names when two different styles collide on 32-bit hash', () => {
		const s1 = { color: 'Aa' }
		const s2 = { color: 'BB' }
		expect(generateClassHash(s1)).toBe(generateClassHash(s2))

		const collector = new StyleCollector()
		const c1 = collector.addStyle(s1)
		const c2 = collector.addStyle(s2)
		expect(c1).not.toBe(c2)
		expect(collector.addStyle(s1)).toBe(c1)
		expect(collector.addStyle(s2)).toBe(c2)

		const output = collector.getAllStyles()
		expect(output).toContain(`.${c1} {\n  color: Aa;\n}`)
		expect(output).toContain(`.${c2} {\n  color: BB;\n}`)
	})
})
