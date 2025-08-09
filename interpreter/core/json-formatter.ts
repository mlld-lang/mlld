import { createASTAwareJSONReplacer } from '../utils/ast-evaluation';

export interface JSONFormatOptions {
  pretty?: boolean;
  indent?: number;
  handleExecutables?: boolean;
  handleNamespaces?: boolean;
}

export class JSONFormatter {
  /**
   * Single source of truth for JSON serialization in mlld
   */
  static stringify(value: any, options: JSONFormatOptions = {}): string {
    const {
      pretty = false,
      indent = 2,
      handleExecutables = true,
      handleNamespaces = true
    } = options;
    
    // Use our existing shared replacer
    const replacer = createASTAwareJSONReplacer();
    
    // Smart pretty-printing: only pretty-print if the object is complex enough
    let shouldPrettyPrint = pretty;
    if (pretty) {
      const compactJson = JSON.stringify(value, replacer);
      // Only pretty-print if it's longer than 60 chars or has nested objects/arrays
      shouldPrettyPrint = compactJson.length > 60 || this.hasNestedStructures(value);
    }
    
    const result = JSON.stringify(value, replacer, shouldPrettyPrint ? indent : undefined);
    
    // Post-process: for single-key objects that were pretty-printed, keep them on one line but with spaces
    if (pretty && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 1 && shouldPrettyPrint) {
        // Check if this is a simple single-key object (not nested)
        const val = value[keys[0]];
        if (typeof val !== 'object' || val === null) {
          // Convert multiline format to single-line with spaces (no extra spaces around braces)
          const lines = result.split('\n').map(l => l.trim());
          if (lines.length === 3 && lines[0] === '{' && lines[2] === '}') {
            return `{${lines[1]}}`;
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * Check if a value has nested objects or arrays that warrant pretty-printing
   */
  private static hasNestedStructures(value: any, depth = 0): boolean {
    if (depth > 2) return true; // Deep nesting
    
    if (Array.isArray(value)) {
      // For arrays: pretty print if more than 1 item OR if any item is an object/complex
      return value.length > 1 || value.some(item => 
        typeof item === 'object' && item !== null
      );
    }
    
    if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value);
      // Always pretty-print objects (even single-key ones for consistent spacing)
      // But skip if it's an empty object
      return keys.length > 0;
    }
    
    return false;
  }
  
  /**
   * Special formatting for namespace objects
   * Shows only frontmatter and exported variables, not internal structure
   */
  static stringifyNamespace(namespaceObject: any): string {
    const cleaned: any = {
      frontmatter: {},
      exports: {
        variables: {},
        executables: {}
      }
    };
    
    // Add frontmatter if present
    const fm = namespaceObject.fm || namespaceObject.frontmatter || namespaceObject.__meta__;
    if (fm && Object.keys(fm).length > 0) {
      cleaned.frontmatter = fm;
    }
    
    // Separate variables and executables
    const internalFields = ['fm', 'frontmatter', '__meta__'];
    let hasExports = false;
    
    for (const [key, value] of Object.entries(namespaceObject)) {
      if (!internalFields.includes(key)) {
        hasExports = true;
        // Check if it's an executable
        if (value && typeof value === 'object' && (value as any).__executable) {
          const params = (value as any).paramNames || [];
          cleaned.exports.executables[key] = `<function(${params.join(', ')})>`;
        } else if (value && typeof value === 'object' && value.type === 'executable') {
          // Handle variable-stored executables
          const def = value.value || value.definition || {};
          const params = def.paramNames || [];
          cleaned.exports.executables[key] = `<function(${params.join(', ')})>`;
        } else {
          cleaned.exports.variables[key] = value;
        }
      }
    }
    
    // If no exports, remove the exports section
    if (!hasExports) {
      delete cleaned.exports;
    }
    
    // If no frontmatter, remove that section
    if (Object.keys(cleaned.frontmatter).length === 0) {
      delete cleaned.frontmatter;
    }
    
    // If nothing left, just return an empty object representation
    if (Object.keys(cleaned).length === 0) {
      return '{}';
    }
    
    return this.stringify(cleaned, { pretty: true, handleExecutables: false });
  }
}