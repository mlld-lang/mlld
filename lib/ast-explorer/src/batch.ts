/**
 * Batch processing utilities
 */
import * as path from 'path';
import { parseDirective, parseFile } from './parse.js';
import { generateTypeInterface } from './generate/types.js';
import { generateTestFixture, writeTestFixture } from './generate/fixtures.js';
import { generateSnapshot } from './generate/snapshots.js';
import { generateDocumentation } from './generate/docs.js';
import { extractDirectives } from './extract-directives.js';
import type { IFileSystemAdapter } from './explorer.js';
import { nodeFsAdapter } from './fs-adapter.js';

/**
 * Example directive interface
 */
export interface Example {
  name: string;
  directive: string;
  description?: string;
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
 * Process a batch of directive examples
 */
export function processBatch(
  examples: Example[],
  outputDir: string,
  fileSystem?: IFileSystemAdapter
): void {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;

  // Create output directories
  const dirs = {
    types: path.join(outputDir, 'types'),
    fixtures: path.join(outputDir, 'fixtures'),
    snapshots: path.join(outputDir, 'snapshots'),
    docs: path.join(outputDir, 'docs')
  };

  // Create all output directories
  Object.values(dirs).forEach(dir => {
    fsAdapter.mkdirSync(dir, { recursive: true });
  });

  // Process each example
  examples.forEach(({ name, directive }) => {
    try {
      // Parse directive
      const ast = parseDirective(directive);

      // Generate types
      const typeDefinition = generateTypeInterface(ast);
      fsAdapter.writeFileSync(path.join(dirs.types, `${name}.ts`), typeDefinition);

      // Generate test fixture
      const fixture = generateTestFixture(directive, ast, name);
      writeTestFixture(fixture, name, dirs.fixtures, fsAdapter);

      // Generate snapshot
      generateSnapshot(ast, name, dirs.snapshots, fsAdapter);

      console.log(`Processed example: ${name}`);
    } catch (error: any) {
      console.error(`Error processing example ${name}:`, error.message);
    }
  });

  // Generate documentation from all examples
  generateDocumentation(examples.map(e => e.name), dirs.snapshots, dirs.docs, fsAdapter);

  // Generate index files
  generateIndexFiles(examples.map(e => e.name), dirs.types, fsAdapter);
}

/**
 * Load examples from a JSON file
 */
export function loadExamples(filePath: string, fileSystem?: IFileSystemAdapter): Example[] {
  const fsAdapter = fileSystem || nodeFsAdapter;
  return JSON.parse(fsAdapter.readFileSync(filePath, 'utf8'));
}

/**
 * Process examples from the convention-based directory structure
 * 
 * Supports structure like:
 * core/examples/
 * ├── directivekind/             # e.g., text, run, import
 * │   └── directivesubtype/      # e.g., assignment, template
 * │       ├── example.md         # Base example
 * │       ├── expected.md        # Expected output for base example
 * │       ├── example-variant.md # Variant example (e.g., multiline)
 * │       └── expected-variant.md # Expected output for variant
 */
export function processExampleDirs(
  baseDir: string,
  outputDir: string,
  fileSystem?: IFileSystemAdapter,
  options: { testsDir?: string; fixturesDir?: string } = {}
): void {
  const fsAdapter = fileSystem || nodeFsAdapter;
  const { testsDir, fixturesDir } = options;

  // Process valid examples
  const validDir = path.join(baseDir, 'valid');
  if (fsAdapter.existsSync(validDir)) {
    processConventionalExamples(validDir, outputDir, fsAdapter, testsDir, fixturesDir);
  } else {
    // If no valid subdirectory, treat baseDir as the root of directive kinds
    processConventionalExamples(baseDir, outputDir, fsAdapter, testsDir, fixturesDir);
  }

  // Process invalid examples
  const invalidDir = path.join(baseDir, 'invalid');
  if (fsAdapter.existsSync(invalidDir)) {
    processInvalidExamples(invalidDir, outputDir, fsAdapter);
  }
}

/**
 * Process examples using the convention-based directory structure
 */
function processConventionalExamples(
  baseDir: string,
  outputDir: string,
  fileSystem: IFileSystemAdapter,
  testsDir?: string,
  fixturesDir?: string
): void {
  // Get all directive types (e.g., text, run, import)
  const directiveTypes = fileSystem.readdirSync(baseDir);
  
  // Track all processed examples for consolidated type generation
  const processedExamples: {
    kind: string;
    subtype: string;
    variant?: string;
    name: string;
  }[] = [];

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
          processExampleFile(
            examplePath,
            fileSystem.existsSync(expectedPath) ? expectedPath : undefined,
            {
              kind: directiveKind,
              subtype: subtype,
              variant: variant || undefined
            },
            outputDir,
            fileSystem,
            { testsDir, fixturesDir }
          );
          
          // Add to processed examples list
          processedExamples.push({
            kind: directiveKind,
            subtype: subtype,
            variant: variant || undefined,
            name: getExampleName(directiveKind, subtype, variant)
          });
          
        } catch (error: any) {
          console.error(`Error processing example ${examplePath}:`, error.message);
        }
      }
    }
  }

  // Generate consolidated type files based on processed examples
  generateConsolidatedTypeFiles(processedExamples, path.join(outputDir, 'types'), fileSystem);
}

