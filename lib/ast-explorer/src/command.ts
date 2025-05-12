#!/usr/bin/env node
/**
 * Command-line interface for AST Explorer
 *
 * This module provides a CLI for AST exploration, batch processing,
 * and type generation with discriminated unions.
 */
import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective } from './parse.js';
import { generateTypeInterface } from './generate/types.js';
import { generateTestFixture, writeTestFixture } from './generate/fixtures.js';
import { generateSnapshot, compareWithSnapshot } from './generate/snapshots.js';
import { generateDocumentation, generateExamplesDoc } from './generate/docs.js';
import {
  loadExamples,
  processBatch,
  processExampleDirs,
  generateConsolidatedTypes
} from './batch.js';
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
  .description('Process a batch of directive examples with type generation')
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

      console.log(`Processed ${examples.length} examples with type generation`);
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

// Command to validate AST explorer output
program
  .command('validate')
  .description('Validate generated AST explorer output')
  .option('-s, --snapshots <dir>', 'Snapshots directory', './core/ast/snapshots')
  .option('-t, --types <dir>', 'Types directory', './core/ast/types')
  .option('-f, --fixtures <dir>', 'Fixtures directory', './core/ast/fixtures')
  .option('--verbose', 'Enable verbose output', false)
  .action((options) => {
    try {
      // Validate snapshots
      if (fs.existsSync(options.snapshots)) {
        const snapshots = fs.readdirSync(options.snapshots).filter(f => f.endsWith('.json'));
        console.log(`✅ Found ${snapshots.length} snapshots in ${options.snapshots}`);
      } else {
        console.error(`❌ Snapshots directory not found: ${options.snapshots}`);
      }

      // Validate types
      if (fs.existsSync(options.types)) {
        const typeFiles = fs.readdirSync(options.types).filter(f => f.endsWith('.ts'));
        console.log(`✅ Found ${typeFiles.length} type files in ${options.types}`);
      } else {
        console.error(`❌ Types directory not found: ${options.types}`);
      }

      // Validate fixtures
      if (fs.existsSync(options.fixtures)) {
        const fixtures = fs.readdirSync(options.fixtures).filter(f => f.endsWith('.ts'));
        console.log(`✅ Found ${fixtures.length} fixtures in ${options.fixtures}`);
      } else {
        console.error(`❌ Fixtures directory not found: ${options.fixtures}`);
      }

      console.log('Validation completed.');
    } catch (error: any) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error('Stack trace:', error.stack);
      }
    }
  });

// Command to generate EXAMPLES.md document
program
  .command('generate-examples-doc')
  .description('Generate EXAMPLES.md with directive types and examples')
  .option('-e, --examples <dir>', 'Examples directory', './core/examples')
  .option('-s, --snapshots <dir>', 'Snapshots directory', './core/ast/snapshots')
  .option('-o, --output <file>', 'Output file path', './core/examples/EXAMPLES.md')
  .option('--verbose', 'Enable verbose output', false)
  .action((options) => {
    try {
      if (options.verbose) {
        console.log('Configuration:');
        console.log(`- Examples directory: ${options.examples}`);
        console.log(`- Snapshots directory: ${options.snapshots}`);
        console.log(`- Output file: ${options.output}`);
      }

      // Check if examples directory exists
      if (!fs.existsSync(options.examples)) {
        console.error(`Examples directory not found: ${options.examples}`);
        return;
      }

      // Check if snapshots directory exists
      if (!fs.existsSync(options.snapshots)) {
        console.error(`Snapshots directory not found: ${options.snapshots}`);
        return;
      }

      // Generate the EXAMPLES.md document
      generateExamplesDoc(
        options.examples,
        options.snapshots,
        options.output
      );

      console.log(`Generated EXAMPLES.md at ${options.output}`);
    } catch (error: any) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error('Stack trace:', error.stack);
      }
    }
  });

// Command to clean generated files
program
  .command('clean')
  .description('Clean generated AST explorer files')
  .option('-o, --output <dir>', 'Base output directory', './core/ast')
  .option('-f, --fixtures <dir>', 'Fixtures directory', './core/fixtures')
  .option('--verbose', 'Enable verbose output', false)
  .option('--force', 'Force cleanup even if directories are missing', false)
  .action((options) => {
    try {
      const dirsToClean = [
        path.join(options.output, 'snapshots'),
        path.join(options.output, 'types'),
        path.join(options.output, 'docs'),
        path.join(options.output, 'tests'),
        options.fixtures
      ];

      console.log('Cleaning generated AST explorer files...');

      for (const dir of dirsToClean) {
        try {
          if (fs.existsSync(dir)) {
            // Delete contents but keep directory
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const filePath = path.join(dir, file);
              fs.rmSync(filePath, { recursive: true, force: true });
            }
            console.log(`✅ Cleaned ${dir}`);
          } else {
            if (options.verbose || options.force) {
              console.log(`⚠️ Directory not found: ${dir}`);
            }

            if (options.force) {
              fs.mkdirSync(dir, { recursive: true });
              console.log(`✅ Created empty directory: ${dir}`);
            }
          }
        } catch (error: any) {
          console.error(`❌ Error cleaning ${dir}:`, error.message);
        }
      }

      console.log('Cleanup completed!');
    } catch (error: any) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error('Stack trace:', error.stack);
      }
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

// Command to run the process-all workflow based on conventions
program
  .command('process-all')
  .description('Process all examples using convention-based directory structure')
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

      // Process examples using convention-based approach
      processExampleDirs(options.dir, outputDir, undefined, {
        testsDir: testsDir,
        fixturesDir: fixturesDir
      });

      console.log('Type generation completed successfully!');
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