#!/usr/bin/env node
/**
 * CLI wrapper for AST Explorer that handles path resolution
 */
require('ts-node').register({
  project: './tsconfig.json',
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
  }
});

// Load command module
require('./src/command');