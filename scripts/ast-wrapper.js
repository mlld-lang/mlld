#!/usr/bin/env node
import { existsSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Check if parser exists
const parserFile = 'grammar/generated/parser/parser.js';

if (!existsSync(join(projectRoot, parserFile))) {
  console.log('🔍 Parser not found, building grammar first...\n');
  
  try {
    execSync('npm run build:grammar:core', { 
      stdio: 'inherit',
      cwd: projectRoot 
    });
    console.log('\n✅ Grammar build complete!\n');
  } catch (error) {
    console.error('❌ Grammar build failed:', error.message);
    process.exit(1);
  }
}

// Now run the AST command with any arguments passed
const args = process.argv.slice(2);
try {
  // Use spawnSync to avoid shell interpretation of special characters
  const result = spawnSync('node', ['./scripts/ast-output.js', ...args], { 
    stdio: 'inherit',
    cwd: projectRoot
  });
  
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
} catch (error) {
  process.exit(1);
}