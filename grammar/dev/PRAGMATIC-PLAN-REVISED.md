# Pragmatic AST Explorer Implementation Plan (Revised)

This revised plan focuses on implementing the AST Explorer as a cleanly separated module within our codebase. This approach gives us immediate utility with the structure to evolve into a standalone package in the future.

## Module Location & Structure

We'll build the module in `grammar/explorer`, making it a distinct part of the codebase with clean separation of concerns.

```
grammar/
├── explorer/           # AST Explorer module
│   ├── src/            # Source code
│   │   ├── index.ts    # Main entry point
│   │   ├── parse.ts    # Parser adapter
│   │   ├── analyze.ts  # AST analysis utilities
│   │   ├── generate/   # Generation utilities
│   │   │   ├── types.ts     # Type generation
│   │   │   ├── fixtures.ts  # Test fixture generation
│   │   │   ├── docs.ts      # Documentation generation
│   │   ├── cli.ts      # Command-line interface
│   ├── examples/       # Example directives
│   ├── templates/      # Templates for generation
│   ├── tests/          # Module tests
│   ├── package.json    # Local package definition
│   ├── tsconfig.json   # TypeScript configuration
```

## Implementation Plan (5 Days)

### Day 1: Core Module Structure & Basic AST Parsing

**Goal**: Create the module structure with basic directive parsing capabilities.

1. Set up the module structure:
   - Create directory structure
   - Configure TypeScript
   - Define core interfaces
   - Create adapter for existing parser

2. Implement basic AST parser adapter:

```typescript
// explorer/src/parse.ts
import { parse as mlldParse } from '../../core/ast/grammar/parser';
import type { DirectiveNode } from '../../types/base';

/**
 * Parse a directive string and return the AST
 */
export function parseDirective(directive: string): DirectiveNode {
  try {
    // Parse and extract first node (assumed to be the directive)
    const result = mlldParse(directive);
    return result[0] as DirectiveNode;
  } catch (error) {
    throw new Error(`Failed to parse directive: ${error.message}`);
  }
}

/**
 * Parse a file containing one or more directives
 */
export function parseFile(filePath: string): DirectiveNode[] {
  // Implementation
}

/**
 * Convert a directive node to a normalized structure for analysis
 * This helps abstract away parser implementation details
 */
export function normalizeNode(node: DirectiveNode): NormalizedNode {
  // Implementation
}
```

3. Create simple CLI for exploring AST:

```typescript
// explorer/src/cli.ts
import { program } from 'commander';
import { parseDirective } from './parse';
import * as fs from 'fs';

program
  .name('mlld-ast-explorer')
  .description('Explore and analyze Mlld grammar AST')
  .version('0.1.0');

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
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

// Parse arguments and execute commands
if (require.main === module) {
  program.parse();
}
```

### Day 2: AST Analysis & Type Generation

**Goal**: Implement AST analysis and basic TypeScript type generation.

1. Create AST analysis utilities:

```typescript
// explorer/src/analyze.ts
import type { DirectiveNode } from '../../types/base';

/**
 * Analyze the structure of an AST node
 */
export function analyzeStructure(node: DirectiveNode): NodeAnalysis {
  return {
    kind: node.kind,
    subtype: node.subtype,
    valueProps: Object.keys(node.values || {}),
    rawProps: Object.keys(node.raw || {}),
    metaProps: Object.keys(node.meta || {})
  };
}

/**
 * Determine the TypeScript type for a value
 */
export function inferType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    // Check array elements and infer common type
    return inferArrayType(value);
  }
  if (typeof value === 'object') {
    // For complex objects, use any or generate interface
    return 'any'; // Can be enhanced with interface generation
  }
  // For primitive types
  return typeof value;
}

/**
 * Infer type for array elements
 */
function inferArrayType(arr: any[]): string {
  if (arr.length === 0) return 'any[]';
  
  // Check for common node types
  if (arr[0]?.type === 'VariableReference') {
    return 'VariableNodeArray';
  }
  if (arr[0]?.type === 'Text') {
    return 'ContentNodeArray';
  }
  
  // Otherwise use simple array type
  return `${inferType(arr[0])}[]`;
}
```

