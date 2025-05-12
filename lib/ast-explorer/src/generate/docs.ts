/**
 * Documentation generation utilities
 */
import * as path from 'path';
import type { DirectiveNode } from '../parse.js';
import type { IFileSystemAdapter } from '../explorer.js';
import { nodeFsAdapter } from '../fs-adapter.js';
import { extractDirectives } from '../extract-directives.js';

/**
 * Generate documentation from snapshots
 */
export function generateDocumentation(
  names: string[],
  snapshotsDir: string,
  outputDir: string,
  fileSystem?: IFileSystemAdapter
): void {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;

  // Ensure output directory exists
  fsAdapter.mkdirSync(outputDir, { recursive: true });

  // Group by directive kind
  const directivesByKind = groupByDirectiveKind(names, snapshotsDir, fsAdapter);

  // Generate an index file
  let indexContent = '# AST Documentation\n\n';
  indexContent += 'Generated documentation for Meld directive AST structures.\n\n';
  indexContent += '## Available Directives\n\n';

  Object.keys(directivesByKind).sort().forEach(kind => {
    indexContent += `- [${capitalize(kind)}](${kind}.md)\n`;

    // Generate documentation for this directive kind
    generateDirectiveDoc(kind, directivesByKind[kind], snapshotsDir, outputDir, fsAdapter);
  });

  // Write index file
  fsAdapter.writeFileSync(path.join(outputDir, 'README.md'), indexContent);
}

/**
 * Group snapshots by directive kind
 */
function groupByDirectiveKind(
  names: string[],
  snapshotsDir: string,
  fileSystem: IFileSystemAdapter
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  names.forEach(name => {
    const snapshotPath = path.join(snapshotsDir, `${name}.snapshot.json`);

    if (fileSystem.existsSync(snapshotPath)) {
      try {
        const snapshot = JSON.parse(fileSystem.readFileSync(snapshotPath, 'utf8'));
        const kind = snapshot.kind;

        if (!result[kind]) {
          result[kind] = [];
        }

        result[kind].push(name);
      } catch (error) {
        console.warn(`Could not read snapshot for ${name}:`, error);
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
  outputDir: string,
  fileSystem: IFileSystemAdapter
): void {
  let content = `# ${capitalize(kind)} Directive\n\n`;
  content += `The \`@${kind}\` directive is used in Meld grammar.\n\n`;

  // List subtypes found in examples
  content += '## Subtypes\n\n';

  const subtypes = new Set<string>();
  const snapshots: Record<string, any> = {};

  // Collect subtypes and snapshots
  examples.forEach(name => {
    const snapshotPath = path.join(snapshotsDir, `${name}.snapshot.json`);
    if (fileSystem.existsSync(snapshotPath)) {
      try {
        const snapshot = JSON.parse(fileSystem.readFileSync(snapshotPath, 'utf8'));
        snapshots[name] = snapshot;

        if (snapshot.subtype) {
          subtypes.add(snapshot.subtype);
        }
      } catch (error) {
        console.warn(`Could not read snapshot for ${name}:`, error);
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

      // Add TypeScript interface
      content += '### TypeScript Interface\n\n';
      content += '```typescript\n';
      content += `export interface ${capitalize(kind)}${capitalize(subtype)}DirectiveNode extends TypedDirectiveNode<'${kind}', '${subtype}'> {\n`;
      content += '  values: {\n';
      Object.keys(snapshot.values || {}).forEach(key => {
        content += `    ${key}: ${getTypeForValue(snapshot.values[key])};\n`;
      });
      content += '  };\n\n';

      content += '  raw: {\n';
      Object.keys(snapshot.raw || {}).forEach(key => {
        content += `    ${key}: string;\n`;
      });
      content += '  };\n\n';

      content += '  meta: {\n';
      Object.keys(snapshot.meta || {}).forEach(key => {
        content += `    ${key}: ${getMetaType(snapshot.meta[key])};\n`;
      });
      content += '  };\n';
      content += '}\n';
      content += '```\n\n';
    }
  });

  // Write directive documentation file
  fileSystem.writeFileSync(path.join(outputDir, `${kind}.md`), content);
}

/**
 * Describe a value for documentation
 */
function describeValue(value: any): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Empty array';
    
    if (value[0]?.type === 'VariableReference') return 'Variable references';
    if (value[0]?.type === 'Text') return 'Text content';
    
    return `Array of ${value[0]?.type || typeof value[0]}`;
  }
  
  return typeof value;
}

/**
 * Get TypeScript type for a value
 */
function getTypeForValue(value: any): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]';
    
    if (value[0]?.type === 'VariableReference') return 'VariableNodeArray';
    if (value[0]?.type === 'Text') return 'ContentNodeArray';
    
    if (value[0]?.type) {
      return `${value[0].type}[]`;
    }
    
    return `Array<${typeof value[0]}>`;
  }
  
  if (typeof value === 'object' && value !== null) {
    if (value.type) {
      return value.type;
    }
    return 'Record<string, any>';
  }
  
  return typeof value;
}

