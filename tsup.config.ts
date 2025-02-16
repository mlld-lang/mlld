import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'api/index.ts',
    cli: 'cli/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  treeshake: true,
  outDir: 'dist',
  external: [
    'meld-ast',
    'meld-spec',
    'llmxml',
    'marked',
    'minimatch',
    'winston',
    'yargs'
  ],
  esbuildOptions(options) {
    options.alias = {
      '@core': './core',
      '@services': './services',
      '@tests': './tests'
    }
  }
}); 