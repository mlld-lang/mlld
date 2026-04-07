#!/usr/bin/env node

// Simple wrapper to run the CLI bundle
const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const { resolveTsxImportSpecifier } = require('./dev-runtime.cjs');

// Get the arguments passed to this script
const args = process.argv.slice(2);

// Path to the CLI bundle
const cliPath = path.resolve(__dirname, '../dist/cli.cjs');
const devCliPath = path.resolve(__dirname, '../cli/cli-entry.ts');
function spawnCliProcess() {
  if (!existsSync(cliPath)) {
    if (existsSync(devCliPath)) {
      let tsxImportSpecifier;
      try {
        tsxImportSpecifier = resolveTsxImportSpecifier();
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }

      return spawn(process.execPath, ['--import', tsxImportSpecifier, devCliPath, ...args], {
        stdio: 'inherit',
        env: process.env
      });
    }

    console.error('CLI bundle not found. Run npm run build.');
    process.exit(1);
  }

  const runner = `
    const cliPath = ${JSON.stringify(cliPath)};
    const args = ${JSON.stringify(args)};
    const originalExit = process.exit;
    process.exit = (code) => setTimeout(() => originalExit(code), 10);
    process.argv = [process.argv[0], cliPath, ...args];
    require(cliPath);
  `;

  return spawn(process.execPath, ['-e', runner], {
    stdio: 'inherit',
    env: process.env
  });
}

const child = spawnCliProcess();

// Forward the exit code
child.on('exit', (code) => {
  process.exit(code || 0);
}); 
