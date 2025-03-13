import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

// Define common external dependencies to ensure consistency across builds
const externalDependencies = [
  // Core libraries
  'meld-ast',
  'meld-spec',
  'llmxml',
  'marked',
  'minimatch',
  'winston',
  'yargs',
  'tsyringe',
  'reflect-metadata',
  
  // Node.js built-ins
  'fs',
  'graceful-fs',
  'path',
  'util',
  'child_process',
  'crypto',
  'fs/promises',
  'os',
  'events',
  'stream',
  'process',
  'url'
];

// Define common esbuild options
const getEsbuildOptions = (format: string) => (options: any) => {
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
  
  // Ensure platform is always set to 'node'
  options.platform = 'node';
  
  // Configure format-specific options
  if (format === 'esm') {
    options.mainFields = ['module', 'main'];
    options.conditions = ['import', 'module', 'require', 'default'];
    
    // Add ESM-specific defines for compatibility
    options.define = {
      ...options.define,
      '__dirname': 'import.meta.url',
      '__filename': 'import.meta.url'
    };
  }
  
  // Optimize for DI-based code
  options.keepNames = true; // Required for reflection-based DI
  
  return options;
};

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
    treeshake: {
      // Optimize tree shaking for DI-based code
      preset: 'recommended',
      moduleSideEffects: ['reflect-metadata', 'tsyringe']
    },
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.mjs'
      }
    },
    tsconfig: 'tsconfig.build.json',
    external: externalDependencies,
    noExternal: [
      // If there are any dependencies that should be bundled, list them here
    ],
    esbuildOptions(options, { format }) {
      return getEsbuildOptions(format)(options);
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
    treeshake: {
      // Optimize tree shaking for DI-based code
      preset: 'recommended',
      moduleSideEffects: ['reflect-metadata', 'tsyringe']
    },
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: '.cjs'
      }
    },
    tsconfig: 'tsconfig.build.json',
    external: externalDependencies,
    banner: {
      js: '#!/usr/bin/env node'
    },
    esbuildOptions(options) {
      return getEsbuildOptions('cjs')(options);
    }
  }
]); 