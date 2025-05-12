/**
 * Enhanced batch processing utilities
 * 
 * This module provides improved batch processing that properly consolidates
 * AST nodes by directive kind and subtype, creating appropriate discriminated unions.
 */
import * as path from 'path';
import { parseDirective, parseFile } from './parse.js';
import { generateEnhancedTypes } from './generate/enhanced-types.js';
import { generateTestFixture, writeTestFixture } from './generate/fixtures.js';
import { generateSnapshot } from './generate/snapshots.js';
import { extractDirectives } from './extract-directives.js';
import type { IFileSystemAdapter } from './explorer.js';
import { nodeFsAdapter } from './fs-adapter.js';
import type { DirectiveNode } from './parse.js';
import { loadExamples as originalLoadExamples } from './batch.js';

/**
 * Example directive interface
 */
export interface Example {
  name: string;
  directive: string;
  description?: string;
}

/**
 * Load examples from a JSON file
 */
export function loadExamples(filePath: string, fileSystem?: IFileSystemAdapter): Example[] {
  return originalLoadExamples(filePath, fileSystem);
}

/**
 * E2E Test fixture interface
 */
export interface E2EFixture {
  name: string;
  input: string;
  expected: string;
  directives: string[];
  metadata: {
    kind: string;
    subtype: string;
    variant?: string;
  };
}

/**
 * Process a batch of directive examples with enhanced type generation
 */
export function processEnhancedBatch(
  examples: Example[],
  outputDir: string,
  fileSystem?: IFileSystemAdapter
): void {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;

  // Create output directories
  const dirs = {
    types: path.join(outputDir, 'types'),
    fixtures: path.join(outputDir, 'tests'),
    snapshots: path.join(outputDir, 'snapshots'),
    docs: path.join(outputDir, 'docs')
  };

  // Create all output directories
  Object.values(dirs).forEach(dir => {
    fsAdapter.mkdirSync(dir, { recursive: true });
  });

  // Storage for all parsed directives
  const parsedDirectives: DirectiveNode[] = [];
  
  // Process each example
  examples.forEach(({ name, directive }) => {
    try {
      // Parse directive
      const ast = parseDirective(directive);
      
      // Store for consolidated type generation
      parsedDirectives.push(ast);
      
      // Generate snapshot
      generateSnapshot(ast, name, dirs.snapshots, fsAdapter);
      
      // Generate test fixture
      const fixture = generateTestFixture(directive, ast, name);
      writeTestFixture(fixture, name, dirs.fixtures, fsAdapter);

      console.log(`Processed example: ${name}`);
    } catch (error: any) {
      console.error(`Error processing example ${name}:`, error.message);
    }
  });

  // Generate enhanced types
  generateEnhancedTypes(parsedDirectives, dirs.types, fsAdapter);
}

/**
 * Process examples from the enhanced convention-based directory structure
 * 
 * @param baseDir Root directory containing examples
 * @param outputDir Output directory for generated files
 * @param fileSystem Optional file system adapter
 * @param options Additional options including testsDir and fixturesDir
 */
