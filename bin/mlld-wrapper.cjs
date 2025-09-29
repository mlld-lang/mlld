#!/usr/bin/env node

// Simple wrapper to run the CLI bundle
const { spawn } = require('child_process');
const path = require('path');

// Get the arguments passed to this script
const args = process.argv.slice(2);

// Path to the CLI bundle
const cliPath = path.resolve(__dirname, '../dist/cli.cjs');

// Run the CLI directly using current node executable
const child = spawn(process.execPath, [cliPath, ...args], {
  stdio: 'inherit',
  env: process.env
});

// Forward the exit code
child.on('exit', (code) => {
  process.exit(code || 0);
}); 

child.on('close', (code) => {
  process.exit(code ?? 0);
}); 