import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		'postcss-plugin/index': 'src/postcss-plugin/index.ts'
	},
	external: ['csstype'],
	format: ['esm', 'cjs'],
	splitting: false,
	sourcemap: false,
	minify: true,
	bundle: true,
	clean: true,
	shims: true,
	dts: true
})
