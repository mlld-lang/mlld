/**
 * Batch processing utilities
 *
 * This module provides batch processing that properly consolidates
 * AST nodes by directive kind and subtype, creating appropriate discriminated unions.
 */
import * as path from 'path';
import { parseDirective, parseFile } from './parse.js';
import { generateTypeInterface, generateTypeFile } from './generate/types.js';
import { generateTestFixture, writeTestFixture } from './generate/fixtures.js';
import { generateSnapshot } from './generate/snapshots.js';
import { generateDocumentation } from './generate/docs.js';
import { extractDirectives } from './extract-directives.js';
import type { IFileSystemAdapter } from './explorer.js';
import { nodeFsAdapter } from './fs-adapter.js';
import type { DirectiveNode } from './parse.js';

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

  // Generate documentation from all examples
  generateDocumentation(examples.map(e => e.name), dirs.snapshots, dirs.docs, fsAdapter);

  // Generate consolidated type files based on collected directives
  generateConsolidatedTypeFiles(parsedDirectives, dirs.types, fsAdapter);
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
 * │       ├── expected-variant.md # Expected output for variant
 * │       └── helpers.md         # Additional files (ignored by processor)
 *
 * Only files that start with 'example' and their corresponding 'expected' files are processed.
 * All other files in the directory structure are ignored, which allows you to include helper
 * files that can be used for imports, includes, or other related purposes in the examples.
 */
