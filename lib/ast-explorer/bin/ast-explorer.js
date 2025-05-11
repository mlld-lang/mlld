#!/usr/bin/env node
/**
 * Binary executable for the AST Explorer
 *
 * This is a more direct approach that simply executes the compiled JS version
 * of the command module instead of trying to run the TS code directly
 */
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Use compiled version from dist if available, otherwise use ts-node to run the source
let commandPath = path.join(projectRoot, 'dist', 'command.js');
if (!fs.existsSync(commandPath)) {
  console.log('Compiled command module not found, building...');
  try {
    // Try to build the project
    const { execSync } = await import('child_process');
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to build project:', err.message);
    commandPath = path.join(projectRoot, 'src', 'command.ts');
    console.log(`Using source file: ${commandPath}`);
  }
}

// Create and execute the process-all command directly
const args = process.argv.slice(2);
let command = 'process-all';
if (args.length > 0 && !args[0].startsWith('-')) {
  command = args[0];
  args.shift();
}

// Print the parameters
console.log(`Running command: ${command}`);
console.log(`Arguments: ${args.join(' ')}`);

// Execute the command
import('../dist/cli.js').then(module => {
  try {
    console.log('Module loaded successfully');
    if (typeof module.runCommand === 'function') {
      module.runCommand(command, args);
    } else {
      console.error('Module loaded, but runCommand function not found');
      console.log('Available exports:', Object.keys(module));
    }
  } catch (err) {
    console.error('Error executing command:', err);
  }
}).catch(err => {
  console.error('Failed to import command module:', err.message);
  console.error('Stack trace:', err.stack);
  process.exit(1);
});