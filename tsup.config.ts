import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		'postcss-plugin/index': 'src/postcss-plugin/index.ts'
	},
	external: ['csstype'],
	sourcemap: false,
	splitting: false,
	format: 'esm',
	bundle: true,
	minify: true,
	clean: true,
	shims: true,
	dts: true
})
