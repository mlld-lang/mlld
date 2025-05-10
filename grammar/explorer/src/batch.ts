/**
 * Batch processing utilities
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective } from './parse';
import { generateTypeInterface } from './generate/types';
import { generateTestFixture, writeTestFixture } from './generate/fixtures';
import { generateSnapshot } from './generate/snapshots';
import { generateDocumentation } from './generate/docs';

/**
 * Example directive interface
 */
export interface Example {
  name: string;
  directive: string;
  description?: string;
}

/**
 * Process a batch of directive examples
 */
export function processBatch(examples: Example[], outputDir: string): void {
  // Create output directories
  const dirs = {
    types: path.join(outputDir, 'types'),
    fixtures: path.join(outputDir, 'fixtures'),
    snapshots: path.join(outputDir, 'snapshots'),
    docs: path.join(outputDir, 'docs')
  };
  
  // Create all output directories
  Object.values(dirs).forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });
  
  // Process each example
  examples.forEach(({ name, directive }) => {
    try {
      // Parse directive
      const ast = parseDirective(directive);
      
      // Generate types
      const typeDefinition = generateTypeInterface(ast);
      fs.writeFileSync(path.join(dirs.types, `${name}.ts`), typeDefinition);
      
      // Generate test fixture
      const fixture = generateTestFixture(directive, ast, name);
      writeTestFixture(fixture, name, dirs.fixtures);
      
      // Generate snapshot
      generateSnapshot(ast, name, dirs.snapshots);
      
      console.log(`Processed example: ${name}`);
    } catch (error: any) {
      console.error(`Error processing example ${name}:`, error.message);
    }
  });
  
  // Generate documentation from all examples
  generateDocumentation(examples.map(e => e.name), dirs.snapshots, dirs.docs);
  
  // Generate index files
  generateIndexFiles(examples.map(e => e.name), dirs.types);
}

/**
 * Load examples from a JSON file
 */
export function loadExamples(filePath: string): Example[] {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Generate index files for exports
 */
function generateIndexFiles(names: string[], typesDir: string): void {
  const indexContent = names
    .map(name => {
      // Convert name to PascalCase for type name
      const typeName = name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('') + 'DirectiveNode';
      
      return `export { ${typeName} } from './${name}';`;
    })
    .join('\n');
  
  fs.writeFileSync(path.join(typesDir, 'index.ts'), indexContent);
}

/**
 * Process a directory of example files
 */
export function processDirectory(dirPath: string, outputDir: string, pattern = '*.meld'): void {
  // Implementation would scan dirPath for files matching pattern
  // For each file, extract the directive(s) and process them
  // This is a placeholder for future implementation
}

/**
 * Process multiple snapshot files at once
 */
export function processSnapshots(snapshotDir: string, outputDir: string): void {
  // Read all snapshot files
  const files = fs.readdirSync(snapshotDir)
    .filter(file => file.endsWith('.snapshot.json'));
  
  // Extract names
  const names = files.map(file => file.replace('.snapshot.json', ''));
  
  // Generate documentation
  generateDocumentation(names, snapshotDir, path.join(outputDir, 'docs'));
  
  console.log(`Processed ${files.length} snapshots`);
}