2. Implement type generation:

```typescript
// explorer/src/generate/types.ts
import type { DirectiveNode } from '../../../types/base';
import { analyzeStructure, inferType } from '../analyze';

/**
 * Generate a TypeScript interface for a directive node
 */
export function generateTypeInterface(node: DirectiveNode): string {
  const { kind, subtype } = node;
  const typeName = `${capitalize(kind)}${capitalize(subtype)}DirectiveNode`;
  
  // Generate interface content
  let interfaceContent = '';
  
  // Add imports
  interfaceContent += `import { DirectiveNode, TypedDirectiveNode } from '../base';\n`;
  interfaceContent += `import { ContentNodeArray, VariableNodeArray } from '../values';\n\n`;
  
  // Add interface declaration
  interfaceContent += `/**\n * ${typeName}\n */\n`;
  interfaceContent += `export interface ${typeName} extends TypedDirectiveNode<'${kind}', '${subtype}'> {\n`;
  
  // Add values
  interfaceContent += `  values: {\n`;
  Object.entries(node.values || {}).forEach(([key, value]) => {
    const valueType = inferType(value);
    interfaceContent += `    ${key}: ${valueType};\n`;
  });
  interfaceContent += `  };\n\n`;
  
  // Add raw
  interfaceContent += `  raw: {\n`;
  Object.entries(node.raw || {}).forEach(([key]) => {
    interfaceContent += `    ${key}: string;\n`;
  });
  interfaceContent += `  };\n\n`;
  
  // Add meta
  interfaceContent += `  meta: {\n`;
  Object.entries(node.meta || {}).forEach(([key, value]) => {
    const metaType = typeof value === 'object' ? 
      '{ [key: string]: any }' : typeof value;
    interfaceContent += `    ${key}: ${metaType};\n`;
  });
  interfaceContent += `  };\n`;
  
  // Close interface
  interfaceContent += `}\n`;
  
  return interfaceContent;
}

// Helper function to capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

3. Add type generation to CLI:

```typescript
// Add to explorer/src/cli.ts
program
  .command('generate-types')
  .description('Generate TypeScript types from a directive')
  .argument('<directive>', 'Directive to parse')
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
    } catch (error) {
      console.error('Error:', error.message);
    }
  });
```

### Day 3: Test Fixture Generation & Snapshots

**Goal**: Add test fixture generation and snapshot testing capabilities.

1. Implement snapshot generation:

```typescript
// explorer/src/generate/snapshots.ts
import * as fs from 'fs';
import * as path from 'path';
import type { DirectiveNode } from '../../../types/base';

/**
 * Create a snapshot file for a directive
 */
export function generateSnapshot(node: DirectiveNode, name: string, outputDir: string): string {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Create snapshot file path
  const snapshotPath = path.join(outputDir, `${name}.snapshot.json`);
  
  // Write snapshot to file
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(node, null, 2)
  );
  
  return snapshotPath;
}

/**
 * Compare node with existing snapshot
 * Returns true if snapshot matches, false if different
 */
export function compareWithSnapshot(node: DirectiveNode, name: string, snapshotDir: string): boolean {
  const snapshotPath = path.join(snapshotDir, `${name}.snapshot.json`);
  
  // Check if snapshot exists
  if (!fs.existsSync(snapshotPath)) {
    return false;
  }
  
  // Read existing snapshot
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  
  // Compare structures
  return JSON.stringify(node) === JSON.stringify(snapshot);
}
```

2. Implement test fixture generation:

```typescript
// explorer/src/generate/fixtures.ts
import * as fs from 'fs';
import * as path from 'path';
import type { DirectiveNode } from '../../../types/base';

