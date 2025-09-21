#!/usr/bin/env node
/**
 * Generate Output Script
 * 
 * Generates actual outputs for example files that don't have expected outputs.
 * This runs after the main build to ensure the interpreter is available.
 * 
 * Usage:
 *   node scripts/generate-outputs.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { processMlld } from '../dist/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root
const PROJECT_ROOT = path.join(__dirname, '..');
const EXAMPLES_DIR = path.join(PROJECT_ROOT, 'examples');
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures');
const CASES_DIR = path.join(PROJECT_ROOT, 'tests', 'cases');

// Using the real file system via the API

async function main() {
  try {
    console.log('Generating outputs for examples...');
    console.log('===================================');
    
    // Process all .mld files in examples directory
    const files = await fs.readdir(EXAMPLES_DIR);
    const mlldFiles = files.filter(f => f.endsWith('.mld') && !f.startsWith('invalid-'));
    
    let processed = 0;
    let failed = 0;
    
    for (const file of mlldFiles) {
      try {
        const filePath = path.join(EXAMPLES_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Process example with real file system
        
        // Run the interpreter via API
        const output = await processMlld(content, {
          format: 'markdown',
          basePath: EXAMPLES_DIR
        });
        
        // Write the output to output.md
        const outputFile = path.join(EXAMPLES_DIR, file.replace('.mld', '-output.md'));
        await fs.writeFile(outputFile, output);
        
        console.log(`✓ ${file} → ${file.replace('.mld', '-output.md')}`);
        processed++;
        
        // Also update the fixture with the actual output
        const fixturePath = path.join(FIXTURES_DIR, 'examples', `${file.replace('.mld', '.generated-fixture.json')}`);
        try {
          const fixtureContent = await fs.readFile(fixturePath, 'utf-8');
          const fixture = JSON.parse(fixtureContent);
          fixture.actualOutput = output;
          await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));
          console.log(`  ↳ Updated fixture with actual output`);
        } catch (error) {
          console.log(`  ⚠️  Could not update fixture: ${error.message}`);
        }
        
      } catch (error) {
        console.log(`✗ ${file}: ${error.message}`);
        failed++;
      }
    }
    
    console.log('');
    console.log(`✅ Done! Processed ${processed} files, ${failed} failed`);
    
    // Clean up generated output files unless asked to keep them
    if (process.env.KEEP_OUTPUT !== 'true') {
      console.log('');
      console.log('🧹 Cleaning up generated files...');
      let cleaned = 0;
      for (const file of mlldFiles) {
        const outputFile = path.join(EXAMPLES_DIR, file.replace('.mld', '-output.md'));
        try {
          await fs.unlink(outputFile);
          cleaned++;
        } catch (error) {
          // File might not exist, which is fine
        }
      }
      console.log(`   Cleaned ${cleaned} output files`);
    } else {
      console.log('');
      console.log('📁 Keeping output files for review (KEEP_OUTPUT=true)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();