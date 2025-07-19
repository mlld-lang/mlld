#!/usr/bin/env node

// mlldx wrapper - forwards to the mlldx command from the mlld package
const { spawn } = require('child_process');
const path = require('path');

// Find the mlldx binary from the mlld package
const mlldPath = require.resolve('mlld/package.json');
const mlldDir = path.dirname(mlldPath);
const mlldxBin = path.join(mlldDir, 'bin', 'mlldx-wrapper.cjs');

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