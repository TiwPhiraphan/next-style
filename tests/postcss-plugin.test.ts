import { describe, expect, it } from 'bun:test'
import postcss from 'postcss'
import nextStylePlugin, { extractBalancedBraces, safeEvalObject } from '../src/postcss-plugin'

describe('postcss-plugin', () => {
	it('should support @import "next-style" in CSS', async () => {
		const input = '@import "next-style";\nbody { color: red; }'
		const result = await postcss([nextStylePlugin()]).process(input, { from: undefined })
		expect(result.css).toContain('body { color: red; }')
	})

	it('should support @import url("next-style") in CSS', async () => {
		const input = '@import url("next-style");\nbody { color: blue; }'
		const result = await postcss([nextStylePlugin()]).process(input, { from: undefined })
		expect(result.css).toContain('body { color: blue; }')
	})

	describe('extractBalancedBraces', () => {
		it('should extract simple object literal', () => {
			const code = 'const s = css({ color: "red" });'
			const start = code.indexOf('{')
			expect(extractBalancedBraces(code, start)).toBe('{ color: "red" }')
		})

		it('should correctly extract objects containing template literals with expressions', () => {
			const code = `const s = css({ content: \`\${'myVar'}\`, color: "red" });`
			const start = code.indexOf('{')
			expect(extractBalancedBraces(code, start)).toBe(`{ content: \`\${'myVar'}\`, color: "red" }`)
		})

		it('should correctly ignore braces inside JS comments', () => {
			const code = `css({
				// comment with }
				color: "red"
			})`
			const start = code.indexOf('{')
			const extracted = extractBalancedBraces(code, start)
			expect(extracted).not.toBeNull()
			expect(extracted).toContain('color: "red"')
		})
	})

	describe('safeEvalObject', () => {
		it('should evaluate static object literal', () => {
			expect(safeEvalObject('{ color: "red", fontSize: 16 }')).toEqual({ color: 'red', fontSize: 16 })
		})

		it('should not throw on spreads and unresolved variables', () => {
			const result = safeEvalObject('{ ...theme.btn, color: "blue" }')
			expect(result).not.toBeNull()
			expect(result?.color).toBe('blue')
		})
	})
})