/**
 * Get TypeScript type for a metadata value
 */
function getMetaType(value: any): string {
  if (typeof value === 'object' && value !== null) {
    return 'Record<string, any>';
  }
  
  return typeof value;
}

/**
 * Helper function to capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate an EXAMPLES.md document with formal type names and example syntax
 * for all directive types found in the examples directory
 */
export function generateExamplesDoc(
  baseDir: string,
  snapshotsDir: string,
  outputPath: string,
  fileSystem?: IFileSystemAdapter
): void {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  fsAdapter.mkdirSync(outputDir, { recursive: true });

  let content = '# Meld Directive Types and Examples\n\n';
  content += 'This document provides a reference of all directive types with their formal type names and example syntax.\n\n';

  // Get all directive kind directories
  let dirContents = fsAdapter.readdirSync(baseDir);
  const directiveKinds = [];

  // Filter only directories
  for (const item of dirContents) {
    const itemPath = path.join(baseDir, item);
    if (fsAdapter.existsSync(itemPath)) {
      try {
        if (fsAdapter.lstatSync(itemPath).isDirectory()) {
          directiveKinds.push(item);
        }
      } catch (error) {
        // Skip if can't check directory status
        console.warn(`Could not check if ${itemPath} is a directory:`, error);
      }
    }
  }

  // Sort directive kinds alphabetically
  directiveKinds.sort();

  // Process each directive kind
  for (const kind of directiveKinds) {
    content += `## ${capitalize(kind)}\n\n`;

    const kindDir = path.join(baseDir, kind);

    // Get all subtype directories within this kind
    const dirContents = fsAdapter.readdirSync(kindDir);
    const subtypes = [];

    // Filter only directories
    for (const item of dirContents) {
      const itemPath = path.join(kindDir, item);
      if (fsAdapter.existsSync(itemPath)) {
        try {
          if (fsAdapter.lstatSync(itemPath).isDirectory()) {
            subtypes.push(item);
          }
        } catch (error) {
          // Skip if can't check directory status
          console.warn(`Could not check if ${itemPath} is a directory:`, error);
        }
      }
    }

    // Sort subtypes alphabetically
    subtypes.sort();

    // Process each subtype
    for (const subtype of subtypes) {
      const subtypeDir = path.join(kindDir, subtype);
      content += `### ${formatSubtypeName(subtype)}\n\n`;

      // Get formal type name
      const formalTypeName = `${capitalize(kind)}${capitalize(camelCase(subtype))}DirectiveNode`;
      content += `#### ${formalTypeName} type:\n`;

      // Find type definition from snapshot
      const snapshot = findSnapshotForSubtype(kind, subtype, snapshotsDir, fsAdapter);

      // Add type definition
      content += '```typescript\n';
      if (snapshot) {
        content += generateTypeDefinition(snapshot, kind, subtype);
      } else {
        content += `// Type definition not available\n`;
      }
      content += '```\n\n';

      // Find all examples for this subtype
      const exampleFiles = fsAdapter.readdirSync(subtypeDir)
        .filter(file => file.startsWith('example') && file.endsWith('.md'));

      if (exampleFiles.length > 0) {
        content += '#### Valid examples:\n\n';

        // Process each example
        for (const exampleFile of exampleFiles) {
          const examplePath = path.join(subtypeDir, exampleFile);
          const exampleContent = fsAdapter.readFileSync(examplePath, 'utf8');

          // Extract directives from example
          const directives = extractDirectives(exampleContent);

          if (directives.length > 0) {
            // Show each directive
            directives.forEach(directive => {
              content += '```\n';
              content += directive;
              content += '\n```\n\n';
            });
          }
        }
      } else {
        content += '#### No examples found.\n\n';
      }
    }
  }

  // Write the document
  fsAdapter.writeFileSync(outputPath, content);
  console.log(`Generated EXAMPLES.md at ${outputPath}`);
}

