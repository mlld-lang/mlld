import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

export default defineConfig([
  // API build - both CJS and ESM
  {
    entry: {
      index: 'api/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: true,
    treeshake: true,
    outDir: 'dist',
    tsconfig: 'tsconfig.build.json',
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
      };
      options.define = {
        ...options.define,
        '__VERSION__': `"${packageJson.version}"`
      };
    }
  },
  // CLI build - CJS only
  {
    entry: {
      cli: 'cli/index.ts',
    },
    format: 'cjs',
    dts: true,
    clean: false,
    sourcemap: true,
    treeshake: true,
    outDir: 'dist',
    tsconfig: 'tsconfig.build.json',
    external: [
      'meld-ast',
      'meld-spec',
      'llmxml',
      'marked',
      'minimatch',
      'winston',
      'yargs'
    ],
    banner: {
      js: '#!/usr/bin/env node'
    },
    esbuildOptions(options) {
      options.alias = {
        '@core': './core',
        '@services': './services',
        '@tests': './tests'
      };
      options.define = {
        ...options.define,
        '__VERSION__': `"${packageJson.version}"`
      };
    }
  }
]); 