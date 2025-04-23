/**
 * Utility to generate output files for e2e tests
 * 
 * This script generates the following files for each test case:
 * - .o.md - Raw Markdown output
 * - .o.pretty.md - Formatted Markdown output
 * - .o.xml - XML output format
 * 
 * These files can be used to compare actual vs expected output and debug issues.
 */

import { findFiles, VALID_CASES_DIR, INVALID_CASES_DIR, ERROR_EXTENSION, setupTestContext } from './example-runner-setup';
import { main as runMeld } from '@api/index';
import { promises as fs } from 'fs';
import path from 'path';
import type { Services } from '@core/types/index';

// File extensions for outputs
const OUTPUT_MD_EXT = '.o.md';
const OUTPUT_PRETTY_MD_EXT = '.o.pretty.md';
const OUTPUT_XML_EXT = '.o.xml';

/**
 * Generate output files for a given test file
 */
async function generateOutputs(filePath: string, context: any): Promise<void> {
  const basePath = filePath.replace(/\.mld$/, '').replace(/\.error\.mld$/, '.error');
  const mdOutputPath = `${basePath}${OUTPUT_MD_EXT}`;
  const prettyMdOutputPath = `${basePath}${OUTPUT_PRETTY_MD_EXT}`;
  const xmlOutputPath = `${basePath}${OUTPUT_XML_EXT}`;
  
  try {
    // Generate markdown output
    const mdResult = await runMeld(filePath, {
      fs: context.services.filesystem as any,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    // Save raw markdown output
    await fs.writeFile(mdOutputPath, mdResult);
    
    // Generate pretty markdown (for now just the same, but could be formatted differently)
    await fs.writeFile(prettyMdOutputPath, mdResult);
    
    // Generate XML output
    const xmlResult = await runMeld(filePath, {
      fs: context.services.filesystem as any,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'xml'
    });
    
    await fs.writeFile(xmlOutputPath, xmlResult);
    
    console.log(`Generated outputs for: ${path.basename(filePath)}`);
  } catch (error: any) {
    // If there's an error, write it to the output files
    const errorMessage = `Error processing file: ${filePath}\n\n---\n\n${error.message || 'Unknown error'}\n\n${error.stack || ''}`;
    
    await fs.writeFile(mdOutputPath, errorMessage);
    await fs.writeFile(prettyMdOutputPath, errorMessage);
    await fs.writeFile(xmlOutputPath, `<error>\n  <message>${escapeXml(error.message || 'Unknown error')}</message>\n  <stack>${escapeXml(error.stack || '')}</stack>\n</error>`);
    
    console.error(`Error processing: ${path.basename(filePath)}`);
  }
}

/**
 * Simple XML escaping for error messages
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Main function
 */
async function run() {
  try {
    // Find all valid test files
    const validFiles = await findFiles(VALID_CASES_DIR, '.mld');
    console.log(`Found ${validFiles.length} valid test files to process`);
    
    // Find all invalid test files
    const invalidFiles = await findFiles(INVALID_CASES_DIR, ERROR_EXTENSION);
    console.log(`Found ${invalidFiles.length} invalid test files to process`);
    
    // Combine all files
    const allFiles = [...validFiles, ...invalidFiles];
    
    // Setup test context with all files
    const context = await setupTestContext(allFiles);
    
    // Process valid test files
    console.log('Processing valid test files...');
    for (const filePath of validFiles) {
      await generateOutputs(filePath, context);
    }
    
    // Process invalid test files
    console.log('Processing invalid test files...');
    for (const filePath of invalidFiles) {
      await generateOutputs(filePath, context);
    }
    
    // Clean up
    await context.cleanup();
    
    console.log('Finished generating all output files');
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Run the main function
run();