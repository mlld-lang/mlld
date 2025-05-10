/**
 * Batch processing utilities
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective, parseFile } from './parse';
import { generateTypeInterface } from './generate/types';
import { generateTestFixture, writeTestFixture } from './generate/fixtures';
import { generateSnapshot } from './generate/snapshots';
import { generateDocumentation } from './generate/docs';
import { extractDirectives } from './extract-directives';

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
 * Process examples from the new directory structure
 */
export function processExampleDirs(baseDir: string, outputDir: string): void {
  // Process valid examples
  const validDir = path.join(baseDir, 'valid');
  if (fs.existsSync(validDir)) {
    processValidExamples(validDir, outputDir);
  }
  
  // Process invalid examples
  const invalidDir = path.join(baseDir, 'invalid');
  if (fs.existsSync(invalidDir)) {
    processInvalidExamples(invalidDir, outputDir);
  }
}

/**
 * Process valid examples
 */
function processValidExamples(validDir: string, outputDir: string): void {
  // Get all directive types (e.g., text, run, import)
  const directiveTypes = fs.readdirSync(validDir);
  
  for (const directiveType of directiveTypes) {
    const typeDir = path.join(validDir, directiveType);
    
    // Skip if not a directory
    if (!fs.statSync(typeDir).isDirectory()) continue;
    
    // Get all subtypes (e.g., assignment, template)
    const subtypes = fs.readdirSync(typeDir);
    
    for (const subtype of subtypes) {
      const subtypeDir = path.join(typeDir, subtype);
      
      // Skip if not a directory
      if (!fs.statSync(subtypeDir).isDirectory()) continue;
      
      // Check for example.md
      const examplePath = path.join(subtypeDir, 'example.md');
      if (!fs.existsSync(examplePath)) continue;
      
      // Read example content
      const content = fs.readFileSync(examplePath, 'utf8');
      
      // Extract directives
      const directives = extractDirectives(content);
      
      // Process each directive
      directives.forEach((directive, index) => {
        try {
          // Generate unique name
          const name = `${directiveType}-${subtype}-${index + 1}`;
          
          // Parse directive
          const ast = parseDirective(directive);
          
          // Create output directories
          const dirs = {
            types: path.join(outputDir, 'types'),
            fixtures: path.join(outputDir, 'fixtures'),
            snapshots: path.join(outputDir, 'snapshots')
          };
          
          Object.values(dirs).forEach(dir => {
            fs.mkdirSync(dir, { recursive: true });
          });
          
          // Generate types
          const typeDefinition = generateTypeInterface(ast);
          fs.writeFileSync(path.join(dirs.types, `${name}.ts`), typeDefinition);
          
          // Generate fixture
          const fixture = generateTestFixture(directive, ast, name);
          writeTestFixture(fixture, name, dirs.fixtures);
          
          // Generate snapshot
          generateSnapshot(ast, name, dirs.snapshots);
          
          console.log(`Processed example: ${name}`);
        } catch (error: any) {
          console.error(`Error processing example ${directiveType}-${subtype}:`, error.message);
        }
      });
    }
  }
}

/**
 * Process invalid examples
 */
function processInvalidExamples(invalidDir: string, outputDir: string): void {
  // Implementation similar to processValidExamples but for error cases
  // This would extract the directives and create fixtures that include expected errors
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
 * Generate a consolidated types file based on directive kind
 */
export function generateConsolidatedTypes(snapshotsDir: string, typesDir: string): void {
  // Read all snapshot files
  const files = fs.readdirSync(snapshotsDir)
    .filter(file => file.endsWith('.snapshot.json'));
    
  // Group by directive kind
  const kindMap: Record<string, string[]> = {};
  
  for (const file of files) {
    try {
      const snapshot = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf8'));
      const { kind, subtype } = snapshot;
      
      if (!kind) continue;
      
      if (!kindMap[kind]) {
        kindMap[kind] = [];
      }
      
      // Add type name
      const name = file.replace('.snapshot.json', '');
      const typeName = name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('') + 'DirectiveNode';
      
      if (!kindMap[kind].includes(typeName)) {
        kindMap[kind].push(typeName);
      }
    } catch (error) {
      console.error(`Error processing snapshot ${file}:`, error);
    }
  }
  
  // Create consolidated type files
  for (const [kind, typeNames] of Object.entries(kindMap)) {
    const kindTypeName = kind.charAt(0).toUpperCase() + kind.slice(1) + 'DirectiveNode';
    
    const imports = typeNames
      .map(typeName => `import { ${typeName} } from './${typeName.replace('DirectiveNode', '').toLowerCase()}';`)
      .join('\n');
    
    const unionType = `
/**
 * Union type for all ${kind} directive nodes
 */
export type ${kindTypeName} = 
  ${typeNames.map(name => `| ${name}`).join('\n  ')}
`;
    
    const content = `${imports}\n\n${unionType}`;
    fs.writeFileSync(path.join(typesDir, `${kind}.ts`), content);
    
    console.log(`Generated consolidated type for ${kind}`);
  }
  
  // Generate main union type for all directives
  const mainImports = Object.keys(kindMap)
    .map(kind => {
      const typeName = kind.charAt(0).toUpperCase() + kind.slice(1) + 'DirectiveNode';
      return `import { ${typeName} } from './${kind}';`
    })
    .join('\n');
    
  const mainUnion = `
/**
 * Union type for all directive nodes
 */
export type DirectiveNodeUnion = 
  ${Object.keys(kindMap)
    .map(kind => `| ${kind.charAt(0).toUpperCase() + kind.slice(1)}DirectiveNode`)
    .join('\n  ')}
`;
  
  const mainContent = `${mainImports}\n\n${mainUnion}`;
  fs.writeFileSync(path.join(typesDir, 'index.ts'), mainContent);
  
  console.log('Generated main directive union type');
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
  
  // Generate consolidated types
  generateConsolidatedTypes(snapshotDir, path.join(outputDir, 'types'));
  
  console.log(`Processed ${files.length} snapshots`);
}