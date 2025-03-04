#!/usr/bin/env node

// Use Node's spawn to run with the --require flag
const { spawnSync } = require('child_process');

// Get the arguments passed to this script
const args = process.argv.slice(2);

// Run the CLI with the --require flag to ensure reflect-metadata is loaded first
const result = spawnSync('node', [
  '--require', 'reflect-metadata',
  require.resolve('../dist/cli.cjs'),
  ...args
], {
  stdio: 'inherit' // Pass stdin/stdout/stderr through to the parent process
});

// Forward the exit code
process.exit(result.status); 