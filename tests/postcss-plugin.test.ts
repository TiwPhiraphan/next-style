import { describe, expect, it, spyOn } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { createTransformer, StyleCollector } from '../src/compiler'
import nextStylePlugin, { scanFile } from '../src/postcss-plugin'

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

	describe('scanFile', () => {
		it('should extract static css() and global() calls with literals, negative numbers, and type assertions', () => {
			const collector = new StyleCollector()
			const code = `
				const a = css({
					color: "red",
					fontSize: 16,
					marginTop: -8,
					content: \`"ok"\`
				} as const)
				const b = css(({ padding: 12 }) satisfies Record<string, unknown>)
				global({
					body: { margin: 0 }
				})
			`
			const found = scanFile(code, collector, 'test.tsx')
			expect(found).toBe(3)
			const cssOut = collector.getAllStyles()
			expect(cssOut).toContain('color: red;')
			expect(cssOut).toContain('font-size: 16px;')
			expect(cssOut).toContain('margin-top: -8px;')
			expect(cssOut).toContain('padding: 12px;')
			expect(cssOut).toContain('body {\n  margin: 0;\n}')
		})

		it('should handle regex literals containing } and comments containing }', () => {
			const collector = new StyleCollector()
			const code = `
				const re = /}/
				const s = css({
					// comment with }
					color: "red",
					/* block } comment */
					padding: 8
				})
			`
			const found = scanFile(code, collector, 'regex.ts')
			expect(found).toBe(1)
			const cssOut = collector.getAllStyles()
			expect(cssOut).toContain('color: red;')
			expect(cssOut).toContain('padding: 8px;')
		})

		it('should never execute side effects like (globalThis.X = 1) during scanning', () => {
			const collector = new StyleCollector()
			const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
			;(globalThis as any).X = undefined
			const code = `
				const bad = css({
					color: (globalThis.X = 1, "red")
				})
			`
			const found = scanFile(code, collector, 'evil.ts')
			expect(found).toBe(0)
			expect((globalThis as any).X).toBeUndefined()
			expect(warnSpy).toHaveBeenCalled()
			warnSpy.mockRestore()
		})

		it('should warn with file:line and skip dynamic values without emitting broken CSS', () => {
			const collector = new StyleCollector()
			const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
			const code = `const color = "red";\nconst s = css({ color, fontSize: 16 });\nconst s2 = css({ ...base, margin: 4 });\nconst s3 = css({ [key]: 1 });\nconst s4 = css({ width: getWidth() });\nconst s5 = css({ display: ok ? 'block' : 'none' });`
			const found = scanFile(code, collector, 'app/page.tsx')
			expect(found).toBe(0)
			expect(collector.getAllStyles()).toBe('')
			expect(collector.getAllStyles()).not.toContain(': ;')
			expect(warnSpy).toHaveBeenCalledTimes(5)
			expect(warnSpy.mock.calls[0][0]).toContain('app/page.tsx:2')
			warnSpy.mockRestore()
		})
	})

	it('end-to-end: scans multi-file project and matches runtime css() class names to emitted CSS', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-style-e2e-'))
		try {
			fs.mkdirSync(path.join(tmpDir, 'src', 'components'), { recursive: true })
			fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true })
			fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'fixture-app' }))

			const buttonStyles = {
				padding: '8px 16px',
				backgroundColor: '#7F77DD',
				':hover': {
					'@md': { backgroundColor: '#534AB7' }
				}
			} as const

			const cardStyles = {
				aspectRatio: 1.5,
				'--card-gap': 12,
				'@md': { padding: 24 }
			} as const

			fs.writeFileSync(
				path.join(tmpDir, 'src', 'components', 'Button.tsx'),
				`import { css } from 'next-style'
export const buttonClass = css({
  padding: '8px 16px',
  backgroundColor: '#7F77DD',
  ':hover': {
    '@md': { backgroundColor: '#534AB7' }
  }
})
export function Button() { return <button className={buttonClass}>Click</button> }`
			)

			fs.writeFileSync(
				path.join(tmpDir, 'src', 'components', 'Card.tsx'),
				`import { css, global } from 'next-style'
global({
  body: {
    margin: 0,
    '@supports (display: grid)': { display: 'grid' }
  }
})
export const cardClass = css({
  aspectRatio: 1.5,
  '--card-gap': 12,
  '@md': { padding: 24 }
})`
			)

			const globalsCssPath = path.join(tmpDir, 'app', 'globals.css')
			fs.writeFileSync(globalsCssPath, '@import "next-style";\n')

			const { transformCssCall } = createTransformer()
			const runtimeButtonClass = transformCssCall(buttonStyles)
			const runtimeCardClass = transformCssCall(cardStyles)

			const prevNodeEnv = process.env.NODE_ENV
			process.env.NODE_ENV = 'development'
			try {
				const result = await postcss([nextStylePlugin()]).process('@import "next-style";\n', {
					from: globalsCssPath
				})
				expect(result.css).toContain(`.${runtimeButtonClass}`)
				expect(result.css).toContain('padding: 8px 16px;')
				expect(result.css).toContain(`.${runtimeButtonClass}:hover`)
				expect(result.css).toContain('background-color: #534AB7;')
				expect(result.css).toContain(`.${runtimeCardClass}`)
				expect(result.css).toContain('aspect-ratio: 1.5;')
				expect(result.css).toContain('--card-gap: 12;')
				expect(result.css).toContain('padding: 24px;')
				expect(result.css).toContain('@supports (display: grid)')
				expect(result.css).toContain('body')
			} finally {
				process.env.NODE_ENV = prevNodeEnv
			}
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})
})
