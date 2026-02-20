#!/usr/bin/env node

/**
 * Copy tree-sitter WASM files from node_modules to dist/wasm
 * This is needed for the embedded language service to load parsers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Include all embedded languages we support in the LSP.
const languages = ['javascript', 'python', 'bash'];
const require = createRequire(import.meta.url);
const sourceDir = path.join(projectRoot, 'node_modules');
const targetDir = path.join(projectRoot, 'dist', 'wasm');

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log('Copying tree-sitter WASM files...');

// In CI, tree-sitter packages might not be available - this is OK
const isCI = process.env.CI === 'true';

for (const lang of languages) {
  const wasmFile = `tree-sitter-${lang}.wasm`;
  const pkgName = `tree-sitter-${lang}`;
  // Best-effort: resolve the package directory via require.resolve
  let resolvedPkgDir;
  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`, { paths: [projectRoot] });
    resolvedPkgDir = path.dirname(pkgJsonPath);
  } catch (e) {
    // Not fatal — may be pruned in CI; fall back to node_modules lookup
    resolvedPkgDir = null;
  }
  const fallbackPkgDir = path.join(sourceDir, pkgName);
  
  // Try multiple possible locations for the WASM file
  const searchDirs = [
    ...(resolvedPkgDir ? [resolvedPkgDir] : []),
    fallbackPkgDir,
  ];
  const possiblePaths = searchDirs.flatMap(dir => [
    path.join(dir, wasmFile),
    path.join(dir, 'build', wasmFile),
    path.join(dir, 'target', 'wasm32-wasi', 'release', wasmFile),
  ]);
  
  let found = false;
  for (const sourcePath of possiblePaths) {
    if (fs.existsSync(sourcePath)) {
      try {
        const targetPath = path.join(targetDir, wasmFile);
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✓ Copied ${wasmFile} from ${path.relative(projectRoot, sourcePath)}`);
        found = true;
        break;
      } catch (err) {
        console.warn(`⚠ Warning: Failed to copy ${wasmFile} from ${sourcePath}: ${err?.message || err}`);
        // Try next path
      }
    }
  }
  
  if (!found) {
    if (isCI) {
      console.log(`ℹ️  ${wasmFile} not available in CI environment (${pkgName})`);
    } else {
      console.warn(`⚠ Warning: ${wasmFile} not found for ${pkgName}.`);
      console.warn(`  Searched in:`);
      for (const p of possiblePaths) {
        console.warn(`   - ${path.relative(projectRoot, p)}`);
      }
    }
  }
}

// In CI, if no files were copied, still exit successfully
if (isCI && !fs.readdirSync(targetDir).some(f => f.endsWith('.wasm'))) {
  console.log('\nℹ️  No WASM files available in CI environment - this is OK for builds');
  process.exit(0);
}

console.log('\nWASM files copied to dist/wasm/');
