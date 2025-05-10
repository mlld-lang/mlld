/**
 * Documentation generation utilities
 */
import * as fs from 'fs';
import * as path from 'path';
import type { DirectiveNode } from '@grammar/types/base';

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
  
  // Group by directive kind
  const directivesByKind = groupByDirectiveKind(names, snapshotsDir);
  
  // Generate an index file
  let indexContent = '# AST Documentation\n\n';
  indexContent += 'Generated documentation for Meld directive AST structures.\n\n';
  indexContent += '## Available Directives\n\n';
  
  Object.keys(directivesByKind).sort().forEach(kind => {
    indexContent += `- [${capitalize(kind)}](${kind}.md)\n`;
    
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
  outputDir: string
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
    if (fs.existsSync(snapshotPath)) {
      try {
        const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
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