import { MeldAstError, ParseErrorCode, ParseResult } from '../types.js';
import parser from './parser.js';
const { parse: peggyParse, SyntaxError } = parser;

// Export an async parse function that returns a ParseResult
export async function parse(input: string, options?: any): Promise<ParseResult> {
  try {
    // Call the Peggy parser directly
    const ast = peggyParse(input, options);
    
    // Check if any nodes have warnings
    const warnings: MeldAstError[] = [];
    
    // Collect warnings from nodes
    ast.forEach((node: any) => {
      if (node.warnings && Array.isArray(node.warnings)) {
        node.warnings.forEach((warning: any) => {
          warnings.push(new MeldAstError(
            warning.message,
            warning.location,
            undefined,
            'WARNING'
          ));
          
          // Remove warnings from the node after collecting them
          delete node.warnings;
        });
      }
    });
    
    return { 
      ast,
      ...(warnings.length > 0 ? { warnings } : {})
    };
  } catch (error) {
    if (error instanceof Error) {
      // Convert Peggy error to our error format
      const peggyError = error as any;
      const location = peggyError.location ? {
        start: {
          line: peggyError.location.start.line,
          column: peggyError.location.start.column
        },
        end: {
          line: peggyError.location.end.line,
          column: peggyError.location.end.column
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

// For backwards compatibility
export { SyntaxError };