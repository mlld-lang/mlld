#!/usr/bin/env node

/**
 * Standalone script to process a Meld file and output the result to stdout.
 * 
 * Usage:
 *   npm run process-meld -- <path-to-meld-file> [--format=FORMAT] [--transform]
 * 
 * Options:
 *   --format=FORMAT  Output format (default: llm)
 *   --transform      Enable transformation mode
 */

import { main } from '@api/index.js';
import type { ProcessOptions } from '@core/types/index.js';
import type { OutputFormat } from '@services/pipeline/OutputService/IOutputService.js';
import path from 'path';

async function run() {
  const args = process.argv.slice(2);
  
  // Handle help command
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
    Process a Meld file and output the result to stdout.
    
    Usage:
      npm run process-meld -- <path-to-meld-file> [--format=FORMAT] [--transform]
    
    Options:
      --format=FORMAT  Output format (default: llm)
                       Valid formats: llm, markdown
      --transform      Enable transformation mode
      --help, -h       Show this help message
    `);
    process.exit(0);
  }
  
  // Get the file path (the first non-option argument)
  const filePath = args.find(arg => !arg.startsWith('--'));
  
  if (!filePath) {
    console.error('Error: No input file specified.');
    console.log('Use --help for usage information.');
    process.exit(1);
  }
  
  // Process options
  const formatArg = args.find(arg => arg.startsWith('--format='))?.split('=')[1];
  // Validate format is a valid OutputFormat
  const format = (formatArg === 'markdown' || formatArg === 'xml') 
    ? formatArg 
    : 'xml';
  
  const transform = args.includes('--transform');
  
  try {
    // Resolve absolute path
    const absolutePath = path.resolve(process.cwd(), filePath);
    
    // Process the file
    const options: ProcessOptions = {
      format: format as OutputFormat,
      transformation: transform
    };
    
    const result = await main(absolutePath, options);
    
    // Output the result
    console.log(result);
  } catch (error: any) {
    console.error(`Error processing Meld file: ${error?.message || 'Unknown error'}`);
    if (error?.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
run().catch((error: any) => {
  console.error(`Unexpected error: ${error?.message || 'Unknown error'}`);
  if (error?.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}); 