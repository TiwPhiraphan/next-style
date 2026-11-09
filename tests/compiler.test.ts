import { describe, expect, it } from 'bun:test'
import { StyleCollector } from '../src/compiler'

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
		expect(output.match(/\.ns-[a-z0-9]+\s*\{\s*\}/)).toBeNull()
	})
})
