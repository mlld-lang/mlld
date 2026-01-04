#!/usr/bin/env node
/**
 * Validate that all token types emitted by visitors have mappings in TOKEN_TYPE_MAP
 */

import { readFile } from 'fs/promises';
import { glob } from 'glob';

// Extract token types from visitor files
const visitorFiles = glob.sync('services/lsp/visitors/*.ts');
const emittedTypes = new Set();

for (const file of visitorFiles) {
  const content = await readFile(file, 'utf-8');
  const matches = content.matchAll(/tokenType:\s*['"]([^'"]+)['"]/g);
  for (const match of matches) {
    emittedTypes.add(match[1]);
  }
}

// Extract TOKEN_TYPE_MAP from language-server-impl.ts
const lspContent = await readFile('cli/commands/language-server-impl.ts', 'utf-8');
const mapMatch = lspContent.match(/const TOKEN_TYPE_MAP[^{]*{([^}]+)}/s);
if (!mapMatch) {
  console.error('❌ Could not find TOKEN_TYPE_MAP');
  process.exit(1);
}

const mappings = new Set();
const mapContent = mapMatch[1];
const entryMatches = mapContent.matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g);
for (const match of entryMatches) {
  mappings.add(match[1]); // The key (emitted type)
}

// Find unmapped types
const unmapped = Array.from(emittedTypes).filter(t => !mappings.has(t));

console.log(`\n📊 Token Type Mapping Validation\n`);
console.log(`Emitted types: ${emittedTypes.size}`);
console.log(`Mapped types: ${mappings.size}`);

if (unmapped.length === 0) {
  console.log(`\n✅ All ${emittedTypes.size} token types have mappings!\n`);
  process.exit(0);
} else {
  console.log(`\n❌ ${unmapped.length} unmapped token types:\n`);
  unmapped.forEach(t => console.log(`   - ${t}`));
  console.log(`\nThese need to be added to TOKEN_TYPE_MAP in language-server-impl.ts\n`);
  process.exit(1);
}
