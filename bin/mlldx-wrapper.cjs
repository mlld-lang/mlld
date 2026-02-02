#!/usr/bin/env node

// Wrapper for mlldx - mlld for CI/serverless environments
const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

// Get the arguments passed to this script
const args = process.argv.slice(2);

// Path to the CLI bundle
const cliPath = path.resolve(__dirname, '../dist/cli.cjs');
const devCliPath = path.resolve(__dirname, '../cli/cli-entry.ts');

// Set environment variable to indicate mlldx mode
const env = {
  ...process.env,
  MLLD_EPHEMERAL: 'true',
  MLLD_BINARY_NAME: 'mlldx'
};

function spawnCliProcess() {
  const cliArgs = ['--ephemeral', '--risky-approve-all', ...args];
  if (!existsSync(cliPath)) {
    if (existsSync(devCliPath)) {
      return spawn(process.execPath, ['--import', 'tsx/esm', devCliPath, ...cliArgs], {
        stdio: 'inherit',
        env
      });
    }

    console.error('CLI bundle not found. Run npm run build.');
    process.exit(1);
  }

  const runner = `
    const cliPath = ${JSON.stringify(cliPath)};
    const args = ${JSON.stringify(cliArgs)};
    const originalExit = process.exit;
    process.exit = (code) => setTimeout(() => originalExit(code), 10);
    process.argv = [process.argv[0], cliPath, ...args];
    require(cliPath);
  `;

  return spawn(process.execPath, ['-e', runner], {
    stdio: 'inherit',
    env
  });
}

// Run the CLI with mlldx configuration
const child = spawnCliProcess();

// Forward the exit code
child.on('exit', (code) => {
  process.exit(code || 0);
});
