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

// Check for config file in current directory
const workingDir = process.cwd();
const rootConfigPath = path.join(workingDir, 'ast-explorer.config.json');
const moduleConfigPath = path.join(projectRoot, 'ast-explorer.config.json');

// If config exists in working directory but not in module root, copy it
if (fs.existsSync(rootConfigPath) && !fs.existsSync(moduleConfigPath)) {
  try {
    fs.copyFileSync(rootConfigPath, moduleConfigPath);
    console.log(`Using configuration from ${rootConfigPath}`);
  } catch (err) {
    console.warn(`Warning: Could not copy config file from ${rootConfigPath}`);
  }
}

// Load command module
require('../src/command');