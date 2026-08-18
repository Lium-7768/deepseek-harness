import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  outExtensions: ({ format }) => ({ js: format === 'es' ? '.mjs' : '.cjs' }),
  dts: true,
  clean: true,
  outDir: 'lib',
})
