#!/usr/bin/env node
/**
 * Enhanced command-line interface for AST Explorer
 * 
 * This module provides an improved CLI that uses the enhanced batch processing
 * to generate more accurate and consolidated types.
 */
import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective } from './parse.js';
import { processEnhancedExampleDirs, processEnhancedBatch, loadExamples } from './enhanced-batch.js';
import { Explorer } from './explorer.js';

// Create CLI program
program
  .name('meld-ast-explorer')
  .description('Explore and analyze Meld grammar AST')
  .version('0.2.0');

// Command to run the enhanced process-all workflow based on conventions
program
  .command('process-all')
  .description('Process all examples using convention-based structure with enhanced type generation')
  .option('-d, --dir <dir>', 'Root directory with examples', './core/examples')
  .option('-o, --output <dir>', 'Output directory for generated files', './core/ast')
  .option('-f, --fixtures <dir>', 'Directory for E2E fixtures', './core/fixtures')
  .option('-t, --tests <dir>', 'Directory for test fixtures', './core/ast/tests')
  .option('--verbose', 'Enable verbose output', false)
  .action((options) => {
    try {
      // Print configuration details in verbose mode
      if (options.verbose) {
        console.log('Configuration:');
        console.log(`- Examples directory: ${options.dir}`);
        console.log(`- Output directory: ${options.output}`);
        console.log(`- Fixtures directory: ${options.fixtures}`);
        console.log(`- Tests directory: ${options.tests}`);
      }

      // Ensure output directories exist
      const outputDir = options.output;
      const fixturesDir = options.fixtures;
      const testsDir = options.tests;

      [outputDir, fixturesDir, testsDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      console.log(`Processing examples from ${options.dir}...`);

      // Process examples using enhanced convention-based approach
      processEnhancedExampleDirs(options.dir, outputDir, undefined, {
        testsDir: testsDir,
        fixturesDir: fixturesDir
      });

      console.log('Enhanced type generation completed successfully!');
      console.log(`- Types: ${path.join(outputDir, 'types')}`);
      console.log(`- Snapshots: ${path.join(outputDir, 'snapshots')}`);
      console.log(`- Tests: ${testsDir}`);
      console.log(`- Fixtures: ${fixturesDir}`);
    } catch (error: any) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error('Stack trace:', error.stack);
      }
    }
  });

// Command to process a batch of examples with enhanced type generation
program
  .command('batch')
  .description('Process a batch of directive examples with enhanced type generation')
  .argument('<examples>', 'JSON file with examples')
  .option('-o, --output <dir>', 'Output directory', './generated')
  .option('--verbose', 'Enable verbose output', false)
  .action((examplesFile, options) => {
    try {
      // Print configuration in verbose mode
      if (options.verbose) {
        console.log('Configuration:');
        console.log(`- Examples file: ${examplesFile}`);
        console.log(`- Output directory: ${options.output}`);
      }

      // Ensure output directory exists
      if (!fs.existsSync(options.output)) {
        fs.mkdirSync(options.output, { recursive: true });
      }

      // Load and process examples
      const examples = loadExamples(examplesFile);
      processEnhancedBatch(examples, options.output);

      console.log(`Processed ${examples.length} examples with enhanced type generation`);
      console.log(`Output directory: ${options.output}`);
    } catch (error: any) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error('Stack trace:', error.stack);
      }
    }
  });

// Parse arguments
// ESM doesn't have require.main === module
// Check if this file is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

/**
 * Run a specific command with arguments
 */
export function runCommand(commandName: string, args: string[]): void {
  // Add the command name to the beginning of args
  const fullArgs = [commandName, ...args];

  // Parse arguments
  program.parse(fullArgs, { from: 'user' });
}

// Export the program for testing
export { program };