#!/usr/bin/env node

// mlldx wrapper - forwards to the mlldx command from the mlld package
const { spawn } = require('child_process');
const path = require('path');

// Find the mlldx binary from the mlld package
// Use the main entry point instead of package.json
const mlldPath = require.resolve('mlld');
const mlldDir = path.dirname(mlldPath);
// Go up one level from dist to get to the package root
const mlldRoot = path.dirname(mlldDir);
const mlldxBin = path.join(mlldRoot, 'bin', 'mlldx-wrapper.cjs');

// Forward all arguments
const child = spawn('node', [mlldxBin, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('Failed to run mlldx:', err);
  process.exit(1);
});