/**
 * Process a single example file and its expected output
 */
function processExampleFile(
  examplePath: string,
  expectedPath: string | undefined,
  metadata: { kind: string; subtype: string; variant?: string },
  outputDir: string,
  fileSystem: IFileSystemAdapter,
  options: { testsDir?: string; fixturesDir?: string } = {}
): void {
  // Read example content
  const content = fileSystem.readFileSync(examplePath, 'utf8');
  
  // Extract directives
  const directives = extractDirectives(content);
  
  // Create output directories
  const dirs = {
    types: path.join(outputDir, 'types'),
    fixtures: path.join(options.testsDir || path.join(outputDir, 'tests')),
    snapshots: path.join(outputDir, 'snapshots'),
    e2e: path.join(options.fixturesDir || path.join(outputDir, 'e2e'))
  };
  
  Object.values(dirs).forEach(dir => {
    fileSystem.mkdirSync(dir, { recursive: true });
  });
  
  // For each directive in the example
  directives.forEach((directive, index) => {
    try {
      // Generate a unique name for this example
      const name = getExampleName(metadata.kind, metadata.subtype, metadata.variant, directives.length > 1 ? index + 1 : undefined);
      
      // Parse directive
      const ast = parseDirective(directive);
      
      // Generate types
      const typeDefinition = generateTypeInterface(ast);
      fileSystem.writeFileSync(path.join(dirs.types, `${name}.ts`), typeDefinition);
      
      // Generate fixture
      const fixture = generateTestFixture(directive, ast, name);
      writeTestFixture(fixture, name, dirs.fixtures, fileSystem);
      
      // Generate snapshot
      generateSnapshot(ast, name, dirs.snapshots, fileSystem);
      
      console.log(`Processed example: ${name}`);
    } catch (error: any) {
      console.error(`Error processing directive in ${examplePath}:`, error.message);
    }
  });
  
  // If expected output is available, create E2E fixture
  if (expectedPath) {
    try {
      const expectedContent = fileSystem.readFileSync(expectedPath, 'utf8');
      createE2EFixture(
        content,
        expectedContent,
        metadata,
        dirs.e2e,
        fileSystem
      );
    } catch (error: any) {
      console.error(`Error creating E2E fixture for ${examplePath}:`, error.message);
    }
  }
}

/**
 * Create an E2E test fixture from example and expected output
 */
function createE2EFixture(
  exampleContent: string,
  expectedContent: string,
  metadata: { kind: string; subtype: string; variant?: string },
  outputDir: string,
  fileSystem: IFileSystemAdapter
): void {
  // Generate a name for the fixture
  const name = getExampleName(metadata.kind, metadata.subtype, metadata.variant);
  
  // Extract directives
  const directives = extractDirectives(exampleContent);
  
  // Create fixture
  const fixture: E2EFixture = {
    name,
    input: exampleContent,
    expected: expectedContent,
    directives,
    metadata
  };
  
  // Write fixture to file
  fileSystem.writeFileSync(
    path.join(outputDir, `${name}.fixture.json`),
    JSON.stringify(fixture, null, 2)
  );
  
  console.log(`Created E2E fixture: ${name}`);
}

/**
 * Process invalid examples
 */
