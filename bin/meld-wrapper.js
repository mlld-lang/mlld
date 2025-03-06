#!/usr/bin/env node

// Use Node's spawn to run with the --require flag
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the arguments passed to this script
const args = process.argv.slice(2);

// Try to find reflect-metadata in various locations
let reflectMetadataPath;
const possiblePaths = [
  // Try to find in local node_modules
  path.resolve(__dirname, '../node_modules/reflect-metadata/Reflect.js'),
  // Try to find in parent node_modules (when installed as a dependency)
  path.resolve(__dirname, '../../reflect-metadata/Reflect.js'),
  // Try to find in npm global node_modules
  path.join(process.env.NODE_PATH || '', 'reflect-metadata/Reflect.js'),
  // Use the module name and let Node.js resolve it
  'reflect-metadata'
];

for (const possiblePath of possiblePaths) {
  try {
    if (possiblePath === 'reflect-metadata' || fs.existsSync(possiblePath)) {
      reflectMetadataPath = possiblePath;
      break;
    }
  } catch (e) {
    // Ignore errors and try the next path
  }
}

if (!reflectMetadataPath) {
  console.error('Error: Could not find the reflect-metadata package.');
  console.error('Please install it using: npm install -g reflect-metadata');
  process.exit(1);
}

// Run the CLI with the --require flag to ensure reflect-metadata is loaded first
const result = spawnSync('node', [
  '--require', reflectMetadataPath,
  require.resolve('../dist/cli.cjs'),
  ...args
], {
  stdio: 'inherit' // Pass stdin/stdout/stderr through to the parent process
});

// Forward the exit code
process.exit(result.status); 