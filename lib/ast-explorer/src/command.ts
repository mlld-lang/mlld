#!/usr/bin/env node
/**
 * Command-line interface for AST Explorer
 *
 * This module provides an improved CLI that uses enhanced batch processing
 * to generate more accurate and consolidated types.
 */
import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective } from './parse.js';
import { generateTypeInterface } from './generate/types.js';
import { generateTestFixture, writeTestFixture } from './generate/fixtures.js';
import { generateSnapshot, compareWithSnapshot } from './generate/snapshots.js';
import { loadExamples, processBatch, processExampleDirs } from './batch.js';
import { Explorer } from './explorer.js';
import { extractDirectives } from './extract-directives.js';

// Path resolution helper
declare global {
  var __astExplorerPaths: {
    projectRoot: string;
    resolvePath: (relativePath: string) => string;
  } | undefined;
}

// Helper to resolve paths
function resolvePath(relativePath: string): string {
  if (global.__astExplorerPaths) {
    return global.__astExplorerPaths.resolvePath(relativePath);
  }
  // Fallback to regular path resolution
  return path.resolve(process.cwd(), relativePath);
}

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
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((directive, options) => {
    try {
      // Enable mock AST if requested
      if (options.mock) {
        process.env.MOCK_AST = 'true';
      }
      
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

// Command to extract directives from a file
program
  .command('extract')
  .description('Extract directives from a Meld document')
  .argument('<file>', 'Meld document file path')
  .option('-o, --output <file>', 'Output JSON file path')
  .action((file, options) => {
    try {
      // Resolve paths
      const resolvedFilePath = resolvePath(file);
      const resolvedOutputPath = options.output ? resolvePath(options.output) : undefined;

      const content = fs.readFileSync(resolvedFilePath, 'utf8');
      const directives = extractDirectives(content);

      const output = JSON.stringify(directives, null, 2);

      if (resolvedOutputPath) {
        fs.writeFileSync(resolvedOutputPath, output);
        console.log(`Extracted ${directives.length} directives to ${resolvedOutputPath}`);
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
  .option('-n, --name <n>', 'Type name', 'directive')
  .option('-o, --output <file>', 'Output file path')
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((directive, options) => {
    try {
      // Enable mock AST if requested
      if (options.mock) {
        process.env.MOCK_AST = 'true';
      }
      
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
  .option('-n, --name <n>', 'Test name', 'directive-test')
  .option('-o, --output <dir>', 'Output directory', './fixtures')
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((directive, options) => {
    try {
      // Enable mock AST if requested
      if (options.mock) {
        process.env.MOCK_AST = 'true';
      }
      
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
  .option('-n, --name <n>', 'Snapshot name', 'directive-snapshot')
  .option('-o, --output <dir>', 'Output directory', './snapshots')
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((directive, options) => {
    try {
      // Enable mock AST if requested
      if (options.mock) {
        process.env.MOCK_AST = 'true';
      }
      
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
  .argument('<n>', 'Snapshot name')
  .option('-s, --snapshots <dir>', 'Snapshots directory', './snapshots')
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((directive, name, options) => {
    try {
      // Enable mock AST if requested
      if (options.mock) {
        process.env.MOCK_AST = 'true';
      }
      
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
  .description('Process a batch of directive examples with enhanced type generation')
  .argument('<examples>', 'JSON file with examples')
  .option('-o, --output <dir>', 'Output directory', './generated')
  .option('--verbose', 'Enable verbose output', false)
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((examplesFile, options) => {
    try {
      // Enable mock AST if requested
      if (options.mock) {
        process.env.MOCK_AST = 'true';
      }

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
      processBatch(examples, options.output);

      console.log(`Processed ${examples.length} examples with enhanced type generation`);
      console.log(`Output directory: ${options.output}`);
    } catch (error: any) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error('Stack trace:', error.stack);
      }
    }
  });

// Command to process examples directory
program
  .command('process-examples')
  .description('Process examples from directory structure')
  .option('-d, --dir <dir>', 'Examples directory', './core/examples')
  .option('-o, --output <dir>', 'Output directory', './core/types')
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((options) => {
    try {
      // Enable mock AST if requested
      if (options.mock) {
        process.env.MOCK_AST = 'true';
      }
      
      processExampleDirs(options.dir, options.output);
      console.log(`Processed examples from ${options.dir}`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to generate consolidated types
program
  .command('consolidated-types')
  .description('Generate consolidated type system with discriminated unions')
  .option('-s, --snapshots <dir>', 'Snapshots directory', './core/examples/snapshots')
  .option('-o, --output <dir>', 'Output directory', './core/types')
  .action((options) => {
    try {
      generateConsolidatedTypes(options.snapshots, options.output);
      console.log(`Generated consolidated types in ${options.output}`);
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

// Command to run the full exploration workflow
program
  .command('workflow')
  .description('Run the full exploration workflow')
  .option('-e, --examples <dir>', 'Examples directory')
  .option('-o, --output <dir>', 'Output directory')
  .option('-s, --snapshots <dir>', 'Snapshots directory')
  .option('-t, --types <dir>', 'Types output directory')
  .option('-f, --fixtures <dir>', 'Fixtures output directory')
  .option('-d, --docs <dir>', 'Documentation output directory')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((options) => {
    try {
      // Create options object with only defined values
      const explorerOptions: Record<string, any> = {};

      if (options.config) explorerOptions.configPath = options.config;
      if (options.output) explorerOptions.outputDir = options.output;
      if (options.examples) explorerOptions.examplesDir = options.examples;
      if (options.snapshots) explorerOptions.snapshotsDir = options.snapshots;
      if (options.types) explorerOptions.typesDir = options.types;
      if (options.fixtures) explorerOptions.fixturesDir = options.fixtures;
      if (options.docs) explorerOptions.docsDir = options.docs;
      if (options.mock) explorerOptions.useMockParser = true;

      const explorer = new Explorer(explorerOptions);

      console.log('1. Processing examples directories...');
      explorer.processExampleDirs();

      console.log('2. Generating consolidated types...');
      explorer.generateConsolidatedTypes();

      console.log('3. Generating documentation...');
      explorer.generateDocs();

      console.log('Workflow completed successfully!');
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// Command to run the improved process-all workflow based on conventions
program
  .command('process-all')
  .description('Process all examples using convention-based structure with enhanced type generation')
  .option('-d, --dir <dir>', 'Root directory with examples', './core/examples')
  .option('-o, --output <dir>', 'Output directory for generated files', './core/ast')
  .option('-f, --fixtures <dir>', 'Directory for E2E fixtures', './core/fixtures')
  .option('-t, --tests <dir>', 'Directory for test fixtures', './core/ast/tests')
  .option('--verbose', 'Enable verbose output', false)
  .option('-m, --mock', 'Use mock AST for parsing')
  .action((options) => {
    try {
      // Enable mock AST if requested
      if (options.mock) {
        process.env.MOCK_AST = 'true';
      }

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
      processExampleDirs(options.dir, outputDir, undefined, {
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