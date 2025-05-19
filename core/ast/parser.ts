// TODO: Revisit all of this! 
// It's very outdated after updating grammar 
// and adding new node types

import { parse as grammarParse } from '@core/ast/grammar/index';
import type { MeldNode } from '@core/ast/types';
import type { NodeType } from '@core/ast/types';
import { MeldAstError, ParseErrorCode, ParseResult, ParserOptions, PeggyError } from '@core/ast/types';
import { VALID_VARIABLE_TYPES } from '@core/ast/types/variables';

const defaultOptions: Required<Omit<ParserOptions, 'onError'>> & Pick<ParserOptions, 'onError'> = {
  failFast: true,
  trackLocations: true,
  validateNodes: true,
  preserveCodeFences: true,
  onError: undefined
};

/**
 * Parse a Meld document into an AST that conforms to meld-spec types.
 * Includes source locations and proper error handling.
 * 
 * @param input - The Meld document to parse
 * @param options - Parser configuration options
 * @returns ParseResult containing the AST and any non-fatal errors
 * @throws MeldAstError on parsing failures when failFast is true
 */
export async function parse(input: string, options: ParserOptions = {}): Promise<ParseResult> {
  const opts = { ...defaultOptions, ...options };
  const errors: MeldAstError[] = [];

  try {
    // Get the parse result from the grammar parser
    const ast = grammarParse(input, opts);
    const warnings: MeldAstError[] = [];

    // Validate nodes if requested
    if (opts.validateNodes) {
      validateNodes(ast, errors);
    }

    // If we have errors and failFast is true, throw the first error
    if (opts.failFast && errors.length > 0) {
      throw errors[0];
    }

    return {
      ast,
      ...(errors.length > 0 ? { errors } : {}),
      ...(warnings.length > 0 ? { warnings } : {})
    };
  } catch (error) {
    if (error instanceof MeldAstError) {
      throw error;
    }

    if (error instanceof Error) {
      // Convert Peggy error to our error format
      const peggyError = error as PeggyError;
      const location = peggyError.location ? {
        start: {
          line: peggyError.location.startLine,
          column: peggyError.location.startColumn
        },
        end: {
          line: peggyError.location.endLine,
          column: peggyError.location.endColumn
        }
      } : undefined;

      throw new MeldAstError(
        `Parse error: ${error.message}`,
        location,
        error,
        ParseErrorCode.SYNTAX_ERROR
      );
    }

    throw error;
  }
}

/**
 * Validate AST nodes against meld-spec types
 */