export function processExampleDirs(
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
    processConventionalExamples(validDir, outputDir, allDirectives, fixtures, fsAdapter, options);
  } else {
    // If no valid subdirectory, treat baseDir as the root of directive kinds
    processConventionalExamples(baseDir, outputDir, allDirectives, fixtures, fsAdapter, options);
  }

  // Process invalid examples
  const invalidDir = path.join(baseDir, 'invalid');
  if (fsAdapter.existsSync(invalidDir)) {
    processInvalidExamples(invalidDir, outputDir, fsAdapter);
  }

  // Ensure output directories exist
  const typesDir = path.join(outputDir, 'types');
  const fixturesOutDir = fixturesDir || path.join(outputDir, 'e2e');

  [typesDir, fixturesOutDir].forEach(dir => {
    if (!fsAdapter.existsSync(dir)) {
      fsAdapter.mkdirSync(dir, { recursive: true });
    }
  });

  // Generate consolidated type files based on all collected directives
  if (allDirectives.length > 0) {
    generateConsolidatedTypeFiles(allDirectives, typesDir, fsAdapter);
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
 * Process examples using the convention-based directory structure
 */
function processConventionalExamples(
  baseDir: string,
  outputDir: string,
  allDirectives: DirectiveNode[],
  fixtures: E2EFixture[],
  fileSystem: IFileSystemAdapter,
  options: { testsDir?: string; fixturesDir?: string } = {}
): void {
  const { testsDir, fixturesDir } = options;

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

      // Filter for only valid files that start with 'example' or 'expected'
      // This allows other files to exist in the directory for imports etc.
      const validFiles = files.filter(file =>
        (file.startsWith('example') || file.startsWith('expected')) && file.endsWith('.md'));

      // Find all example files (base and variants)
      const exampleFiles = validFiles.filter(file =>
        file.startsWith('example'));

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
 * Only processes files that start with 'example' and their corresponding 'expected' files.
 * Other files in the same directory are ignored, allowing them to be used for imports
 * or other related purposes in the examples.
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
function processExampleFile(
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
  const dirs = {
    types: path.join(outputDir, 'types'),
    fixtures: path.join(options.testsDir || path.join(outputDir, 'tests')),
    snapshots: path.join(outputDir, 'snapshots'),
    e2e: path.join(options.fixturesDir || path.join(outputDir, 'e2e'))
  };

  // Create output directories if they don't exist
  Object.values(dirs).forEach(dir => {
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
      generateSnapshot(ast, name, dirs.snapshots, fileSystem);

      // Generate fixture
      const fixture = generateTestFixture(directive, ast, name);
      writeTestFixture(fixture, name, dirs.fixtures, fileSystem);

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
 * Generate consolidated type files based on collected directives
 */
function generateConsolidatedTypeFiles(
  directives: DirectiveNode[],
  typesDir: string,
  fileSystem: IFileSystemAdapter
): void {
  // Storage for directive type organization
  interface DirectiveTypeStorage {
    // Stores all unique nodes by kind and subtype
    nodesByKindAndSubtype: Record<string, Record<string, DirectiveNode>>;

    // Maps kind to its subtypes
    kindToSubtypes: Record<string, Set<string>>;

    // Tracks which base types we need to generate
    baseTypes: Set<string>;
  }

  // Initialize storage
  const typeStorage: DirectiveTypeStorage = {
    nodesByKindAndSubtype: {},
    kindToSubtypes: {},
    baseTypes: new Set(['BaseNode', 'BaseDirectiveNode', 'BaseVariableNode'])
  };

  // Process each directive to organize by kind and subtype
  for (const node of directives) {
    const { kind, subtype } = node;

    // Skip if node is missing kind or subtype
    if (!kind || !subtype) continue;

    // Initialize structures if needed
    if (!typeStorage.nodesByKindAndSubtype[kind]) {
      typeStorage.nodesByKindAndSubtype[kind] = {};
      typeStorage.kindToSubtypes[kind] = new Set();
    }

    // Store the node by kind and subtype (only keep one per subtype)
    // We only need one example per subtype for the interface
    typeStorage.nodesByKindAndSubtype[kind][subtype] = node;
    typeStorage.kindToSubtypes[kind].add(subtype);

    // Track the base types used by analyzing node structure
    if (node.values) {
      Object.values(node.values).forEach(value => {
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item && typeof item === 'object' && item.type) {
              if (item.type === 'VariableReference') {
                typeStorage.baseTypes.add('VariableReferenceNode');
              } else if (item.type === 'Text') {
                typeStorage.baseTypes.add('TextNode');
              }
            }
          });
        }
      });
    }
  }

  // Generate individual type interfaces for each directive subtype
  for (const [kind, subtypes] of Object.entries(typeStorage.kindToSubtypes)) {
    // Process each subtype
    for (const subtype of subtypes) {
      const node = typeStorage.nodesByKindAndSubtype[kind][subtype];

      // Skip if no node found for this subtype
      if (!node) continue;

      // Generate a proper type name
      const capitalizedKind = capitalize(kind);
      const capitalizedSubtype = capitalize(subtype);
      const typeName = `${capitalizedKind}${capitalizedSubtype}DirectiveNode`;

      // Create file name using kebab-case
      const fileName = `${kind}-${subtype.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.ts`;

      // Generate the content
      const typeContent = generateTypeInterface(node);

      // Write the file
      fileSystem.writeFileSync(path.join(typesDir, fileName), typeContent);
    }
  }

  // Generate union types for each directive kind
  for (const [kind, subtypes] of Object.entries(typeStorage.kindToSubtypes)) {
    const capitalizedKind = capitalize(kind);
    const unionTypeName = `${capitalizedKind}DirectiveNode`;

    // Generate imports for all subtypes
    const imports = Array.from(subtypes).map(subtype => {
      const capitalizedSubtype = capitalize(subtype);
      const typeName = `${capitalizedKind}${capitalizedSubtype}DirectiveNode`;
      const fileName = `${kind}-${subtype.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

      return `import { ${typeName} } from './${fileName}.js';`;
    }).join('\n');

    // Generate the union type
    const unionType = `
/**
 * Union type for all ${kind} directive nodes
 */
export type ${unionTypeName} =
  ${Array.from(subtypes).map(subtype => {
    const capitalizedSubtype = capitalize(subtype);
    return `| ${capitalizedKind}${capitalizedSubtype}DirectiveNode`;
  }).join('\n  ')}
`;

    // Create the file content
    const content = `${imports}\n\n${unionType}`;

    // Write the file
    fileSystem.writeFileSync(path.join(typesDir, `${kind}.ts`), content);

    console.log(`Generated union type for ${kind}`);
  }

  // Generate the main DirectiveNodeUnion
  const mainImports = Object.keys(typeStorage.kindToSubtypes).map(kind => {
    const capitalizedKind = capitalize(kind);
    return `import { ${capitalizedKind}DirectiveNode } from './${kind}.js';`;
  }).join('\n');

  const mainUnion = `
/**
 * Union type for all directive nodes
 */
export type DirectiveNodeUnion =
  ${Object.keys(typeStorage.kindToSubtypes).map(kind => {
    const capitalizedKind = capitalize(kind);
    return `| ${capitalizedKind}DirectiveNode`;
  }).join('\n  ')}
`;

  // Create the file content
  const mainContent = `${mainImports}\n\n${mainUnion}`;

  // Write the file
  fileSystem.writeFileSync(path.join(typesDir, 'directives.ts'), mainContent);

  console.log('Generated main DirectiveNodeUnion');

  // Create an index.ts file to export all types
  const indexContent = `// Directive union
export * from './directives.js';

// Directive kind unions
${Object.keys(typeStorage.kindToSubtypes).map(kind =>
  `export * from './${kind}.js';`
).join('\n')}

// Individual directive types
${Object.entries(typeStorage.kindToSubtypes).flatMap(([kind, subtypes]) =>
  Array.from(subtypes).map(subtype =>
    `export * from './${kind}-${subtype.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.js';`
  )
).join('\n')}
`;

  fileSystem.writeFileSync(path.join(typesDir, 'index.ts'), indexContent);

  console.log('Generated index.ts');

  console.log(`Enhanced type generation complete - generated ${
    Object.keys(typeStorage.kindToSubtypes).length
  } directive kinds and ${
    Object.values(typeStorage.kindToSubtypes).reduce(
      (total, subtypes) => total + subtypes.size, 0
    )
  } directive subtypes`);
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