/**
 * Generate a test fixture for a directive
 */
export function generateTestFixture(
  directive: string,
  node: DirectiveNode, 
  name: string
): string {
  // Generate test file content based on framework (default to Vitest)
  return `
import { describe, it, expect } from 'vitest';
import { parse } from '../path/to/parser';

describe('${name} directive', () => {
  it('should parse correctly', () => {
    const directive = \`${directive.replace(/`/g, '\\`')}\`;
    
    const result = parse(directive)[0];
    
    // Test key properties
    expect(result.type).toBe('${node.type}');
    expect(result.kind).toBe('${node.kind}');
    expect(result.subtype).toBe('${node.subtype}');
    
    // Full AST comparison
    expect(result).toMatchObject(${JSON.stringify(node, null, 2)});
  });
});
`;
}

/**
 * Write test fixture to file
 */
export function writeTestFixture(
  fixtureContent: string,
  name: string,
  outputDir: string
): string {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Create fixture file path
  const fixturePath = path.join(outputDir, `${name}.test.ts`);
  
  // Write fixture to file
  fs.writeFileSync(fixturePath, fixtureContent);
  
  return fixturePath;
}
```

3. Add fixture generation to CLI:

```typescript
// Add to explorer/src/cli.ts
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
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

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
    } catch (error) {
      console.error('Error:', error.message);
    }
  });
```

### Day 4: Batch Processing & Documentation Generation

**Goal**: Add batch processing for multiple directives and documentation generation.

1. Implement batch processing:

```typescript
// explorer/src/batch.ts
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective } from './parse';
import { generateTypeInterface } from './generate/types';
import { generateTestFixture, writeTestFixture } from './generate/fixtures';
import { generateSnapshot } from './generate/snapshots';
import { generateDocumentation } from './generate/docs';

interface Example {
  name: string;
  directive: string;
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
    } catch (error) {
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
      const typeName = name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('') + 'DirectiveNode';
      
      return `export { ${typeName} } from './${name}';`;
    })
    .join('\n');
  
  fs.writeFileSync(path.join(typesDir, 'index.ts'), indexContent);
}
```

2. Implement documentation generation:

```typescript
// explorer/src/generate/docs.ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate documentation from snapshots
 */
export function generateDocumentation(
  names: string[],
  snapshotsDir: string,
  outputDir: string
): void {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Generate an index file
  let indexContent = '# AST Documentation\n\n';
  indexContent += 'Generated documentation for Mlld directive AST structures.\n\n';
  indexContent += '## Available Directives\n\n';
  
  // Group by directive kind
  const directivesByKind = groupByDirectiveKind(names, snapshotsDir);
  
  Object.keys(directivesByKind).sort().forEach(kind => {
    indexContent += `- [${kind}](${kind}.md)\n`;
    
    // Generate documentation for this directive kind
    generateDirectiveDoc(kind, directivesByKind[kind], snapshotsDir, outputDir);
  });
  
  // Write index file
  fs.writeFileSync(path.join(outputDir, 'README.md'), indexContent);
}

/**
 * Group snapshots by directive kind
 */
function groupByDirectiveKind(names: string[], snapshotsDir: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  
  names.forEach(name => {
    const snapshotPath = path.join(snapshotsDir, `${name}.snapshot.json`);
    
    if (fs.existsSync(snapshotPath)) {
      try {
        const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        const kind = snapshot.kind;
        
        if (!result[kind]) {
          result[kind] = [];
        }
        
        result[kind].push(name);
      } catch (error) {
        console.warn(`Could not read snapshot for ${name}:`, error.message);
      }
    }
  });
  
  return result;
}

/**
 * Generate documentation for a directive kind
 */
