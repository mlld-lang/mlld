import { randomUUID } from 'crypto';
import * as acorn from 'acorn';

export const NodeType = {
  Text: 'Text',
  Comment: 'Comment',
  CodeFence: 'CodeFence',
  MlldRunBlock: 'MlldRunBlock',
  VariableReference: 'VariableReference',
  Directive: 'Directive',
  PathSeparator: 'PathSeparator',
  DotSeparator: 'DotSeparator',
  Literal: 'Literal',
  SectionMarker: 'SectionMarker',
  Error: 'Error',
  Newline: 'Newline',
  StringLiteral: 'StringLiteral',
  Frontmatter: 'Frontmatter',
  CommandBase: 'CommandBase',
  Parameter: 'Parameter',
  ExecInvocation: 'ExecInvocation',
  CommandReference: 'CommandReference',
} as const;
export type NodeTypeKey = keyof typeof NodeType;

export const DirectiveKind = {
  run: 'run',
  add: 'add',
  text: 'text',
  exec: 'exec',
  data: 'data',
  path: 'path',
  import: 'import',
  output: 'output',
  when: 'when',
} as const;
export type DirectiveKindKey = keyof typeof DirectiveKind;

export const helpers = {
  debug(msg: string, ...args: unknown[]) {
    if (process.env.DEBUG_MLLD_GRAMMAR) console.log('[DEBUG GRAMMAR]', msg, ...args);
  },

  isLogicalLineStart(input: string, pos: number) {
    if (pos === 0) return true;
    let i = pos - 1;
    while (i >= 0 && ' \t\r'.includes(input[i] as string)) i--;
    return i < 0 || input[i] === '\n';
  },

  // Context Detection System - Core Helper Methods
  // ---------------------------------------------
  
  /**
   * Determines if the current position represents a directive context
   * A directive context requires:
   * 1. / symbol at logical line start
   * 2. Followed by a valid directive keyword
   */
  isAtDirectiveContext(input: string, pos: number): boolean {
    // First check if we're at a / symbol
    if (input[pos] !== '/') return false;
    
    // Determine if this / symbol is at a logical line start
    const isAtLineStart = this.isLogicalLineStart(input, pos);
    if (!isAtLineStart) return false;
    
    // Check if it's followed by a valid directive keyword
    const directiveKeywords = Object.keys(DirectiveKind);
    const afterAtPos = pos + 1;
    
    // Look ahead to see if a directive keyword follows
    for (const keyword of directiveKeywords) {
      // Check if there's enough text after @ for this keyword
      if (afterAtPos + keyword.length > input.length) continue;
      
      const potentialKeyword = input.substring(afterAtPos, afterAtPos + keyword.length);
      
      // Check if the text matches the keyword and is followed by whitespace or EOL
      if (potentialKeyword === keyword) {
        // If we're at the end of input or the next char is whitespace, it's a directive
        if (afterAtPos + keyword.length === input.length) return true;
        
        const nextChar = input[afterAtPos + keyword.length];
        if (' \t\r\n'.includes(nextChar)) return true;
      }
    }
    
    // Not a directive context
    return false;
  },
  
  /**
   * Determines if the current position represents a variable reference context
   * A variable context requires:
   * 1. @ symbol NOT at logical line start, or
   * 2. @ at line start but NOT followed by directive keyword
   */
  isAtVariableContext(input: string, pos: number): boolean {
    // First check if we're at an @ symbol
    if (input[pos] !== '@') return false;
    
    // If we're at a directive context, this can't be a variable context
    if (this.isAtDirectiveContext(input, pos)) return false;
    
    // If not a directive, but we have an @ symbol, it's a variable reference
    // This assumes that @ is either:
    // - Not at line start, or
    // - At line start but not followed by directive keyword
    return true;
  },
  
  /**
   * Determines if the current position is within a right-hand side (RHS) expression
   * RHS contexts are after assignment operators (=, :) in directive bodies
   */
  isRHSContext(input: string, pos: number): boolean {
    // If at the start of input, can't be RHS
    if (pos === 0) return false;
    
    // Search backward for assignment indicators
    let i = pos - 1;
    let inString = false;
    let stringChar: string | null = null;
    let foundEquals = false;
    
    while (i >= 0) {
      const char = input[i];
      
      // Handle string context
      if ((char === '"' || char === '\'') && (i === 0 || input[i-1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
      }
      
      // Only consider equals/colon outside of strings
      if (!inString) {
        // If we find an assignment operator
        if (char === '=' || char === ':') {
          foundEquals = true;
          break;
        }
        
        // If we hit a semi-colon or line break before finding an assignment,
        // we're likely in a new statement/line
        if (char === ';' || char === '\n') {
          return false;
        }
      }
      
      i--;
    }
    
    // If we found an equals sign, check if it's part of a directive assignment
    if (foundEquals) {
      // Look for directive on LHS
      let j = i - 1;
      
      // Skip whitespace
      while (j >= 0 && ' \t\r'.includes(input[j])) {
        j--;
      }
      
      // Collect potential directive name
      let name = '';
      while (j >= 0 && /[a-zA-Z0-9_]/.test(input[j])) {
        name = input[j] + name;
        j--;
      }
      
      // Check for / symbol indicating directive
      if (j >= 0 && input[j] === '/') {
        // Valid assignment directives that can have nested directives in RHS
        const validAssignmentDirectives = ['exec', 'text', 'data', 'run'];
        
        if (validAssignmentDirectives.includes(name)) {
          // Check if the / is at logical line start (to confirm it's a directive)
          if (this.isLogicalLineStart(input, j)) {
            return true;
          }
        }
      }
      
      // Not a directive assignment
      return false;
    }
    
    return false;
  },
  
  /**
   * Determines if the current position represents plain text context
   * Plain text is any context that isn't a directive, variable, or RHS
   */
  isPlainTextContext(input: string, pos: number): boolean {
    // If it's not any of the special contexts, it's plain text
    return !this.isAtDirectiveContext(input, pos) && 
           !this.isAtVariableContext(input, pos) && 
           !this.isRHSContext(input, pos);
  },

  /**
   * Determines if the current position is within a run code block context
   * This is used to identify language + code block patterns
   */
  isInRunCodeBlockContext(input: string, pos: number): boolean {
    // This is a simplified implementation
    // In a full implementation, this would check for language + code block patterns
    // For now, return false to avoid breaking the parser
    return false;
  },

  createNode<T extends object>(type: NodeTypeKey, props: T & { location?: any }) {
    return Object.freeze({
      type,
      nodeId: randomUUID(),
      location: props.location ?? { start: { offset: 0, line: 1, column: 1 },
                                  end:   { offset: 0, line: 1, column: 1 } },
      ...props,
    });
  },

  createDirective(kind: DirectiveKindKey, data: any) {
    // Legacy method maintained for backward compatibility
    return this.createNode(NodeType.Directive, { directive: { kind, ...data } });
  },
  
  // New method for creating directives with the updated structure
  createStructuredDirective(kind: DirectiveKindKey, subtype: string, values: any, raw: string, meta: any, locationData: any, source: any = null) {
    return this.createNode(NodeType.Directive, { 
      kind, 
      subtype, 
      source,
      values, 
      raw, 
      meta,
      location: locationData
    });
  },

  createVariableReferenceNode(valueType: string, data: any) {
    return this.createNode(NodeType.VariableReference, { valueType, ...data });
  },

  normalizePathVar(id: string) {
    if (id === '.') return 'PROJECTPATH';
    if (id === 'TIME') return 'TIME';
    return id;
  },

  validateRunContent: () => true,
  validateDefineContent: () => true,

  validatePath(pathParts: any[], directiveKind?: string) {
    // 1. Reconstruct Raw String (needed for output)
    const raw = this.reconstructRawString(pathParts).trim();

    // Initialize flags
    let hasVariables = false;

    // Process path parts
    if (pathParts && pathParts.length > 0) {
      for (const node of pathParts) {
        if (node.type === NodeType.VariableReference) {
          hasVariables = true;
        }
      }
    }

    // 3. Construct Final Flags Object
    const finalFlags = {
      hasVariables: hasVariables
    };

    // 4. Construct Result Object
    const result = {
      raw: raw,
      values: pathParts,
      ...finalFlags
    };

    this.debug('PATH', 'validatePath final result:', JSON.stringify(result, null, 2));
    return result;
  },

  getImportSubtype(list: any[] | null) {
    // Check for importAll: [*]
    if (!list) return 'importAll';
    if (list.length === 0) return 'importAll'; // Empty list `[]` from `[...]` => importAll
    if (list.length === 1 && list[0].name === '*') return 'importAll';

    // Otherwise, it's importSelected
    return 'importSelected';
  },

  trace(pos: number, reason: string) {
    // Placeholder - No output for now
    // this.debug('TRACE', `Reject @${pos}: ${reason}`);
  },

  reconstructRawString(nodes: any[] | any) {
    // Basic implementation - iterates nodes and concatenates
    if (!Array.isArray(nodes)) {
      // Handle cases where a single node might be passed (though likely expects array)
      if (nodes && typeof nodes === 'object') {
        if (nodes.type === NodeType.Text) return nodes.content || '';
        if (nodes.type === NodeType.VariableReference) {
          // Handle different variable types with appropriate syntax
          const varId = nodes.identifier;
          const valueType = nodes.valueType;
          const fields = nodes.fields || [];
          
          // Build the field access path
          let fieldPath = '';
          for (const field of fields) {
            if (field.type === 'field' || field.type === 'dot') {
              fieldPath += `.${field.name || field.value}`;
            } else if (field.type === 'array') {
              fieldPath += `[${field.index}]`;
            }
          }
          
          // Variable syntax handling:
          // - 'varInterpolation' for {{var}} (in strings)
          // - 'varIdentifier' for @var (direct reference)
          if (valueType === 'varInterpolation') {
            return `{{${varId}${fieldPath}}}`;
          } else if (valueType === 'varIdentifier') {
            return `@${varId}${fieldPath}`;
          } else {
            // Default case - should not happen with consistent valueTypes
            return `{{${varId}${fieldPath}}}`;
          }
        }
      }
      return String(nodes || ''); // Fallback
    }

    // For path or command, construct a clean string without extra characters
    let raw = '';
    for (const node of nodes) {
      if (!node) continue;
      
      if (node.type === NodeType.Text) {
        raw += node.content || '';
      } else if (node.type === NodeType.VariableReference) {
        const varId = node.identifier;
        const valueType = node.valueType;
        const fields = node.fields || [];
        
        // Build the field access path
        let fieldPath = '';
        for (const field of fields) {
          if (field.type === 'field' || field.type === 'dot') {
            fieldPath += `.${field.name || field.value}`;
          } else if (field.type === 'array') {
            fieldPath += `[${field.index}]`;
          }
        }
        
        // Use the same variable syntax handling logic as above
        if (valueType === 'varInterpolation') {
          raw += `{{${varId}${fieldPath}}}`;
        } else if (valueType === 'varIdentifier') {
          raw += `@${varId}${fieldPath}`;
        } else {
          // Default case - should not happen with consistent valueTypes
          raw += `{{${varId}${fieldPath}}}`;
        }
      } else if (node.type === NodeType.PathSeparator) {
        raw += node.value || ''; // Append '/' or '.'
      } else if (node.type === NodeType.SectionMarker) {
        raw += node.value || ''; // Append '#'
      } else if (node.type === NodeType.StringLiteral) {
        // Handle string literals properly - avoids adding extra quotes
        raw += node.value || '';
      } else if (typeof node === 'string') {
        // Handle potential raw string segments passed directly
        raw += node;
      } else {
        // Fallback for other node types or structures
        // Use content or value directly instead of raw to avoid extra characters
        raw += node.content || node.value || node.raw || '';
      }
    }
    return raw;
  },

  createPathMetadata(rawPath: string, parts: any[]) {
    return {
      hasVariables: parts.some(p => p && p.type === NodeType.VariableReference),
      isAbsolute: rawPath.startsWith('/'),
      hasExtension: /\.[a-zA-Z0-9]+$/.test(rawPath),
      extension: rawPath.match(/\.([a-zA-Z0-9]+)$/)?.[1] || null
    };
  },

  createCommandMetadata(parts: any[]) {
    return {
      hasVariables: parts.some(p => p && p.type === NodeType.VariableReference)
    };
  },

  createTemplateMetadata(parts: any[], wrapperType: string) {
    return {
      hasVariables: parts.some(p => 
        p && (p.type === NodeType.VariableReference || p.type === NodeType.ExecInvocation)
      ),
      isTemplateContent: wrapperType === 'doubleBracket'
    };
  },

  createUrlMetadata(protocol: string, parts: any[], hasSection: boolean = false) {
    return {
      isUrl: true,
      protocol,
      hasVariables: parts.some(p => p && p.type === NodeType.VariableReference),
      hasSection
    };
  },

  ttlToSeconds(value: number, unit: string): number {
    const multipliers: Record<string, number> = {
      'seconds': 1,
      'minutes': 60,
      'hours': 3600,
      'days': 86400,
      'weeks': 604800
    };
    return value * (multipliers[unit] || 1);
  },

  createSecurityMeta(options?: any) {
    if (!options) return {};
    
    const meta: any = {};
    
    if (options.ttl) {
      meta.ttl = options.ttl;
    }
    
    if (options.trust) {
      meta.trust = options.trust;
    }
    
    return meta;
  },

  detectFormatFromPath(path: string): string | null {
    const ext = path.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    if (!ext) return null;
    
    const formatMap: Record<string, string> = {
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'csv': 'csv',
      'md': 'markdown',
      'markdown': 'markdown',
      'txt': 'text',
      'text': 'text'
    };
    return formatMap[ext] || null;
  },

  createSectionMeta(pathParts: any[], sectionParts: any[], hasRename: boolean) {
    return {
      sourceType: 'section',
      hasVariables: [...pathParts, ...sectionParts].some(part =>
        part && part.type === 'VariableReference'
      ),
      hasRename: hasRename
    };
  },

  reconstructSectionPath(pathParts: any[], sectionParts: any[]): string {
    const pathStr = this.reconstructRawString(pathParts);
    const sectionStr = this.reconstructRawString(sectionParts);
    return `${pathStr} # ${sectionStr}`;
  },

  /**
   * Checks if we're at a bracket that should end command parsing
   * This uses a specific heuristic: ] at end of input OR ] on its own line
   */
  isCommandEndingBracket(input: string, pos: number): boolean {
    if (input[pos] !== ']') return false;

    // Check if ] is at the end of input (single-line commands)
    const nextPos = pos + 1;
    if (nextPos >= input.length) return true;

    // Check if ] is followed only by whitespace then newline (] on its own line in multi-line commands)
    let i = nextPos;
    while (i < input.length && (input[i] === ' ' || input[i] === '\t')) {
      i++;
    }
    
    // Must be followed by newline or end of input
    return i >= input.length || input[i] === '\n';
  },

  /**
   * Parse command content that may contain variables and text segments
   * This is used by the CommandBracketContent rule to handle @var interpolation
   */
  parseCommandContent(content: string): any[] {
    const parts = [];
    let i = 0;
    let currentText = '';
    
    while (i < content.length) {
      // Check for variable reference
      if (content[i] === '@' && i + 1 < content.length) {
        // Save any accumulated text
        if (currentText) {
          parts.push(this.createNode(NodeType.Text, { 
            content: currentText,
            location: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } }
          }));
          currentText = '';
        }
        
        // Extract variable name
        i++; // Skip @
        let varName = '';
        while (i < content.length && /[a-zA-Z0-9_]/.test(content[i])) {
          varName += content[i];
          i++;
        }
        
        if (varName) {
          parts.push(this.createVariableReferenceNode('varIdentifier', {
            identifier: varName
          }));
        } else {
          // Not a valid variable, treat @ as literal text
          currentText += '@';
        }
      } else {
        // Regular character
        currentText += content[i];
        i++;
      }
    }
    
    // Add any remaining text
    if (currentText) {
      parts.push(this.createNode(NodeType.Text, { 
        content: currentText,
        location: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } }
      }));
    }
    
    return parts;
  },

  /**
   * Create an ExecInvocation node
   */
  createExecInvocation(commandRef: any, withClause: any, location: any) {
    return this.createNode('ExecInvocation' as NodeTypeKey, {
      commandRef,
      withClause: withClause || null,
      location
    });
  },

  /**
   * Get the command name from an ExecInvocation node
   */
  getExecInvocationName(node: any): string | null {
    if (!node || node.type !== 'ExecInvocation') return null;
    return node.commandRef?.identifier || node.commandRef?.name;
  },

  /**
   * Check if a node is an ExecInvocation
   */
  isExecInvocationNode(node: any): boolean {
    return node?.type === 'ExecInvocation';
  },

  /**
   * Parse a JavaScript code block using acorn to find the complete block
   * This handles nested braces, strings, template literals, etc. properly
   * 
   * @param input - The full input string
   * @param startPos - Position after the opening brace
   * @returns The parsed code content and end position, or null if invalid
   */
  parseJavaScriptBlock(input: string, startPos: number): { content: string; endPos: number } | null {
    // Extract everything from startPos to end of input as potential code
    const potentialCode = input.substring(startPos);
    
    // Try to find a valid JavaScript block by testing progressively longer strings
    let lastValidEnd = -1;
    let lastValidCode = '';
    
    for (let i = 0; i < potentialCode.length; i++) {
      // Skip if we haven't reached a closing brace yet
      if (potentialCode[i] !== '}') continue;
      
      // Extract code up to this closing brace
      const testCode = potentialCode.substring(0, i);
      
      try {
        // Try to parse as a block statement or expression
        // Wrap in parentheses to handle object literals
        acorn.parse(`(${testCode})`, { 
          ecmaVersion: 'latest',
          allowReturnOutsideFunction: true
        } as any);
        
        // If parse succeeded, this is valid JavaScript
        lastValidEnd = i;
        lastValidCode = testCode;
      } catch (e) {
        // Try as a statement/function body
        try {
          acorn.parse(testCode, { 
            ecmaVersion: 'latest',
            allowReturnOutsideFunction: true,
            sourceType: 'module'
          } as any);
          
          lastValidEnd = i;
          lastValidCode = testCode;
        } catch (e2) {
          // Not valid JavaScript yet, keep looking
        }
      }
    }
    
    if (lastValidEnd >= 0) {
      return {
        content: lastValidCode.trim(),
        endPos: startPos + lastValidEnd
      };
    }
    
    return null;
  },
};
