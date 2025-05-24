import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

// Define common external dependencies to ensure consistency across builds
const externalDependencies = [
  // Core libraries 
  // Note: meld-ast is now consolidated into @core/ast and should be bundled, not external
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
  }
  
  // Optimize for DI-based code
  options.keepNames = true; // Required for reflection-based DI
  
  // Ensure proper module resolution
  options.resolveExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
  options.format = format;
  options.target = 'es2020';
  
  return options;
};

export default defineConfig([
  // API build - ESM only with splitting
  {
    entry: {
      index: 'api/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: true,
    treeshake: {
      preset: 'recommended',
      moduleSideEffects: ['reflect-metadata', 'tsyringe']
    },
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: '.mjs',
        dts: '.d.ts'
      };
    },
    tsconfig: 'tsconfig.build.json',
    external: externalDependencies,
    noExternal: [
      // Bundle all internal dependencies
      '@core/*',
      '@services/*',
      '@parser/*',
      '@interpreter/*',
      '@output/*',
      '@cli/*',
      '@sdk/*',
      '@api/*',
      '@tests/*'
    ],
    esbuildOptions(options, { format }) {
      return getEsbuildOptions(format)(options);
    }
  },
  // API build for CommonJS - no splitting
  {
    entry: {
      index: 'api/index.ts',
    },
    format: ['cjs'],
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    treeshake: {
      preset: 'recommended',
      moduleSideEffects: ['reflect-metadata', 'tsyringe']
    },
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: '.cjs',
      };
    },
    tsconfig: 'tsconfig.build.json',
    external: externalDependencies,
    noExternal: [
      // Bundle all internal dependencies
      '@core/*',
      '@services/*',
      '@parser/*',
      '@interpreter/*',
      '@output/*',
      '@cli/*',
      '@sdk/*',
      '@api/*',
      '@tests/*'
    ],
    esbuildOptions(options, { format }) {
      return getEsbuildOptions(format)(options);
    }
  },
  // CLI build - CJS only but with ESM compatibility
  {
    entry: {
      cli: 'cli/cli-entry.ts',
    },
    format: 'cjs',
    dts: true,
    clean: false,
    sourcemap: true,
    treeshake: {
      preset: 'recommended',
      moduleSideEffects: ['reflect-metadata', 'tsyringe']
    },
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: '.cjs',
        dts: '.d.ts'
      };
    },
    tsconfig: 'tsconfig.build.json',
    external: externalDependencies,
    noExternal: [
      // Bundle all internal dependencies
      '@core/*',
      '@services/*',
      '@parser/*',
      '@interpreter/*',
      '@output/*',
      '@cli/*',
      '@sdk/*',
      '@api/*',
      '@tests/*'
    ],
    banner: {
      js: '#!/usr/bin/env node'
    },
    esbuildOptions(options) {
      return getEsbuildOptions('cjs')(options);
    }
  }
]); 