/**
 * Format subtype name for better readability
 */
function formatSubtypeName(subtype: string): string {
  // Convert kebab-case or camelCase to Title Case with spaces
  return subtype
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => capitalize(word))
    .join(' ');
}

/**
 * Convert to camelCase
 */
function camelCase(str: string): string {
  return str
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    .replace(/^([A-Z])/, (_, letter) => letter.toLowerCase());
}

/**
 * Find a snapshot for a directive kind and subtype
 */
function findSnapshotForSubtype(
  kind: string,
  subtype: string,
  snapshotsDir: string,
  fileSystem: IFileSystemAdapter
): any {
  // Normalize subtype to match snapshot naming convention
  const normalizedSubtype = subtype.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

  // Try to find a snapshot file that matches the pattern
  const snapshotFiles = fileSystem.readdirSync(snapshotsDir)
    .filter(file => file.endsWith('.snapshot.json') &&
                  (file.startsWith(`${kind}-${normalizedSubtype}`) ||
                   file.startsWith(`${kind}-${subtype}`)));

  console.log(`Looking for snapshots matching ${kind}-${normalizedSubtype} or ${kind}-${subtype}`);
  console.log(`Found ${snapshotFiles.length} snapshot files: ${snapshotFiles.join(', ')}`);

  if (snapshotFiles.length > 0) {
    // Use the first matching snapshot
    const snapshotPath = path.join(snapshotsDir, snapshotFiles[0]);
    try {
      const content = fileSystem.readFileSync(snapshotPath, 'utf8');
      console.log(`Read snapshot from ${snapshotPath}`);
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Could not read snapshot file: ${snapshotPath}`, error);
    }
  }

  return null;
}

/**
 * Generate TypeScript type definition from snapshot
 */
function generateTypeDefinition(snapshot: any, kind: string, subtype: string): string {
  const typeName = `${capitalize(kind)}${capitalize(camelCase(subtype))}DirectiveNode`;

  let definition = `export interface ${typeName} extends TypedDirectiveNode<'${kind}', '${camelCase(subtype)}'> {\n`;
  definition += '  values: {\n';

  // Add value properties
  if (snapshot.values) {
    Object.entries(snapshot.values).forEach(([key, value]) => {
      const valueType = getTypeForValue(value);
      definition += `    ${key}: ${valueType};\n`;
    });
  }

  definition += '  };\n\n';
  definition += '  raw: {\n';

  // Add raw properties
  if (snapshot.raw) {
    Object.entries(snapshot.raw).forEach(([key]) => {
      definition += `    ${key}: string;\n`;
    });
  }

  definition += '  };\n\n';

  // Add meta properties
  definition += '  meta: {\n';
  if (snapshot.meta) {
    Object.entries(snapshot.meta).forEach(([key, value]) => {
      definition += `    ${key}: ${getMetaType(value)};\n`;
    });
  }
  definition += '  };\n';

  definition += '}\n';

  return definition;
}