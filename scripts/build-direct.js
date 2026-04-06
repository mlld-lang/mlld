#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const yellow = '\x1b[33m';
const green = '\x1b[32m';
const reset = '\x1b[0m';

function runStep(label, command) {
  console.log(`${yellow}▶${reset} ${label}`);
  const result = spawnSync(command, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true
  });

  if ((result.status ?? 0) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runOptionalStep(label, command) {
  console.log(`${yellow}▶${reset} ${label}`);
  const result = spawnSync(command, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true
  });

  if ((result.status ?? 0) !== 0) {
    console.warn(`${yellow}Warning:${reset} optional step '${label}' exited with code ${result.status ?? 1}. Continuing.`);
  }
}

runStep('Generating version', 'npm run build:version');
runStep('Building error patterns', 'npm run build:errors');
runStep('Building grammar', 'npm run build:grammar');
runStep('Compiling TypeScript', 'npx tsup');

if (process.env.CI) {
  runStep('Building LLM docs', 'npm run build:docs');
} else {
  console.log(`${yellow}▶${reset} Building LLM docs (skipped outside CI)`);
}

runOptionalStep('Copying WASM files', 'npm run build:wasm');

console.log(`${green}✓${reset} Direct build completed`);
