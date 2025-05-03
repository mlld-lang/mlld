import NodeType      from './node-type.js';
import DirectiveKind from './directive-kind.js';

export default {
  debug(msg, ...args) {
    if (process.env.DEBUG_MELD_GRAMMAR) {
      console.log('[DEBUG GRAMMAR]', msg, ...args);
    }
  },

  isLogicalLineStart(input, pos) {
    if (pos === 0) return true;
    let i = pos - 1;
    while (i >= 0 && (input[i] === ' ' || input[i] === '\t' || input[i] === '\r')) i--;
    return i < 0 || input[i] === '\n';
  },

  createNode(type, props = {}) {
    const base = {
      type,
      nodeId: 'placeholder-id',
      location: {
        start: props.location?.start || { offset: 0, line: 1, column: 1 },
        end: props.location?.end || { offset: 0, line: 1, column: 1 }
      }
    };
    return Object.freeze(Object.assign(base, props));
  },

  createDirective(kind, data) {
    // Legacy method maintained for backward compatibility
    return this.createNode(NodeType.Directive, { directive: { kind, ...data } });
  },
  
  // New method for creating directives with the updated structure
  createStructuredDirective(kind, subtype, values, raw, meta, locationData) {
    return this.createNode(NodeType.Directive, { 
      kind, 
      subtype, 
      values, 
      raw, 
      meta 
    }, locationData);
  },

  createVariableReferenceNode(valueType, data) {
    return this.createNode(NodeType.VariableReference, { valueType, isVariableReference: true, ...data });
  },

  normalizePathVar(id) {
    if (id === '~') return 'HOMEPATH';
    if (id === '.') return 'PROJECTPATH';
    return id;
  },

  validateRunContent: () => true, // ADDED STUB
  validateDefineContent: () => true, // ADDED STUB

  validatePath(pathParts, directiveKind) {
    // 1. Reconstruct Raw String (needed for output)
    // Use the existing helper, assuming it handles the node array correctly.
    const raw = this.reconstructRawString(pathParts).trim();

    // 2. Calculate Flags by iterating through pathParts
    let isAbsolute = false;
    let isRelativeToCwd = true; // Default assumption
    // Initialize flags
    let hasVariables = false;
    let hasTextVariables = false;
    let hasPathVariables = false;
    let variable_warning = false;

    // Process path parts
    if (pathParts && pathParts.length > 0) {
      // Check for absolute path (only if first character is /)
      const firstPart = pathParts[0];
      if (firstPart.type === NodeType.PathSeparator && firstPart.value === '/') {
        isAbsolute = true;
        isRelativeToCwd = false;
      }

      // Check for variable types across all parts
      this.debug('VALIDATE_PATH_PARTS', 'Checking path parts:', JSON.stringify(pathParts));
      for (const node of pathParts) {
        if (node.type === NodeType.VariableReference) {
          hasVariables = true;
          this.debug('VALIDATE_PATH_NODE', 'Found variable:', JSON.stringify(node));
          // Track variable types independently
          if (node.valueType === 'text') {
            hasTextVariables = true;
            variable_warning = true;
            this.debug('VALIDATE_PATH_NODE', 'Found text variable:', JSON.stringify(node));
          } else if (node.valueType === 'path') {
            hasPathVariables = true;
            // For imports, path variables should be relative to cwd
            // For embeds, they should not be
            if (directiveKind === DirectiveKind.embed) {
              isRelativeToCwd = false;
            }
            this.debug('VALIDATE_PATH_NODE', 'Found path variable:', JSON.stringify(node));
          }
        }
      }
    }

    // Update warning flag after all nodes are processed
    variable_warning = hasTextVariables;

    // 3. Construct Final Flags Object
      const finalFlags = {
      isAbsolute: isAbsolute,
      isRelativeToCwd: isRelativeToCwd,
      hasVariables: hasVariables,
      hasTextVariables: hasTextVariables,
      hasPathVariables: hasPathVariables,
      variable_warning: variable_warning
    };

    // 4. Construct Result Object
    const result = {
      raw: raw,           // Use reconstructed raw string
      values: pathParts,  // Use original pathParts array with locations
      ...finalFlags       // Spread the calculated boolean flags
    };

    this.debug('PATH', 'validatePath final result:', JSON.stringify(result, null, 2));
    return result;
  },
  // <<< END REFACTORED validatePath >>>
  // <<< PRESERVING getImportSubtype and trace >>>
  getImportSubtype(list) {
    // Check for importAll: [*]
    if (!list) return 'importAll';
    if (list.length === 0) return 'importAll'; // Empty list `[]` from `[...]` => importAll
    if (list.length === 1 && list[0].name === '*') return 'importAll';

    // Check for importNamed: any item has an alias
    // TODO: Bring this back
    // const hasAlias = list.some(item => item.alias !== null);
    // if (hasAlias) return 'importNamed';

    // Otherwise, it's importStandard
    return 'importStandard';
  },

  trace(pos, reason) {
    // Placeholder - No output for now
    // helpers.debug('TRACE', `Reject @${pos}: ${reason}`);
  },

  reconstructRawString(nodes) {
    // Basic implementation - iterates nodes and concatenates
    if (!Array.isArray(nodes)) {
      // Handle cases where a single node might be passed (though likely expects array)
      if (nodes && typeof nodes === 'object') {
        if (nodes.type === NodeType.Text) return nodes.content || '';
        if (nodes.type === NodeType.VariableReference) {
          // CORRECTED: Only reconstruct path variables as $var. Text and Data use {{var}}.
          const varId = nodes.identifier;
          const valueType = nodes.valueType;
          return valueType === 'path' ? `$${varId}` : `{{${varId}}}`; 
        }
      }
      return String(nodes || ''); // Fallback
    }

    let raw = '';
          for (const node of nodes) {
      if (!node) continue;
      if (node.type === NodeType.Text) {
        raw += node.content || '';
      } else if (node.type === NodeType.VariableReference) {
        const varId = node.identifier;
        const valueType = node.valueType;
        // CORRECTED: Only reconstruct path variables as $var. Text and Data use {{var}}.
        raw += valueType === 'path' ? `$${varId}` : `{{${varId}}}`; 
      } else if (node.type === NodeType.PathSeparator) {
        raw += node.value || ''; // Append '/' or '.'
      } else if (node.type === NodeType.SectionMarker) {
        raw += node.value || ''; // Append '#'
      } else if (typeof node === 'string') {
        // Handle potential raw string segments passed directly
        raw += node;
      } else {
        // Fallback for other node types or structures
        // NOTE: This fallback might indicate unhandled cases if hit often
        raw += node.raw || node.content || node.value || ''; // Added node.value as potential source
      }
    }
    return raw;
  },
};