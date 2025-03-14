import { parse as grammarParse } from '@core/ast/grammar/index.js';
import type { MeldNode } from '@core/syntax/types.js';
import { MeldAstError, ParseErrorCode, ParseResult, ParserOptions, PeggyError } from '@core/ast/types.js';

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
    const result = await grammarParse(input, opts);
    const ast = result.ast;
    const warnings = result.warnings || [];

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
              !['text', 'data', 'path'].includes((node as any).valueType)) {
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
          if (!(node as any).directive || typeof (node as any).directive !== 'object') {
            throw new Error('Directive node missing directive object');
          }
          if (typeof (node as any).directive.kind !== 'string') {
            throw new Error('Directive missing kind');
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