function processInvalidExamples(
  invalidDir: string,
  outputDir: string,
  fileSystem: IFileSystemAdapter
): void {
  // Implementation similar to processConventionalExamples but for error cases
  console.log("Processing invalid examples not yet implemented");
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

/**
 * Generate index files for exports
 */
function generateIndexFiles(
  names: string[],
  typesDir: string,
  fileSystem: IFileSystemAdapter
): void {
  const indexContent = names
    .map(name => {
      // Convert name to PascalCase for type name
      const typeName = name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('') + 'DirectiveNode';

      return `export { ${typeName} } from './${name}.js';`;
    })
    .join('\n');

  fileSystem.writeFileSync(path.join(typesDir, 'index.ts'), indexContent);
}

/**
 * Generate consolidated type files based on examples
 */
function generateConsolidatedTypeFiles(
  examples: Array<{ kind: string; subtype: string; variant?: string; name: string }>,
  typesDir: string,
  fileSystem: IFileSystemAdapter
): void {
  // Group examples by kind
  const kindMap: Record<string, string[]> = {};
  
  for (const example of examples) {
    if (!kindMap[example.kind]) {
      kindMap[example.kind] = [];
    }
    
    // Add type name
    const typeName = example.name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('') + 'DirectiveNode';

    // Store the file name along with the type name
    if (!kindMap[example.kind].includes(typeName)) {
      kindMap[example.kind].push(typeName);
    }
  }
  
  // Create union types for each kind
  for (const [kind, typeNames] of Object.entries(kindMap)) {
    const kindTypeName = kind.charAt(0).toUpperCase() + kind.slice(1) + 'DirectiveNode';

    const imports = typeNames
      .map(typeName => {
        // Get the base name without the 'DirectiveNode' suffix
        const baseName = typeName.replace('DirectiveNode', '');

        // Convert to kebab-case for file naming
        const fileName = baseName
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .toLowerCase();

        return `import { ${typeName} } from './${fileName}';`;
      })
      .join('\n');
    
    const unionType = `
/**
 * Union type for all ${kind} directive nodes
 */
export type ${kindTypeName} = 
  ${typeNames.map(name => `| ${name}`).join('\n  ')}
`;
    
    const content = `${imports}\n\n${unionType}`;
    fileSystem.writeFileSync(path.join(typesDir, `${kind}.ts`), content);
    
    console.log(`Generated consolidated type for ${kind}`);
  }
  
  // Generate main union type for all directives
  if (Object.keys(kindMap).length > 0) {
    const mainImports = Object.keys(kindMap)
      .map(kind => {
        const typeName = kind.charAt(0).toUpperCase() + kind.slice(1) + 'DirectiveNode';
        return `import { ${typeName} } from './${kind}.js';`;
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
    fileSystem.writeFileSync(path.join(typesDir, 'directives.ts'), mainContent);
    
    console.log('Generated main directive union type');
  }
}

/**
 * Generate a consolidated types file based on directive kind
 */
export function generateConsolidatedTypes(
  snapshotsDir: string,
  typesDir: string,
  fileSystem?: IFileSystemAdapter
): void {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;

  // Read all snapshot files
  const files = fsAdapter.readdirSync(snapshotsDir)
    .filter(file => file.endsWith('.snapshot.json'));

  // Group by directive kind
  const kindMap: Record<string, string[]> = {};

  for (const file of files) {
    try {
      const snapshot = JSON.parse(fsAdapter.readFileSync(path.join(snapshotsDir, file), 'utf8'));
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
      .map(typeName => {
        // Get the base name without the 'DirectiveNode' suffix
        const baseName = typeName.replace('DirectiveNode', '');

        // Convert to kebab-case for file naming
        const fileName = baseName
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .toLowerCase();

        return `import { ${typeName} } from './${fileName}';`;
      })
      .join('\n');

    const unionType = `
/**
 * Union type for all ${kind} directive nodes
 */
export type ${kindTypeName} = 
  ${typeNames.map(name => `| ${name}`).join('\n  ')}
`;

    const content = `${imports}\n\n${unionType}`;
    fsAdapter.writeFileSync(path.join(typesDir, `${kind}.ts`), content);

    console.log(`Generated consolidated type for ${kind}`);
  }

  // Generate main union type for all directives
  const mainImports = Object.keys(kindMap)
    .map(kind => {
      const typeName = kind.charAt(0).toUpperCase() + kind.slice(1) + 'DirectiveNode';
      return `import { ${typeName} } from './${kind}.js';`
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
  fsAdapter.writeFileSync(path.join(typesDir, 'directives.ts'), mainContent);

  console.log('Generated main directive union type');
}

/**
 * Process multiple snapshot files at once
 */
export function processSnapshots(
  snapshotDir: string,
  outputDir: string,
  fileSystem?: IFileSystemAdapter
): void {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;

  // Read all snapshot files
  const files = fsAdapter.readdirSync(snapshotDir)
    .filter(file => file.endsWith('.snapshot.json'));

  // Extract names
  const names = files.map(file => file.replace('.snapshot.json', ''));

  // Generate documentation
  generateDocumentation(names, snapshotDir, path.join(outputDir, 'docs'), fsAdapter);

  // Generate consolidated types
  generateConsolidatedTypes(snapshotDir, path.join(outputDir, 'types'), fsAdapter);

  console.log(`Processed ${files.length} snapshots`);
}