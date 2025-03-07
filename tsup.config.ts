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
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.mjs'
      }
    },
    tsconfig: 'tsconfig.build.json',
    external: [
      'meld-ast',
      'meld-spec',
      'llmxml',
      'marked',
      'minimatch',
      'winston',
      'yargs',
      'fs',
      'fs-extra',
      'graceful-fs',
      'path',
      'util',
      'child_process',
      'crypto',
      'fs/promises'
    ],
    noExternal: [
      // If there are any dependencies that should be bundled, list them here
    ],
    esbuildOptions(options, { format }) {
      options.alias = {
        '@core': './core',
        '@services': './services',
        '@parser': './parser',
        '@interpreter': './interpreter',
        '@output': './output',
        '@cli': './cli',
        '@sdk': './api',
        '@api': './api',
        '@tests': './tests'
      };
      options.define = {
        ...options.define,
        '__VERSION__': `"${packageJson.version}"`
      };
      
      options.platform = 'node';
      
      if (format === 'esm') {
        options.mainFields = ['module', 'main'];
        options.conditions = ['import', 'module', 'require', 'default'];
      }
    }
  },
  // CLI build - CJS only
  {
    entry: {
      cli: 'cli/cli-entry.ts',
    },
    format: 'cjs',
    dts: true,
    clean: false,
    sourcemap: true,
    treeshake: true,
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: '.cjs'
      }
    },
    tsconfig: 'tsconfig.build.json',
    external: [
      'meld-ast',
      'meld-spec',
      'llmxml',
      'marked',
      'minimatch',
      'winston',
      'yargs',
      'fs',
      'fs-extra',
      'graceful-fs',
      'path',
      'util',
      'child_process',
      'crypto',
      'fs/promises'
    ],
    banner: {
      js: '#!/usr/bin/env node'
    },
    esbuildOptions(options) {
      options.alias = {
        '@core': './core',
        '@services': './services',
        '@parser': './parser',
        '@interpreter': './interpreter',
        '@output': './output',
        '@cli': './cli',
        '@sdk': './api',
        '@api': './api',
        '@tests': './tests'
      };
      options.define = {
        ...options.define,
        '__VERSION__': `"${packageJson.version}"`
      };
      
      options.platform = 'node';
    }
  }
]); 