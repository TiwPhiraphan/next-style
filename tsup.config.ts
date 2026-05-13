import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		'postcss-plugin/index': 'src/postcss-plugin/index.ts'
	},
	format: ['esm', 'cjs'],
	dts: true,
	sourcemap: false,
	clean: true,
	splitting: false,
	shims: true,
	minify: true
})