function validateNodes(nodes: MeldNode[], errors: MeldAstError[]): void {
  nodes.forEach(node => {
    try {
      // Basic type validation
      if (!node.type) {
        throw new Error('Node missing required type field');
      }

      // Location validation
      if (node.location) {
        const { start, end } = node.location;
        if (!start || !end || 
            typeof start.line !== 'number' || 
            typeof start.column !== 'number' ||
            typeof end.line !== 'number' ||
            typeof end.column !== 'number') {
          throw new Error('Invalid location information');
        }
      }

      // Type-specific validation
      switch (node.type) {
        case 'Text':
          if (typeof (node as any).content !== 'string') {
            throw new Error('Text node missing content');
          }
          break;

        case 'CodeFence':
          if (typeof (node as any).content !== 'string') {
            throw new Error('CodeFence node missing content');
          }
          if ((node as any).language && typeof (node as any).language !== 'string') {
            throw new Error('CodeFence language must be string');
          }
          break;

        case 'Newline':
          if (typeof (node as any).content !== 'string') {
            throw new Error('Newline node missing content');
          }
          break;

        case 'Comment':
          if (typeof (node as any).content !== 'string') {
            throw new Error('Comment node missing content');
          }
          break;

        case 'TextVar':
          if (typeof (node as any).identifier !== 'string') {
            throw new Error('TextVar node missing identifier');
          }
          break;

        case 'DataVar':
          if (typeof (node as any).identifier !== 'string') {
            throw new Error('DataVar node missing identifier');
          }
          if (!Array.isArray((node as any).fields)) {
            throw new Error('DataVar node missing fields array');
          }
          // Verify each field has the correct structure
          for (const field of (node as any).fields) {
            if (typeof field !== 'object' || (field.type !== 'field' && field.type !== 'index') || !('value' in field)) {
              throw new Error('DataVar node has invalid field structure');
            }
          }
          break;

        case 'PathVar':
          if (typeof (node as any).identifier !== 'string') {
            throw new Error('PathVar node missing identifier');
          }
          break;

        case 'VariableReference':
          if (typeof (node as any).identifier !== 'string') {
            throw new Error('VariableReference node missing identifier');
          }
          if (typeof (node as any).valueType !== 'string' || 
              !VALID_VARIABLE_TYPES.includes((node as any).valueType)) {
            throw new Error('VariableReference node has invalid valueType');
          }
          if ((node as any).fields && !Array.isArray((node as any).fields)) {
            throw new Error('VariableReference node fields must be an array');
          }
          // If fields are present, check their structure
          if ((node as any).fields && Array.isArray((node as any).fields)) {
            for (const field of (node as any).fields) {
              if (typeof field !== 'object' || (field.type !== 'field' && field.type !== 'index') || !('value' in field)) {
                throw new Error('VariableReference node has invalid field structure');
              }
            }
          }
          break;

        case 'Directive':
          // Support both old and new structure
          if ((node as any).directive) {
            // Old structure
            if (typeof (node as any).directive !== 'object') {
              throw new Error('Directive node directive property must be an object');
            }
            if (typeof (node as any).directive.kind !== 'string') {
              throw new Error('Directive missing kind');
            }
          } else {
            // New structure
            if (typeof (node as any).kind !== 'string') {
              throw new Error('Directive missing kind property');
            }
            // In the new structure, values, raw, and meta are objects
            if ((node as any).values && typeof (node as any).values !== 'object') {
              throw new Error('Directive values must be an object');
            }
            if ((node as any).raw && typeof (node as any).raw !== 'object') {
              throw new Error('Directive raw must be an object');
            }
            if ((node as any).meta && typeof (node as any).meta !== 'object') {
              throw new Error('Directive meta must be an object');
            }
            
            // Check for nested directives in values fields, which could be:
            // 1. A direct directive node in content field (text directive)
            // 2. A directive node in value field (data directive)
            // 3. Directives nested in data object properties or array items
            
            const directiveNode = node as any;
            if (directiveNode.values) {
              // Check for directly nested directives in content (text directive)
              if (directiveNode.values.content && 
                  typeof directiveNode.values.content === 'object' && 
                  !Array.isArray(directiveNode.values.content) &&
                  directiveNode.values.content.type === 'Directive') {
                // Recursively validate nested directive
                validateNodes([directiveNode.values.content], errors);
              }
              
              // Check for directly nested directives in value (data directive)
              if (directiveNode.values.value && 
                  typeof directiveNode.values.value === 'object' && 
                  !Array.isArray(directiveNode.values.value) &&
                  directiveNode.values.value.type === 'Directive') {
                // Recursively validate nested directive
                validateNodes([directiveNode.values.value], errors);
              }
              
              // Check for nested objects with type 'object' (data directive object structure)
              if (directiveNode.values.value && 
                  typeof directiveNode.values.value === 'object' && 
                  !Array.isArray(directiveNode.values.value) &&
                  directiveNode.values.value.type === 'object' &&
                  directiveNode.values.value.properties) {
                // Check each property for directive nodes
                for (const key in directiveNode.values.value.properties) {
                  const prop = directiveNode.values.value.properties[key];
                  if (prop && typeof prop === 'object' && prop.type === 'Directive') {
                    validateNodes([prop], errors);
                  }
                }
              }
              
              // Check for nested arrays with type 'array' (data directive array structure)
              if (directiveNode.values.value && 
                  typeof directiveNode.values.value === 'object' && 
                  !Array.isArray(directiveNode.values.value) &&
                  directiveNode.values.value.type === 'array' &&
                  Array.isArray(directiveNode.values.value.items)) {
                // Check each item for directive nodes
                for (const item of directiveNode.values.value.items) {
                  if (item && typeof item === 'object' && item.type === 'Directive') {
                    validateNodes([item], errors);
                  }
                }
              }
            }
          }
          break;

        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }
    } catch (error: unknown) {
      errors.push(new MeldAstError(
        `Node validation failed: ${error instanceof Error ? error.message : String(error)}`,
        node.location,
        error instanceof Error ? error : new Error(String(error)),
        ParseErrorCode.VALIDATION_ERROR
      ));
    }
  });
} 