function generateDirectiveDoc(
  kind: string,
  examples: string[],
  snapshotsDir: string,
  outputDir: string
): void {
  let content = `# ${capitalize(kind)} Directive\n\n`;
  content += `The \`@${kind}\` directive is used for...\n\n`;
  
  // List subtypes found in examples
  content += '## Subtypes\n\n';
  
  const subtypes = new Set<string>();
  const snapshots: Record<string, any> = {};
  
  // Collect subtypes and snapshots
  examples.forEach(name => {
    const snapshotPath = path.join(snapshotsDir, `${name}.snapshot.json`);
    if (fs.existsSync(snapshotPath)) {
      try {
        const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        snapshots[name] = snapshot;
        
        if (snapshot.subtype) {
          subtypes.add(snapshot.subtype);
        }
      } catch (error) {
        console.warn(`Could not read snapshot for ${name}:`, error.message);
      }
    }
  });
  
  // Add subtypes to content
  Array.from(subtypes).forEach(subtype => {
    content += `- [${subtype}](#${subtype})\n`;
  });
  
  content += '\n';
  
  // Document each subtype with example
  Array.from(subtypes).forEach(subtype => {
    content += `## ${subtype}\n\n`;
    
    // Find an example for this subtype
    const exampleName = examples.find(name => 
      snapshots[name] && snapshots[name].subtype === subtype
    );
    
    if (exampleName && snapshots[exampleName]) {
      const snapshot = snapshots[exampleName];
      
      content += '### AST Structure\n\n';
      content += '```json\n';
      content += JSON.stringify(snapshot, null, 2);
      content += '\n```\n\n';
      
      content += '### Values\n\n';
      content += 'The `values` object contains:\n\n';
      
      Object.keys(snapshot.values || {}).forEach(key => {
        content += `- \`${key}\`: ${describeValue(snapshot.values[key])}\n`;
      });
      
      content += '\n';
    }
  });
  
  // Write directive documentation file
  fs.writeFileSync(path.join(outputDir, `${kind}.md`), content);
}

/**
 * Describe a value for documentation
 */
function describeValue(value: any): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Empty array';
    if (value[0]?.type === 'VariableReference') return 'Variable references';
    if (value[0]?.type === 'Text') return 'Text content';
    return `Array of ${typeof value[0]}`;
  }
  return typeof value;
}

// Helper function to capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

3. Add batch processing to CLI:

```typescript
// Add to explorer/src/cli.ts
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
    } catch (error) {
      console.error('Error:', error.message);
    }
  });
```

### Day 5: Module Integration & Clean API Surface

**Goal**: Finalize the module structure with a clean API surface, integration tests, and documentation.

1. Create a clean API surface:

```typescript
// explorer/src/index.ts
/**
 * Mlld AST Explorer - Grammar-driven development tools
 */

// Core parsing functionality
export { 
  parseDirective, 
  parseFile,
  normalizeNode 
} from './parse';

// Generation utilities
export { 
  generateTypeInterface 
} from './generate/types';

export { 
  generateTestFixture,
  writeTestFixture
} from './generate/fixtures';

export { 
  generateSnapshot,
  compareWithSnapshot
} from './generate/snapshots';

export {
  generateDocumentation
} from './generate/docs';

// Batch processing
export {
  processBatch,
  loadExamples
} from './batch';

// Utility re-exports
export type { 
  DirectiveNode,
  TypedDirectiveNode
} from '../../types/base';

// Create and export the main Explorer class
import { Explorer } from './explorer';
export { Explorer };
export default Explorer;
```

2. Create the main Explorer class:

