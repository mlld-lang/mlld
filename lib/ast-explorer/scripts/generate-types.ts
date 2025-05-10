#!/usr/bin/env ts-node
/**
 * Script to generate types from grammar examples
 * 
 * This script can be integrated into the build process to automatically
 * generate TypeScript types from grammar examples.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Explorer } from '../src/explorer';

// Set up paths
const EXAMPLES_PATH = path.resolve(__dirname, '../examples/directives.json');
const OUTPUT_DIR = path.resolve(__dirname, '../../types/generated');

async function generateTypes() {
  console.log('Generating types from grammar examples...');
  
  // Create explorer instance
  const explorer = new Explorer({
    outputDir: OUTPUT_DIR
  });
  
  // Process examples batch
  explorer.processBatch(EXAMPLES_PATH);
  
  console.log('Type generation complete!');
}

// Run if called directly
if (require.main === module) {
  generateTypes().catch(err => {
    console.error('Error generating types:', err);
    process.exit(1);
  });
}