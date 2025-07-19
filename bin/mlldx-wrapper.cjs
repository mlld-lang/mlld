#!/usr/bin/env node

// Wrapper for mlldx - mlld for CI/serverless environments
const { spawn } = require('child_process');
const path = require('path');

// Get the arguments passed to this script
const args = process.argv.slice(2);

// Path to the CLI bundle
const cliPath = path.resolve(__dirname, '../dist/cli.cjs');

// Set environment variable to indicate mlldx mode
const env = {
  ...process.env,
  MLLD_EPHEMERAL: 'true',
  MLLD_BINARY_NAME: 'mlldx'
};

// Run the CLI with mlldx configuration
const child = spawn('node', [cliPath, '--ephemeral', '--risky-approve-all', ...args], {
  stdio: 'inherit',
  env
});

// Forward the exit code
child.on('exit', (code) => {
  process.exit(code || 0);
});