```typescript
// explorer/src/explorer.ts
import * as fs from 'fs';
import * as path from 'path';
import { parseDirective, parseFile } from './parse';
import { generateTypeInterface } from './generate/types';
import { generateTestFixture, writeTestFixture } from './generate/fixtures';
import { generateSnapshot, compareWithSnapshot } from './generate/snapshots';
import { generateDocumentation } from './generate/docs';
import { processBatch, loadExamples } from './batch';

export interface ExplorerOptions {
  outputDir?: string;
  snapshotsDir?: string;
  typesDir?: string;
  fixturesDir?: string;
  docsDir?: string;
}

/**
 * Main Explorer class for AST exploration and generation
 */
export class Explorer {
  private options: Required<ExplorerOptions>;
  
  constructor(options: ExplorerOptions = {}) {
    // Set default options
    this.options = {
      outputDir: options.outputDir || './generated',
      snapshotsDir: options.snapshotsDir || './generated/snapshots',
      typesDir: options.typesDir || './generated/types',
      fixturesDir: options.fixturesDir || './generated/fixtures',
      docsDir: options.docsDir || './generated/docs'
    };
    
    // Create output directories
    Object.values(this.options).forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * Parse a directive and get its AST
   */
  parseDirective(directive: string) {
    return parseDirective(directive);
  }
  
  /**
   * Generate TypeScript interface from a directive
   */
  generateTypes(directive: string, name: string): string {
    const ast = this.parseDirective(directive);
    const typeDefinition = generateTypeInterface(ast);
    
    const outputPath = path.join(this.options.typesDir, `${name}.ts`);
    fs.writeFileSync(outputPath, typeDefinition);
    
    return outputPath;
  }
  
  /**
   * Generate a test fixture from a directive
   */
  generateFixture(directive: string, name: string): string {
    const ast = this.parseDirective(directive);
    const fixture = generateTestFixture(directive, ast, name);
    
    return writeTestFixture(fixture, name, this.options.fixturesDir);
  }
  
  /**
   * Generate a snapshot from a directive
   */
  generateSnapshot(directive: string, name: string): string {
    const ast = this.parseDirective(directive);
    return generateSnapshot(ast, name, this.options.snapshotsDir);
  }
  
  /**
   * Process a batch of examples
   */
  processBatch(examplesPath: string): void {
    const examples = loadExamples(examplesPath);
    processBatch(examples, this.options.outputDir);
  }
  
  /**
   * Process a directory of example files
   */
  processDirectory(dir: string, pattern = '*.mlld'): void {
    // Implementation to process all files in a directory
  }
  
  /**
   * Generate documentation from snapshots
   */
  generateDocs(): void {
    // Get all snapshot names
    const snapshotFiles = fs.readdirSync(this.options.snapshotsDir)
      .filter(file => file.endsWith('.snapshot.json'))
      .map(file => file.replace('.snapshot.json', ''));
    
    generateDocumentation(snapshotFiles, this.options.snapshotsDir, this.options.docsDir);
  }
}
```

3. Create integration tests:

```typescript
// explorer/tests/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Explorer } from '../src/explorer';

describe('AST Explorer Integration', () => {
  const testOutputDir = path.join(__dirname, 'test-output');
  let explorer: Explorer;
  
  beforeEach(() => {
    // Create fresh explorer instance for each test
    explorer = new Explorer({
      outputDir: testOutputDir
    });
    
    // Ensure output directory exists
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });
  
  afterEach(() => {
    // Clean up test output
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });
  
  it('should parse a directive successfully', () => {
    const directive = '@text greeting = "Hello, world!"';
    const ast = explorer.parseDirective(directive);
    
    expect(ast).toBeDefined();
    expect(ast.kind).toBe('text');
    expect(ast.subtype).toBe('textAssignment');
  });
  
  it('should generate types from a directive', () => {
    const directive = '@text greeting = "Hello, world!"';
    const outputPath = explorer.generateTypes(directive, 'text-assignment');
    
    expect(fs.existsSync(outputPath)).toBe(true);
    const content = fs.readFileSync(outputPath, 'utf8');
    
    expect(content).toContain('export interface TextAssignmentDirectiveNode');
    expect(content).toContain("extends TypedDirectiveNode<'text', 'textAssignment'>");
  });
  
  it('should generate a test fixture', () => {
    const directive = '@text greeting = "Hello, world!"';
    const outputPath = explorer.generateFixture(directive, 'text-assignment');
    
    expect(fs.existsSync(outputPath)).toBe(true);
    const content = fs.readFileSync(outputPath, 'utf8');
    
    expect(content).toContain("describe('text-assignment directive'");
    expect(content).toContain("expect(result.kind).toBe('text')");
  });
  
  it('should process a batch of examples', () => {
    // Create test examples file
    const examplesPath = path.join(testOutputDir, 'examples.json');
    const examples = [
      {
        name: 'text-assignment',
        directive: '@text greeting = "Hello, world!"'
      },
      {
        name: 'text-template',
        directive: '@text template = [[Template with {{var}}]]'
      }
    ];
    
    fs.writeFileSync(examplesPath, JSON.stringify(examples, null, 2));
    
    // Process the batch
    explorer.processBatch(examplesPath);
    
    // Check outputs
    expect(fs.existsSync(path.join(testOutputDir, 'types', 'text-assignment.ts'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'types', 'text-template.ts'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'snapshots', 'text-assignment.snapshot.json'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'docs', 'README.md'))).toBe(true);
  });
});
```

