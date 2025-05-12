#!/usr/bin/env node
/**
 * Binary executable for the Enhanced AST Explorer
 *
 * This script executes the enhanced command-line interface
 * for the AST Explorer with improved type generation.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Use ts-node to run the enhanced command directly from source
const tsNodePath = path.resolve(projectRoot, '../../node_modules/.bin/ts-node');
const sourceFile = path.join(projectRoot, 'src', 'enhanced-command.ts');

// Create and execute the command
const args = process.argv.slice(2);
let command = 'process-all';
if (args.length > 0 && !args[0].startsWith('-')) {
  command = args[0];
  args.shift();
}

// Print the parameters
console.log(`Running enhanced command: ${command}`);
console.log(`Arguments: ${args.join(' ')}`);

// Execute the command using ts-node
const result = spawnSync(tsNodePath, ['--esm', sourceFile, command, ...args], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' }
});

// Handle exit code
process.exit(result.status);