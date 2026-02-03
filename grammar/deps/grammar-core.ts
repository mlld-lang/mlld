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
  FileReference: 'FileReference',
  BinaryExpression: 'BinaryExpression',
  TernaryExpression: 'TernaryExpression',
  UnaryExpression: 'UnaryExpression',
  WhenExpression: 'WhenExpression',
} as const;
export type NodeTypeKey = keyof typeof NodeType;

export const DirectiveKind = {
  run: 'run',
  var: 'var',     // NEW: Replaces text/data
  show: 'show',   // NEW: Replaces add
  stream: 'stream',
  exe: 'exe',     // NEW: Replaces exec
  env: 'env',
  for: 'for',     // For loops
  path: 'path',
  import: 'import',
  export: 'export',
  output: 'output',
  append: 'append',
  if: 'if',
  when: 'when',
  guard: 'guard',
  // NO deprecated entries - clean break!
  needs: 'needs',
  profiles: 'profiles',
  policy: 'policy',
  while: 'while',
  loop: 'loop',
  sign: 'sign',
  verify: 'verify'
} as const;
export type DirectiveKindKey = keyof typeof DirectiveKind;

export interface GrammarWarning {
  code?: string;
  message: string;
  suggestion?: string;
  location?: any;
}

type WarningCollector = ((warning: GrammarWarning) => void) | GrammarWarning[];

let warningCollector: ((warning: GrammarWarning) => void) | null = null;

export interface BlockReparseOptions {
  parse: (input: string, options?: any) => any;
  SyntaxErrorClass: new (...args: any[]) => any;
  text: string;
  startRule: string;
  baseLocation: any;
  grammarSource?: string;
  mode?: string;
}

