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
    
    return JSON.stringify(value, replacer, pretty ? indent : undefined);
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