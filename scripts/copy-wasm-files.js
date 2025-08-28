#!/usr/bin/env node

/**
 * Copy tree-sitter WASM files from node_modules to dist/wasm
 * This is needed for the embedded language service to load parsers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Only include languages we actually have WASM files for
// TODO: Add 'python' and 'bash' when their WASM files become available
const languages = ['javascript'];
const sourceDir = path.join(projectRoot, 'node_modules');
const targetDir = path.join(projectRoot, 'dist', 'wasm');

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log('Copying tree-sitter WASM files...');

for (const lang of languages) {
  const wasmFile = `tree-sitter-${lang}.wasm`;
  const packageDir = path.join(sourceDir, `tree-sitter-${lang}`);
  
  // Try multiple possible locations for the WASM file
  const possiblePaths = [
    path.join(packageDir, wasmFile),
    path.join(packageDir, 'build', wasmFile),
    path.join(packageDir, 'target', 'wasm32-wasi', 'release', wasmFile),
  ];
  
  let found = false;
  for (const sourcePath of possiblePaths) {
    if (fs.existsSync(sourcePath)) {
      const targetPath = path.join(targetDir, wasmFile);
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✓ Copied ${wasmFile} from ${path.relative(projectRoot, sourcePath)}`);
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.warn(`⚠ Warning: ${wasmFile} not found in tree-sitter-${lang} package`);
    console.warn(`  Searched in:`, possiblePaths.map(p => path.relative(projectRoot, p)));
  }
}

console.log('\nWASM files copied to dist/wasm/');