// Generated TypeScript parser
import type { MeldNode } from '@core/syntax/types.js';

// Define return type for the parser
type ParseFunction = (input: string, options?: any) => MeldNode[];

// Peggy-generated code below
${tsSource}

// Create a wrapper function that returns the AST
function parse(input: string, options?: any): MeldNode[] {
  return peg$parse(input, options);
}

// Export the parser function and error type
export { parse, peg$SyntaxError as SyntaxError }; 