export const helpers = {
  debug(msg: string, ...args: unknown[]) {
    if (process.env.DEBUG_MLLD_GRAMMAR) console.log('[DEBUG GRAMMAR]', msg, ...args);
  },

  warn(message: string, suggestion?: string, loc?: any, code?: string): GrammarWarning {
    const warning: GrammarWarning = {
      message,
      ...(suggestion ? { suggestion } : {}),
      ...(loc ? { location: loc } : {}),
      ...(code ? { code } : {})
    };

    if (warningCollector) {
      try {
        warningCollector(warning);
        return warning;
      } catch {
        // ignore collector errors and fall back to console
      }
    }

    try {
      // eslint-disable-next-line no-console
      console.warn(`[mlld grammar warning] ${warning.message}`);
    } catch {
      // ignore console failures
    }

    return warning;
  },

  setWarningCollector(collector?: WarningCollector | null) {
    if (!collector) {
      warningCollector = null;
      return;
    }

    if (Array.isArray(collector)) {
      warningCollector = (warning: GrammarWarning) => {
        collector.push(warning);
      };
      return;
    }

    warningCollector = collector;
  },

  clearWarningCollector() {
    warningCollector = null;
  },

  isExecutableReference(ref: any): boolean {
    // Check if reference is a function call (has execution semantics)
    // This includes ExecInvocation, FieldAccessExec, or any reference with arguments
    if (!ref) return false;
    
    // Direct exec invocation
    if (ref.type === 'ExecInvocation') return true;
    
    // Field access with execution (e.g., @obj.method())
    if (ref.type === 'FieldAccessExec') return true;
    
    // Check for presence of arguments (indicates function call)
    if (ref.arguments !== undefined && ref.arguments !== null) return true;
    
    // Check for parentheses in unified references
    if (ref.hasParentheses === true) return true;
    
    return false;
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
   * Determines if the current position represents a directive context.
   * A directive context requires:
   * 1. Logical line start
   * 2. Optional leading slash
   * 3. Followed by a directive keyword
   */
  isDirectiveContext(input: string, pos: number): boolean {
    if (!this.isLogicalLineStart(input, pos)) return false;
    let cursor = pos;
    if (input[cursor] === '/') cursor++;

    const directiveKeywords = [...Object.keys(DirectiveKind), 'log'];

    for (const keyword of directiveKeywords) {
      const end = cursor + keyword.length;
      if (end > input.length) continue;

      const potentialKeyword = input.substring(cursor, end);
      if (potentialKeyword !== keyword) continue;

      if (end === input.length) return true;

      const nextChar = input[end];
      if (' \t\r\n'.includes(nextChar)) return true;
      if (!/[a-zA-Z0-9_]/.test(nextChar)) return true;
    }

    return false;
  },

  /**
   * Legacy helper retained for compatibility.
   * Delegates to isDirectiveContext but requires the slash prefix.
   */
  isSlashDirectiveContext(input: string, pos: number): boolean {
    return input[pos] === '/' && this.isDirectiveContext(input, pos);
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
    
    // If we're at a slash directive context, this can't be a variable context
    if (this.isDirectiveContext(input, pos)) return false;
    
    // If not a directive, but we have an @ symbol, it's a variable reference
    // This assumes that @ is either:
    // - Not at line start, or
    // - At line start but not followed by directive keyword
    return true;
  },

  // Checks if a trailing ? belongs to a field access suffix
  isOptionalFieldAccessBoundary(input: string, pos: number): boolean {
    let i = pos;
    while (i < input.length) {
      const ch = input[i];
      if (ch === '\n' || ch === '\r') return true;
      if (ch === ' ' || ch === '\t' || ch === '\u200B' || ch === '\u200C' || ch === '\u200D') {
        i += 1;
        continue;
      }

      const rest = input.substring(i);
      const hasKeywordBoundary = (keyword: string) => {
        if (!rest.startsWith(keyword)) return false;
        const next = rest[keyword.length];
        return !next || !/[A-Za-z0-9_]/.test(next);
      };

      if (hasKeywordBoundary('with') || hasKeywordBoundary('pipeline') || hasKeywordBoundary('as')) {
        return true;
      }
      if (rest.startsWith('||')) return true;
      if (ch === '|') return true;
      if (rest.startsWith('!=')) return true;
      if (ch === '#') return true;
      if (ch === ',' || ch === ')' || ch === ']' || ch === '}') return true;
      if ('=<>*/%&~'.includes(ch)) return true;
      return false;
    }
    return true;
  },
  
  /**
   * DEPRECATED: RHS slashes are no longer supported
   * Keeping for reference but this should not be used
   * @deprecated
   */
  isRHSContext(input: string, pos: number): boolean {
    return false; // RHS slashes are no longer supported
    // Original implementation commented out - RHS slashes no longer supported
  },
  
  /**
   * Determines if the current position represents plain text context
   * Plain text is any context that isn't a directive, variable, or RHS
   */
  isPlainTextContext(input: string, pos: number): boolean {
    // If it's not any of the special contexts, it's plain text
    return !this.isDirectiveContext(input, pos) && 
           !this.isAtVariableContext(input, pos);
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
    // Add development-time validation for missing locations
    if (!props.location && process.env.DEBUG_MLLD_GRAMMAR) {
      console.warn(`WARNING: Creating ${type} node without location data`);
      if (process.env.DEBUG_MLLD_GRAMMAR_TRACE) {
        console.trace();
      }
    }
    
    return Object.freeze({
      type,
      nodeId: randomUUID(),
      location: props.location, // No fallback - let it be undefined if not provided
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

  createVariableReferenceNode(valueType: string, data: any, location: any) {
    if (!location) {
      throw new Error(`Location is required for createVariableReferenceNode (valueType: ${valueType}, identifier: ${data.identifier || 'unknown'})`);
    }
    return this.createNode(NodeType.VariableReference, { valueType, ...data, location });
  },

  normalizePathVar(id: string) {
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

  reconstructRawString(nodes: any[] | any): string {
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
            const optionalSuffix = field.optional ? '?' : '';
            if (field.type === 'field' || field.type === 'dot') {
              fieldPath += `.${field.name || field.value}${optionalSuffix}`;
            } else if (field.type === 'numericField') {
              fieldPath += `.${field.value ?? ''}${optionalSuffix}`;
            } else if (field.type === 'array' || field.type === 'arrayIndex') {
              const indexValue = field.index ?? field.value ?? '';
              fieldPath += `[${indexValue}]${optionalSuffix}`;
            } else if (field.type === 'stringIndex' || field.type === 'bracketAccess') {
              fieldPath += `[${JSON.stringify(field.value ?? '')}]${optionalSuffix}`;
            } else if (field.type === 'variableIndex') {
              const ref = field.value;
              fieldPath += `[${this.reconstructRawString(ref)}]${optionalSuffix}`;
            } else if (field.type === 'arraySlice') {
              const start = field.start ?? '';
              const end = field.end ?? '';
              fieldPath += `[${start}:${end}]${optionalSuffix}`;
            } else if (field.type === 'arrayFilter') {
              fieldPath += `[?${field.condition ?? ''}]${optionalSuffix}`;
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
        if (nodes.type === 'ConditionalStringFragment') {
          const conditionRaw = this.reconstructRawString(nodes.condition);
          const contentRaw = this.reconstructRawString(nodes.content || []);
          return `${conditionRaw}?"${contentRaw}"`;
        }
        if (nodes.type === 'ConditionalTemplateSnippet') {
          const conditionRaw = this.reconstructRawString(nodes.condition);
          const contentRaw = this.reconstructRawString(nodes.content || []);
          return `${conditionRaw}?\`${contentRaw}\``;
        }
        if (nodes.type === 'ConditionalVarOmission') {
          const variableRaw = this.reconstructRawString(nodes.variable);
          return `${variableRaw}?`;
        }
        if (nodes.type === 'NullCoalescingTight') {
          const variableRaw = this.reconstructRawString(nodes.variable);
          const fallback = nodes.default || { quote: 'double', value: '' };
          const quote = fallback.quote === 'single' ? '\'' : '"';
          return `${variableRaw}??${quote}${fallback.value || ''}${quote}`;
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
      } else if (node.type === 'ConditionalStringFragment') {
        const conditionRaw = this.reconstructRawString(node.condition);
        const contentRaw = this.reconstructRawString(node.content || []);
        raw += `${conditionRaw}?"${contentRaw}"`;
      } else if (node.type === 'ConditionalTemplateSnippet') {
        const conditionRaw = this.reconstructRawString(node.condition);
        const contentRaw = this.reconstructRawString(node.content || []);
        raw += `${conditionRaw}?\`${contentRaw}\``;
      } else if (node.type === 'ConditionalVarOmission') {
        const variableRaw = this.reconstructRawString(node.variable);
        raw += `${variableRaw}?`;
      } else if (node.type === 'NullCoalescingTight') {
        const variableRaw = this.reconstructRawString(node.variable);
        const fallback = node.default || { quote: 'double', value: '' };
        const quote = fallback.quote === 'single' ? '\'' : '"';
        raw += `${variableRaw}??${quote}${fallback.value || ''}${quote}`;
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
        p && (
          p.type === NodeType.VariableReference ||
          p.type === NodeType.ExecInvocation ||
          p.type === 'ConditionalTemplateSnippet' ||
          p.type === 'ConditionalStringFragment' ||
          p.type === 'ConditionalVarOmission' ||
          p.type === 'NullCoalescingTight'
        )
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
      'milliseconds': 1 / 1000,
      'seconds': 1,
      'minutes': 60,
      'hours': 3600,
      'days': 86400,
      'weeks': 604800
    };
    return value * (multipliers[unit] || 1);
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
   * 
   * @param content - The content to parse
   * @param baseLocation - The location of the content in the source
   */
  parseCommandContent(content: string, baseLocation?: any): any[] {
    const parts = [];
    let i = 0;
    let currentText = '';
    let textStartOffset = 0;
    
    // If no base location provided, we can't calculate proper locations
    if (!baseLocation) {
      console.warn('parseCommandContent called without baseLocation');
      // Fallback behavior for backward compatibility
      return this.parseCommandContentLegacy(content);
    }
    
    // Calculate position tracking based on baseLocation
    let currentOffset = baseLocation.start.offset;
    let currentLine = baseLocation.start.line;
    let currentColumn = baseLocation.start.column;
    
    while (i < content.length) {
      // Check for variable reference
      if (content[i] === '@' && i + 1 < content.length) {
        // Save any accumulated text
        if (currentText) {
          const textEndOffset = currentOffset;
          const textEndLine = currentLine;
          const textEndColumn = currentColumn;
          
          parts.push(this.createNode(NodeType.Text, { 
            content: currentText,
            location: {
              start: { 
                offset: baseLocation.start.offset + textStartOffset,
                line: baseLocation.start.line,
                column: baseLocation.start.column + textStartOffset
              },
              end: { 
                offset: textEndOffset,
                line: textEndLine,
                column: textEndColumn
              }
            }
          }));
          currentText = '';
        }
        
        // Mark start of variable
        const varStartOffset = currentOffset;
        const varStartLine = currentLine;
        const varStartColumn = currentColumn;
        
        // Extract variable name
        i++; // Skip @
        currentOffset++;
        currentColumn++;
        
        let varName = '';
        while (i < content.length && /[a-zA-Z0-9_]/.test(content[i])) {
          varName += content[i];
          i++;
          currentOffset++;
          currentColumn++;
        }
        
        if (varName) {
          const varEndOffset = currentOffset;
          const varEndLine = currentLine;
          const varEndColumn = currentColumn;
          
          parts.push(this.createVariableReferenceNode('varIdentifier', {
            identifier: varName
          }, {
            start: { offset: varStartOffset, line: varStartLine, column: varStartColumn },
            end: { offset: varEndOffset, line: varEndLine, column: varEndColumn }
          }));
          
          textStartOffset = i; // Next text starts here
        } else {
          // Not a valid variable, treat @ as literal text
          currentText += '@';
        }
      } else {
        // Regular character
        if (currentText === '') {
          textStartOffset = i;
        }
        currentText += content[i];
        
        // Update position tracking
        if (content[i] === '\n') {
          currentLine++;
          currentColumn = 1;
        } else {
          currentColumn++;
        }
        currentOffset++;
        i++;
      }
    }
    
    // Add any remaining text
    if (currentText) {
      parts.push(this.createNode(NodeType.Text, { 
        content: currentText,
        location: {
          start: { 
            offset: baseLocation.start.offset + textStartOffset,
            line: baseLocation.start.line,
            column: baseLocation.start.column + textStartOffset
          },
          end: { 
            offset: currentOffset,
            line: currentLine,
            column: currentColumn
          }
        }
      }));
    }
    
    return parts;
  },
  
  /**
   * Legacy version of parseCommandContent for backward compatibility
   * Creates nodes without proper location data
   */
  parseCommandContentLegacy(content: string): any[] {
    const parts = [];
    let i = 0;
    let currentText = '';
    
    while (i < content.length) {
      if (content[i] === '@' && i + 1 < content.length) {
        if (currentText) {
          parts.push(this.createNode(NodeType.Text, { 
            content: currentText
          }));
          currentText = '';
        }
        
        i++; // Skip @
        let varName = '';
        while (i < content.length && /[a-zA-Z0-9_]/.test(content[i])) {
          varName += content[i];
          i++;
        }
        
        if (varName) {
          // Can't create variable reference without location, so create a text node
          parts.push(this.createNode(NodeType.Text, { 
            content: '@' + varName
          }));
        } else {
          currentText += '@';
        }
      } else {
        currentText += content[i];
        i++;
      }
    }
    
    if (currentText) {
      parts.push(this.createNode(NodeType.Text, { 
        content: currentText
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

  attachPostFields(exec: any, post: any[] | null | undefined) {
    if (!post || post.length === 0) {
      return exec;
    }

    let current = exec;
    const tail = current.withClause || null;
    if (tail) {
      current = { ...current, withClause: null };
    }

    const additionalFields: any[] = [];
    for (const entry of post) {
      if (entry?.type === 'methodCall') {
        // Before creating a new method invocation, apply any accumulated fields to current
        if (additionalFields.length > 0) {
          const existingFields = current.fields || [];
          current = {
            ...current,
            fields: [...existingFields, ...additionalFields]
          };
          additionalFields.length = 0;
        }

        const methodRef = {
          name: entry.name,
          identifier: [
            this.createNode(NodeType.Text, {
              content: entry.name,
              location: entry.location
            })
          ],
          args: entry.args || [],
          isCommandReference: true,
          objectSource: current
        };
        current = this.createExecInvocation(methodRef, null, entry.location);
      } else {
        additionalFields.push(entry);
      }
    }

    // Apply any remaining fields to the final current node
    if (additionalFields.length > 0) {
      const existingFields = current.fields || [];
      current = {
        ...current,
        fields: [...existingFields, ...additionalFields]
      };
    }

    if (tail) {
      current = { ...current, withClause: tail };
    }

    return current;
  },

  applyTail(exec: any, tail: any) {
    if (!tail) {
      return exec;
    }
    return {
      ...exec,
      withClause: tail
    };
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
  
  // Array vs Path disambiguation helpers for /var directive
  createEmptyArray(location: any) {
    return {
      type: 'array',
      items: [],
      location
    };
  },
  
  createArrayFromContent(content: any[], location: any) {
    return {
      type: 'array',
      items: content,
      location
    };
  },
  
  createSectionExtraction(content: { path: any; section: any }, location: any) {
    return {
      type: 'section',
      path: content.path,
      section: content.section,
      location
    };
  },
  
  createPathDereference(content: any, location: any) {
    return {
      type: 'path',
      segments: content,
      location
    };
  },
  
  createObjectFromProperties(properties: any, location: any) {
    return {
      type: 'object',
      properties: properties || {},
      location
    };
  },
  
  // Error Recovery Helper Functions
  // --------------------------------
  
  /**
   * Checks if an array is unclosed by scanning ahead
   * Returns true if unclosed, stores reason in parserState.lastUnclosedReason
   */
  isUnclosedArray(input: string, pos: number): boolean {
    let depth = 1;
    let i = pos;
    let hasHash = false;
    let hasCommentMarker = false;
    let firstNewlinePos = -1;

    this.debug('isUnclosedArray starting at pos', pos, 'first 50 chars:', input.substring(pos, pos + 50));

    // First pass: scan until end of line or closing bracket to determine if this is
    // a multi-line section syntax (has #) or a single-line array
    while (i < input.length && depth > 0) {
      const char = input[i];

      // Check for >> comment marker
      if (char === '>' && i + 1 < input.length && input[i + 1] === '>') {
        hasCommentMarker = true;
        this.debug('Found >> comment at', i, 'inside array');
      }

      if (char === '[') {
        depth++;
        this.debug('Found [ at', i, 'depth now', depth);
      } else if (char === ']') {
        depth--;
        this.debug('Found ] at', i, 'depth now', depth);
      } else if (char === '#' && depth === 1) {
        hasHash = true; // Section syntax detected
        this.debug('Found # at', i, 'in brackets - this is section syntax');
      } else if (char === '\n' && depth > 0) {
        // Record first newline position but continue scanning to find any >> markers
        if (firstNewlinePos === -1) {
          firstNewlinePos = i;
        }
        // If section syntax (has #), continue scanning
        if (!hasHash) {
          // For non-section arrays, scan ahead to look for >> before giving up
          // Continue until we hit another newline or end of content
          this.debug('Found newline at', i, 'without # - checking for comment markers ahead');
        }
      }
      i++;
    }

    // Determine if unclosed: if we exited with depth > 0, it's unclosed
    // Or if we hit a newline in a non-section array
    const isUnclosed = depth > 0 || (firstNewlinePos !== -1 && !hasHash);

    this.debug('isUnclosedArray finished: result=', isUnclosed, 'hasHash=', hasHash, 'hasCommentMarker=', hasCommentMarker, 'depth=', depth);

    if (isUnclosed) {
      this.parserState.lastUnclosedReason = hasCommentMarker ? 'commentInside' : 'generic';
    }
    return isUnclosed;
  },
  
  /**
   * Checks if an object is unclosed by scanning ahead
   * Returns true if unclosed, stores reason in parserState.lastUnclosedReason
   */
  isUnclosedObject(input: string, pos: number): boolean {
    let depth = 1;
    let i = pos;
    let inString = false;
    let stringChar: string | null = null;
    let hasCommentMarker = false;
    let firstNewlinePos = -1;

    while (i < input.length && depth > 0) {
      const char = input[i];

      // Handle string context to avoid counting braces inside strings
      if ((char === '"' || char === '\'') && (i === 0 || input[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
      }

      // Only count braces and comments outside of strings
      if (!inString) {
        // Check for >> comment marker
        if (char === '>' && i + 1 < input.length && input[i + 1] === '>') {
          hasCommentMarker = true;
        }

        if (char === '{') depth++;
        else if (char === '}') depth--;
        else if (char === '\n' && depth > 0) {
          // Record first newline but continue scanning to find any >> markers
          if (firstNewlinePos === -1) {
            firstNewlinePos = i;
          }
        }
      }
      i++;
    }

    // Unclosed if: we hit a newline with depth > 0, or reached end with depth > 0
    const isUnclosed = depth > 0 || firstNewlinePos !== -1;

    if (isUnclosed) {
      this.parserState.lastUnclosedReason = hasCommentMarker ? 'commentInside' : 'generic';
    }
    return isUnclosed;
  },
  
  /**
   * Checks if a string quote is unclosed
   * Returns true if we hit a newline or end of input before finding the closing quote
   */
  detectMissingQuoteClose(input: string, pos: number, quoteChar: string): boolean {
    let i = pos;
    while (i < input.length) {
      if (input[i] === quoteChar && input[i-1] !== '\\') return false; // Found closing quote
      if (input[i] === '\n') return true; // Hit newline before closing
      i++;
    }
    return true; // Hit end of input without closing
  },
  
  /**
   * Checks if a template delimiter (::) is unclosed
   */
  isUnclosedTemplate(input: string, pos: number): boolean {
    // Look for closing :: delimiter
    let i = pos;
    while (i < input.length - 1) {
      if (input[i] === ':' && input[i + 1] === ':') return false; // Found closing
      i++;
    }
    return true; // No closing :: found
  },
  
  /**
   * Checks if we're at the start of what looks like a multiline array
   * (array with newline after opening bracket)
   */
  isMultilineArrayStart(input: string, pos: number): boolean {
    // Skip any whitespace after current position
    let i = pos;
    while (i < input.length && (input[i] === ' ' || input[i] === '\t')) {
      i++;
    }
    // Check if next character is a newline
    return i < input.length && input[i] === '\n';
  },
  
  /**
   * Scans ahead to check if this looks like a valid language identifier for /run
   */
  isValidLanguageKeyword(input: string, pos: number, lang: string): boolean {
    const validLanguages = ['js', 'javascript', 'node', 'python', 'py', 'bash', 'sh'];
    return validLanguages.includes(lang.toLowerCase());
  },
  
  /**
   * Checks if we're missing a 'from' keyword in an import statement
   */
  isMissingFromKeyword(input: string, pos: number): boolean {
    // Scan ahead to see if we have a path but no 'from'
    let i = pos;
    // Skip whitespace
    while (i < input.length && (input[i] === ' ' || input[i] === '\t')) {
      i++;
    }
    // Check if we see a path indicator (", ', [, or @) without 'from'
    if (i < input.length) {
      const char = input[i];
      return char === '"' || char === '\'' || char === '[' || char === '@';
    }
    return false;
  },

  /**
   * Create an error with enhanced location tracking
   * Since we can't access parser internals from here, we'll just throw
   * a regular error and let the parser enhance it
   */
  mlldError(message: string, expectedToken?: string, loc?: any): never {
    const error = new Error(message) as any;
    error.isMlldError = true;
    error.expectedToken = expectedToken;
    error.mlldErrorLocation = loc;
    throw error;
  },

  /**
   * Capture content inside balanced [ ] brackets starting at startPos (the first character after '[')
   * Returns null if no matching closing bracket is found
   */
  captureBracketContent(input: string, startPos: number): { content: string; endOffset: number } | null {
    let depth = 1;
    let i = startPos;
    let inString = false;
    let quote: string | null = null;

    while (i < input.length && depth > 0) {
      const ch = input[i];
      if (inString) {
        if (ch === quote && input[i - 1] !== '\\') {
          inString = false;
          quote = null;
        }
      } else {
        if (ch === '"' || ch === '\'' || ch === '`') {
          inString = true;
          quote = ch;
        } else if (ch === '[') {
          depth++;
        } else if (ch === ']') {
          depth--;
          if (depth === 0) {
            return {
              content: input.slice(startPos, i),
              endOffset: i
            };
          }
        }
      }
      i++;
    }

    return null;
  },

  /**
   * Offset a location object by a base location (start of the block content)
   */
  offsetLocation(loc: any, baseLocation: any) {
    if (!loc || !baseLocation?.start) return loc;

    const baseStart = baseLocation.start;
    const adjustPosition = (pos: any) => {
      const line = (pos?.line || 1) + (baseStart.line || 1) - 1;
      const column =
        pos?.line === 1
          ? (pos?.column || 1) + (baseStart.column || 1) - 1
          : pos?.column || 1;

      return {
        offset: (pos?.offset || 0) + (baseStart.offset || 0),
        line,
        column
      };
    };

    return {
      source: baseLocation.source || loc.source,
      start: adjustPosition(loc.start),
      end: adjustPosition(loc.end)
    };
  },

  /**
   * Reparse a block substring with a specific start rule to surface inner errors with corrected offsets
   */
  reparseBlock(options: BlockReparseOptions): never {
    const parseOptions: Record<string, any> = { startRule: options.startRule };
    if (options.mode) parseOptions.mode = options.mode;
    if (options.grammarSource) parseOptions.grammarSource = options.grammarSource;

    try {
      // Trim trailing whitespace to mirror outer `_` consumption before the closing bracket
      const normalizedText = options.text.replace(/\s+$/, '');
      options.parse(normalizedText, parseOptions);
    } catch (error: any) {
      const err = error as any;
      if (err instanceof options.SyntaxErrorClass && err.location) {
        const adjustedLocation = this.offsetLocation(err.location, options.baseLocation);
        const enhancedError = new options.SyntaxErrorClass(
          err.message,
          err.expected,
          err.found,
          adjustedLocation
        ) as any;
        enhancedError.expected = err.expected;
        enhancedError.found = err.found;
        enhancedError.location = adjustedLocation;
        throw enhancedError;
      }
      throw error as Error;
    }

    throw this.mlldError('Invalid block content.', undefined, options.baseLocation);
  },
  
  // Parser State Management for Code Blocks
  // ----------------------------------------
  // These functions help prevent state corruption when parsing multiple
  // complex functions in mlld-run blocks
  
  /**
   * Parser state tracking object
   * Used to detect and prevent state corruption issues
   */
  parserState: {
    codeBlockDepth: 0,
    braceDepth: 0,
    inString: false,
    stringChar: null as string | null,
    lastDirectiveEndPos: -1,
    functionCount: 0,
    maxNestingDepth: 20,
    lastUnclosedReason: null as 'commentInside' | 'generic' | null
  },
  
  /**
   * Reset parser state between functions
   * This prevents state corruption when parsing multiple complex functions
   */
  resetCodeParsingState(): void {
    this.parserState.braceDepth = 0;
    this.parserState.inString = false;
    this.parserState.stringChar = null;
    // Keep track of function count and position for debugging
    this.parserState.functionCount++;
    this.debug('Parser state reset', {
      functionCount: this.parserState.functionCount,
      lastEndPos: this.parserState.lastDirectiveEndPos
    });
  },
  
  /**
   * Get current brace depth for debugging and limits
   */
  getBraceDepth(): number {
    return this.parserState.braceDepth;
  },
  
  /**
   * Increment brace depth with overflow checking
   */
  incrementBraceDepth(): void {
    this.parserState.braceDepth++;
    if (this.parserState.braceDepth > this.parserState.maxNestingDepth) {
      this.mlldError(`Code block nesting too deep (${this.parserState.braceDepth} levels). Consider simplifying your function or splitting it into smaller functions.`);
    }
  },
  
  /**
   * Decrement brace depth with underflow checking
   */
  decrementBraceDepth(): void {
    this.parserState.braceDepth--;
    if (this.parserState.braceDepth < 0) {
      // This indicates parser state corruption
      this.debug('WARNING: Brace depth underflow detected', {
        depth: this.parserState.braceDepth,
        functionCount: this.parserState.functionCount
      });
      // Reset to prevent cascading errors
      this.parserState.braceDepth = 0;
    }
  },
  
  /**
   * Validate parser state consistency
   * Returns true if state is valid, false if corrupted
   */
  validateParserState(): boolean {
    const isValid = this.parserState.braceDepth >= 0 && 
                   this.parserState.braceDepth <= this.parserState.maxNestingDepth;
    
    if (!isValid) {
      this.debug('Parser state validation failed', {
        braceDepth: this.parserState.braceDepth,
        inString: this.parserState.inString,
        functionCount: this.parserState.functionCount
      });
    }
    
    return isValid;
  },
  
  /**
   * Mark the end of a directive for state tracking
   */
  markDirectiveEnd(pos: number): void {
    this.parserState.lastDirectiveEndPos = pos;
  },
  
  // File Reference Helper Functions
  // --------------------------------
  /**
   * Checks if content inside <...> represents a file reference
   * File references are detected by presence of: . * @
   * Note: We don't include / since we don't support directories
   * Files without extensions can be used outside interpolation contexts
   */
  isFileReferenceContent(content: string): boolean {
    // Exclude HTML comments like <!-- ... -->
    if (content.trim().startsWith('!')) {
      return false;
    }
    // Check if content contains file indicators: . * @
    return /[.*@]/.test(content);
  },
  
  /**
   * Creates a FileReference AST node
   */
  createFileReferenceNode(source: any, fields: any[], pipes: any[], location: any): any {
    return {
      type: 'FileReference',
      nodeId: randomUUID(),
      source: source,
      fields: fields || [],
      pipes: pipes || [],
      location: location,
      meta: {
        isFileReference: true,
        hasGlob: typeof source === 'object' && source.raw && source.raw.includes('*'),
        isPlaceholder: source && source.type === 'placeholder'
      }
    };
  },

  // Binary expression builder with left-to-right associativity
  createBinaryExpression(first: any, rest: any[], location: any): any {
    if (!rest || rest.length === 0) return first;
    
    return rest.reduce((left, {op, right}) => 
      this.createNode('BinaryExpression' as NodeTypeKey, {
        operator: op,
        left,
        right,
        location
      }), first);
  },

  buildWhenBoundPatternExpression(boundIdentifier: string, pattern: any): any {
    const anchorLocation = (loc: any) => {
      if (!loc || !loc.start) return loc;
      return {
        start: loc.start,
        end: loc.start
      };
    };

    const boundRef = (loc: any) =>
      this.createVariableReferenceNode('identifier', { identifier: boundIdentifier }, anchorLocation(loc));

    const build = (p: any): any => {
      if (!p) return p;

      if (p.kind === 'logical') {
        const first = build(p.first);
        const rest = Array.isArray(p.rest)
          ? p.rest.map((r: any) => ({ op: r.op, right: build(r.right) }))
          : [];
        return this.createBinaryExpression(first, rest, p.location);
      }

      if (p.kind === 'wildcard') {
        if (p.node && typeof p.node === 'object') return p.node;
        return this.createNode('Literal', {
          value: '*',
          valueType: 'wildcard',
          location: p.location
        });
      }

      if (p.kind === 'compare') {
        return this.createNode('BinaryExpression' as NodeTypeKey, {
          operator: p.op,
          left: boundRef(p.location),
          right: p.right,
          location: p.location
        });
      }

      if (p.kind === 'equals') {
        const value = p.value;
        if (value && typeof value === 'object' && 'type' in value && value.type === 'Literal') {
          if (value.valueType === 'none' || value.valueType === 'wildcard') return value;
        }
        return this.createNode('BinaryExpression' as NodeTypeKey, {
          operator: '==',
          left: boundRef(p.location),
          right: value,
          location: p.location
        });
      }

      return p;
    };

    return build(pattern);
  },

  // Check if nodes contain newlines
  containsNewline(nodes: any[] | any): boolean {
    if (!Array.isArray(nodes)) nodes = [nodes];
    return nodes.some((n: any) => 
      n.type === 'Newline' || 
      (n.content && n.content.includes('\n')) ||
      (n.raw && n.raw.includes('\n'))
    );
  },

  /**
   * Creates a WhenExpression node for when expressions (used in /var assignments)
   */
  createWhenExpression(
    conditions: any[],
    withClause: any,
    location: any,
    modifier: string | null = null,
    bound: { boundIdentifier: string; boundValue: any } | null = null,
    extraMeta: Record<string, any> | null = null
  ) {
    return this.createNode(NodeType.WhenExpression, {
      conditions: conditions,
      withClause: withClause || null,
      ...(bound
        ? { boundIdentifier: bound.boundIdentifier, boundValue: bound.boundValue }
        : {}),
      meta: {
        conditionCount: conditions.length,
        isValueReturning: true,
        evaluationType: 'expression',
        hasTailModifiers: !!withClause,
        modifier: modifier,
        hasBoundValue: !!bound,
        ...(bound ? { boundIdentifier: bound.boundIdentifier } : {}),
        ...(extraMeta || {})
      },
      location
    });
  },

  /**
   * Creates a ForExpression node for for...in expressions in /var assignments
   */
  createForExpression(
    variable: any,
    source: any,
    expression: any,
    location: any,
    opts?: any,
    batchPipeline?: any | null,
    keyVariable?: any | null
  ) {
    const meta: any = {
      isForExpression: true
    };

    if (opts) {
      meta.forOptions = opts;
    }

    if (batchPipeline) {
      meta.batchPipeline = batchPipeline;
    }

    const node: any = {
      type: 'ForExpression',
      nodeId: randomUUID(),
      variable: variable,
      source: source,
      expression: Array.isArray(expression) ? expression : [expression],
      location: location,
      meta
    };
    if (keyVariable) {
      node.keyVariable = keyVariable;
    }
    return node;
  },

  /**
   * Creates a LoopExpression node for loop expressions in /var and /exe assignments
   */
  createLoopExpression(limit: any, rateMs: number | null, until: any, body: any, location: any) {
    const meta: any = {
      isLoopExpression: true,
      hasLimit: limit !== null && limit !== undefined,
      hasRate: rateMs !== null && rateMs !== undefined,
      hasUntil: Array.isArray(until) && until.length > 0
    };

    return {
      type: 'LoopExpression',
      nodeId: randomUUID(),
      limit,
      rateMs: rateMs ?? null,
      until: Array.isArray(until) ? until : null,
      block: Array.isArray(body) ? body : [body],
      location,
      meta
    };
  },

  /**
   * Creates an action node for /for directive actions
   */
  createForActionNode(directive: string, content: any, location: any, endingTail?: any, endingComment?: any) {
    const kind = directive as DirectiveKindKey;
    // Special-case: support show actions with either templates/quotes or unified references
    if (kind === 'show' && content) {
      // Detect UnifiedQuote/Template structures (have { content, wrapperType })
      if (content && typeof content === 'object' && 'content' in content && 'wrapperType' in content) {
        const values: any = { content: (content as any).content };
        // For templates/quotes, attach pipeline to values.pipeline (showTemplate branch consumes it)
        if (endingTail && endingTail.pipeline) {
          values.pipeline = endingTail.pipeline;
        }
        const meta: any = { implicit: false, isTemplateContent: true };
        if (endingComment) {
          meta.comment = endingComment;
        }
        return [this.createNode(NodeType.Directive, {
          kind,
          subtype: 'showTemplate',
          values,
          raw: { content: this.reconstructRawString((content as any).content) },
          meta,
          location
        })];
      }

      // Otherwise assume a unified reference (VariableReference/ExecInvocation/etc.)
      const isExec = content && typeof content === 'object' && content.type === 'ExecInvocation';
      const values: any = { invocation: content };
      // Attach directive-level withClause so unified pipeline detector can find it
      if (endingTail && endingTail.pipeline) {
        values.withClause = { pipeline: endingTail.pipeline };
      }
      const meta: any = { implicit: false };
      if (endingComment) {
        meta.comment = endingComment;
      }
      return [this.createNode(NodeType.Directive, {
        kind,
        subtype: isExec ? 'showInvocation' : 'showVariable',
        values,
        raw: { content: this.reconstructRawString(content) },
        meta,
        location
      })];
    }
    const meta: any = { implicit: false };
    if (endingComment) {
      meta.comment = endingComment;
    }
    return [this.createNode(NodeType.Directive, {
      kind,
      subtype: kind,
      values: { content: Array.isArray(content) ? content : [content] },
      raw: { content: this.reconstructRawString(content) },
      meta,
      location
    })];
  },

  /**
   * Helper functions for expression context detection
   */
  isSimpleCondition(expr: any): boolean {
    return expr.type === 'VariableReference' || 
           expr.type === 'Literal' ||
           (expr.type === 'UnaryExpression' && expr.operator === '!');
  },

  extractConditionVariables(expr: any): string[] {
    const variables: string[] = [];
    function traverse(node: any) {
      if (node.type === 'VariableReference') {
        variables.push(node.name || node.identifier);
      } else if (node.left) traverse(node.left);
      if (node.right) traverse(node.right);
      if (node.operand) traverse(node.operand);
    }
    traverse(expr);
    return [...new Set(variables)];
  },

  /**
   * Unified pipeline processing helper
   * Consolidates pipeline handling across directive contexts
   */
  processPipelineEnding(values: any, raw: any, meta: any, ending: any): void {
    // Add pipeline from ending if present
    if (ending.tail) {
      const pipeline = ending.tail.pipeline;
      raw.pipeline = pipeline.map((cmd: any) => `@${cmd.rawIdentifier || cmd.name || cmd}`).join(' | ');
      meta.hasPipeline = true;

      if (ending.parallel) {
        values.withClause = { pipeline, ...ending.parallel };
        meta.withClause = { ...(meta.withClause || {}), ...ending.parallel };
      } else {
        values.pipeline = pipeline;
      }
    }

    if (ending.comment) {
      meta.comment = ending.comment;
    }
  }
  ,
};