export function processEnhancedExampleDirs(
  baseDir: string,
  outputDir: string,
  fileSystem?: IFileSystemAdapter,
  options: { testsDir?: string; fixturesDir?: string } = {}
): void {
  const fsAdapter = fileSystem || nodeFsAdapter;
  const { testsDir, fixturesDir } = options;

  // Storage for all parsed directives
  const allDirectives: DirectiveNode[] = [];
  const fixtures: E2EFixture[] = [];

  // Process valid examples
  const validDir = path.join(baseDir, 'valid');
  if (fsAdapter.existsSync(validDir)) {
    processEnhancedExamples(validDir, outputDir, allDirectives, fixtures, fsAdapter, options);
  } else {
    // If no valid subdirectory, treat baseDir as the root of directive kinds
    processEnhancedExamples(baseDir, outputDir, allDirectives, fixtures, fsAdapter, options);
  }

  // Process invalid examples
  // This would be implemented separately
  
  // Ensure output directories exist
  const typesDir = path.join(outputDir, 'types');
  const snapshotsDir = path.join(outputDir, 'snapshots');
  const testsOutDir = testsDir || path.join(outputDir, 'tests');
  const fixturesOutDir = fixturesDir || path.join(outputDir, 'e2e');
  
  [typesDir, snapshotsDir, testsOutDir, fixturesOutDir].forEach(dir => {
    if (!fsAdapter.existsSync(dir)) {
      fsAdapter.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Generate enhanced types from all collected directives
  if (allDirectives.length > 0) {
    generateEnhancedTypes(allDirectives, typesDir, fsAdapter);
  }
  
  // Generate E2E fixtures
  fixtures.forEach(fixture => {
    fsAdapter.writeFileSync(
      path.join(fixturesOutDir, `${fixture.name}.fixture.json`),
      JSON.stringify(fixture, null, 2)
    );
  });
}

/**
 * Process examples from the enhanced convention-based directory structure
 * 
 * @param baseDir Root directory containing examples
 * @param outputDir Output directory for generated files
 * @param allDirectives Array to collect all directives (for type generation)
 * @param fixtures Array to collect all E2E fixtures
 * @param fileSystem Optional file system adapter
 * @param options Additional options including testsDir and fixturesDir
 */
function processEnhancedExamples(
  baseDir: string,
  outputDir: string,
  allDirectives: DirectiveNode[],
  fixtures: E2EFixture[],
  fileSystem: IFileSystemAdapter,
  options: { testsDir?: string; fixturesDir?: string } = {}
): void {
  // Get all directive types (e.g., text, run, import)
  const directiveTypes = fileSystem.readdirSync(baseDir);
  
  for (const directiveKind of directiveTypes) {
    const kindDir = path.join(baseDir, directiveKind);
    
    // Skip if not a directory 
    if (!isDirectory(kindDir, fileSystem)) continue;

    // Get all subtypes (e.g., assignment, template)
    const subtypes = fileSystem.readdirSync(kindDir);

    for (const subtype of subtypes) {
      const subtypeDir = path.join(kindDir, subtype);
      
      // Skip if not a directory
      if (!isDirectory(subtypeDir, fileSystem)) continue;

      // Get all files in the subtype directory
      const files = fileSystem.readdirSync(subtypeDir);
      
      // Find all example files (base and variants)
      const exampleFiles = files.filter(file => 
        file.startsWith('example') && file.endsWith('.md'));
      
      for (const exampleFile of exampleFiles) {
        // Determine if this is a variant example
        const variant = exampleFile === 'example.md' 
          ? '' 
          : exampleFile.replace('example-', '').replace('.md', '');
        
        // Find corresponding expected output
        const expectedFile = variant 
          ? `expected-${variant}.md` 
          : 'expected.md';
        
        const examplePath = path.join(subtypeDir, exampleFile);
        const expectedPath = path.join(subtypeDir, expectedFile);
        
        // Process example and expected output
        try {
          processEnhancedExampleFile(
            examplePath, 
            fileSystem.existsSync(expectedPath) ? expectedPath : undefined,
            {
              kind: directiveKind,
              subtype: subtype,
              variant: variant || undefined
            },
            outputDir,
            allDirectives,
            fixtures,
            fileSystem,
            options
          );
        } catch (error: any) {
          console.error(`Error processing example ${examplePath}:`, error.message);
        }
      }
    }
  }
}

/**
 * Process a single example file and its expected output, collecting directives
 * 
 * @param examplePath Path to the example file
 * @param expectedPath Optional path to expected output file
 * @param metadata Metadata about the example (kind, subtype, variant)
 * @param outputDir Output directory for generated files
 * @param allDirectives Array to collect all directives (for type generation)
 * @param fixtures Array to collect all E2E fixtures
 * @param fileSystem File system adapter
 * @param options Additional options including testsDir and fixturesDir
 */
function processEnhancedExampleFile(
  examplePath: string,
  expectedPath: string | undefined,
  metadata: { kind: string; subtype: string; variant?: string },
  outputDir: string,
  allDirectives: DirectiveNode[],
  fixtures: E2EFixture[],
  fileSystem: IFileSystemAdapter,
  options: { testsDir?: string; fixturesDir?: string } = {}
): void {
  // Read example content
  const content = fileSystem.readFileSync(examplePath, 'utf8');
  
  // Extract directives
  const directives = extractDirectives(content);
  
  // Define output directories
  const snapshotsDir = path.join(outputDir, 'snapshots');
  const testsDir = options.testsDir || path.join(outputDir, 'tests');
  
  // Create output directories if they don't exist
  [snapshotsDir, testsDir].forEach(dir => {
    if (!fileSystem.existsSync(dir)) {
      fileSystem.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Process each directive in the example
  directives.forEach((directive, index) => {
    try {
      // Generate a unique name for this example
      const name = getExampleName(metadata.kind, metadata.subtype, metadata.variant, directives.length > 1 ? index + 1 : undefined);
      
      // Parse directive
      const ast = parseDirective(directive);
      
      // Add to collection for type generation
      allDirectives.push(ast);
      
      // Generate snapshot
      generateSnapshot(ast, name, snapshotsDir, fileSystem);
      
      // Generate fixture
      const fixture = generateTestFixture(directive, ast, name);
      writeTestFixture(fixture, name, testsDir, fileSystem);
      
      console.log(`Processed example: ${name}`);
    } catch (error: any) {
      console.error(`Error processing directive in ${examplePath}:`, error.message);
    }
  });
  
  // If expected output is available, create E2E fixture
  if (expectedPath) {
    try {
      const expectedContent = fileSystem.readFileSync(expectedPath, 'utf8');
      const fixtureName = getExampleName(metadata.kind, metadata.subtype, metadata.variant);
      
      // Create fixture
      const fixture: E2EFixture = {
        name: fixtureName,
        input: content,
        expected: expectedContent,
        directives,
        metadata
      };
      
      // Add to fixtures collection
      fixtures.push(fixture);
      
      console.log(`Created E2E fixture: ${fixtureName}`);
    } catch (error: any) {
      console.error(`Error creating E2E fixture for ${examplePath}:`, error.message);
    }
  }
}

/**
 * Generate a consistent name for examples based on kind, subtype, and variant
 */
function getExampleName(
  kind: string,
  subtype: string,
  variant?: string,
  index?: number
): string {
  let name = `${kind}-${subtype}`;
  if (variant) name += `-${variant}`;
  if (index !== undefined) name += `-${index}`;
  return name;
}

/**
 * Check if a path is a directory
 */
function isDirectory(dirPath: string, fileSystem: IFileSystemAdapter): boolean {
  try {
    return fileSystem.existsSync(dirPath);
  } catch (error) {
    return false;
  }
}