4. Create package.json for the module:

```json
{
  "name": "mlld-ast-explorer",
  "version": "0.1.0",
  "description": "AST explorer tools for Mlld grammar",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "cli": "ts-node src/cli.ts"
  },
  "dependencies": {
    "commander": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^16.0.0",
    "ts-node": "^10.0.0",
    "typescript": "^4.5.0",
    "vitest": "^0.30.0"
  }
}
```

5. Create examples and documentation:

```markdown
// explorer/README.md
# Mlld AST Explorer

A tool for exploring and analyzing the Abstract Syntax Tree (AST) produced by Mlld's grammar parser.

## Features

- Parse directives and visualize their AST structure
- Generate TypeScript interfaces from AST nodes
- Create test fixtures for grammar parsing
- Generate documentation from AST snapshots
- Process batches of examples

## Usage

### Command Line

```bash
# Explore a directive's AST
npm run cli -- explore '@text greeting = "Hello, world!"'

# Generate TypeScript interfaces
npm run cli -- generate-types '@text greeting = "Hello, world!"' -o ./types/text.ts

# Generate a test fixture
npm run cli -- generate-fixture '@text greeting = "Hello, world!"' -n text-test -o ./fixtures

# Process a batch of examples
npm run cli -- batch examples.json -o ./generated
```

### Programmatic Usage

```typescript
import { Explorer } from 'mlld-ast-explorer';

// Create an explorer instance
const explorer = new Explorer({
  outputDir: './generated'
});

// Parse a directive
const ast = explorer.parseDirective('@text greeting = "Hello, world!"');
console.log(JSON.stringify(ast, null, 2));

// Generate types from a directive
explorer.generateTypes('@text greeting = "Hello, world!"', 'text-assignment');

// Process a batch of examples
explorer.processBatch('./examples.json');
```

## Example JSON Structure

```json
[
  {
    "name": "text-assignment",
    "directive": "@text greeting = \"Hello, world!\""
  },
  {
    "name": "text-template",
    "directive": "@text template = [[Template with {{var}}]]"
  }
]
```
```

## Integration with Build Process

To integrate the AST Explorer with the Mlld build process, we can add a script to handle type generation as part of the build:

```typescript
// explorer/scripts/generate-types.ts
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
```

## Future Extensions

Once this foundation is built, we can easily extend the explorer with:

1. **Watch Mode**: Automatically regenerate types when grammar changes
2. **Visual Explorer**: Web-based AST visualization
3. **Type Comparison**: Diff interface for detecting breaking changes 
4. **VSCode Integration**: Editor integration for immediate feedback

## Conclusion

This pragmatic approach creates a cleanly separated module that provides immediate utility while establishing a foundation for future development. The structure is organized to allow easy expansion and potential extraction as a standalone package in the future.

By focusing on core functionality first, we can get this up and running in 5 days while setting the stage for the more ambitious features outlined in the astronaut design documents.