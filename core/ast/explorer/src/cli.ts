#!/usr/bin/env node
/**
 * Command-line interface for AST Explorer
 */
import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective } from './parse';
import { generateTypeInterface } from './generate/types';
import { generateTestFixture, writeTestFixture } from './generate/fixtures';
import { generateSnapshot, compareWithSnapshot } from './generate/snapshots';
import { loadExamples, processBatch } from './batch';
import { Explorer } from './explorer';

// Create CLI program
program
  .name('meld-ast-explorer')
  .description('Explore and analyze Meld grammar AST')
  .version('0.1.0');

// Command to explore a directive
program
  .command('explore')
  .description('Parse a directive and show its AST')
  .argument('<directive>', 'Directive to parse')
  .option('-o, --output <file>', 'Output file path')
  .action((directive, options) => {
    try {
      const ast = parseDirective(directive);
      const output = JSON.stringify(ast, null, 2);
      
      if (options.output) {
        fs.writeFileSync(options.output, output);
        console.log(`AST written to ${options.output}`);
      } else {
        console.log(output);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to generate types
program
  .command('generate-types')
  .description('Generate TypeScript types from a directive')
  .argument('<directive>', 'Directive to parse')
  .option('-n, --name <name>', 'Type name', 'directive')
  .option('-o, --output <file>', 'Output file path')
  .action((directive, options) => {
    try {
      const ast = parseDirective(directive);
      const typeDefinition = generateTypeInterface(ast);
      
      if (options.output) {
        fs.writeFileSync(options.output, typeDefinition);
        console.log(`Type definition written to ${options.output}`);
      } else {
        console.log(typeDefinition);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to generate test fixture
program
  .command('generate-fixture')
  .description('Generate a test fixture from a directive')
  .argument('<directive>', 'Directive to parse')
  .option('-n, --name <name>', 'Test name', 'directive-test')
  .option('-o, --output <dir>', 'Output directory', './fixtures')
  .action((directive, options) => {
    try {
      const ast = parseDirective(directive);
      const fixture = generateTestFixture(directive, ast, options.name);
      const outputPath = writeTestFixture(fixture, options.name, options.output);
      
      console.log(`Test fixture written to ${outputPath}`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to generate snapshot
program
  .command('snapshot')
  .description('Generate an AST snapshot from a directive')
  .argument('<directive>', 'Directive to parse')
  .option('-n, --name <name>', 'Snapshot name', 'directive-snapshot')
  .option('-o, --output <dir>', 'Output directory', './snapshots')
  .action((directive, options) => {
    try {
      const ast = parseDirective(directive);
      const snapshotPath = generateSnapshot(ast, options.name, options.output);
      
      console.log(`Snapshot written to ${snapshotPath}`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to compare with snapshot
program
  .command('compare')
  .description('Compare a directive with an existing snapshot')
  .argument('<directive>', 'Directive to parse')
  .argument('<name>', 'Snapshot name')
  .option('-s, --snapshots <dir>', 'Snapshots directory', './snapshots')
  .action((directive, name, options) => {
    try {
      const ast = parseDirective(directive);
      const matches = compareWithSnapshot(ast, name, options.snapshots);
      
      if (matches) {
        console.log(`✅ Directive matches snapshot for "${name}"`);
      } else {
        console.log(`❌ Directive does NOT match snapshot for "${name}"`);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to process batch
program
  .command('batch')
  .description('Process a batch of directive examples')
  .argument('<examples>', 'JSON file with examples')
  .option('-o, --output <dir>', 'Output directory', './generated')
  .action((examplesFile, options) => {
    try {
      const examples = loadExamples(examplesFile);
      processBatch(examples, options.output);
      
      console.log(`Processed ${examples.length} examples`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to initialize an examples file
program
  .command('init')
  .description('Initialize a new examples file')
  .argument('<file>', 'Output JSON file path')
  .action((file) => {
    try {
      const examples = [
        {
          name: 'text-assignment',
          directive: '@text greeting = "Hello, world!"',
          description: 'Simple text assignment directive'
        },
        {
          name: 'text-template',
          directive: '@text template = [[Template with {{var}}]]',
          description: 'Text template directive with variable'
        }
      ];
      
      fs.writeFileSync(file, JSON.stringify(examples, null, 2));
      console.log(`Examples file initialized at ${file}`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to create an explorer instance
program
  .command('explorer')
  .description('Create and configure an Explorer instance')
  .option('-o, --output <dir>', 'Output directory', './generated')
  .action((options) => {
    try {
      const explorer = new Explorer({
        outputDir: options.output
      });
      
      console.log(`Explorer created with output directory: ${options.output}`);
      console.log('Use the explorer object for additional operations');
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Parse arguments
if (require.main === module) {
  program.parse();
}