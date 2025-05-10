#!/usr/bin/env node
/**
 * Binary executable for the AST Explorer
 */
const path = require('path');
const fs = require('fs');

// Find project root relative to where the script is executed
const findProjectRoot = () => {
  // Get the directory where this script is located
  const scriptDir = path.dirname(fs.realpathSync(__filename));
  return path.resolve(scriptDir, '..');
};

// Set project root as process working directory
const projectRoot = findProjectRoot();
process.chdir(projectRoot);

// Register ts-node
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
  },
  project: path.join(projectRoot, 'tsconfig.json')
});

// Create a helper for path resolution
global.__astExplorerPaths = {
  projectRoot,
  resolvePath: (relativePath) => path.resolve(projectRoot, relativePath)
};

// Load command module
require('../src/command');