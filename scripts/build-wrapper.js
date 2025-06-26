#!/usr/bin/env node
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Check if critical generated files exist
const criticalFiles = [
  'grammar/generated/parser/parser.js',
  'grammar/generated/parser/parser.ts',
  'grammar/generated/parser/parser.cjs',
  'grammar/generated/parser/deps/node-type.js',
  'grammar/generated/parser/deps/helpers.js',
  'grammar/generated/parser/deps/directive-kind.js'
];

const missingFiles = criticalFiles.filter(file => !existsSync(join(projectRoot, file)));

if (missingFiles.length > 0) {
  console.log('🔍 Detected missing generated files:');
  missingFiles.forEach(file => console.log(`   - ${file}`));
  console.log('\n📦 Building grammar first...\n');
  
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

// Now run the main build
console.log('🚀 Running main build...\n');
try {
  execSync('npm run build:version && npm run build:grammar && tsup && npm run build:python', { 
    stdio: 'inherit',
    cwd: projectRoot,
    shell: true
  });
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}