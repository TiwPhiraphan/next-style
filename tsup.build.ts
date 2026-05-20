import { build, type Options } from 'tsup'

const options: Options = {
	external: ['csstype'],
	sourcemap: false,
	splitting: false,
	target: 'node20',
    outDir: 'dist',
	bundle: true,
	minify: true,
	shims: true
}

await build({
    ...options,
    dts: true,
    clean: true,
    format: 'esm',
    name: 'index.js',
    entry: { index: 'src/index.ts' }
})
await build({
    ...options,
    dts: false,
    clean: false,
    format: 'cjs',
    name: 'index.cjs',
    entry: { index: 'src/index.ts' }
})

await build({
    ...options,
    dts: true,
    clean: false,
    format: 'esm',
    name: 'index.js',
    entry: { 'postcss-plugin/index': 'src/postcss-plugin/index.ts' }
})
await build({
    ...options,
    dts: false,
    clean: false,
    format: 'cjs',
    name: 'index.cjs',
    entry: { 'postcss-plugin/index': 'src/postcss-plugin/index.ts' }
})
