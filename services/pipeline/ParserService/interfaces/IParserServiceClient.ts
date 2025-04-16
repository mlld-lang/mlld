import type { MeldNode } from '@core/syntax/types/index.js';

/**
 * Minimal interface for what ResolutionService needs from ParserService.
 * This interface is used to break the circular dependency between ParserService and ResolutionService.
 */
export interface IParserServiceClient {
  /**
   * Parse a string into a Meld AST node.
   * 
   * @param content - The string content to parse
   * @param options - Optional parsing options
   * @returns The parsed Meld AST node
   */
  parseString(content: string, options?: { filePath?: string }): Promise<MeldNode[]>;
  
  /**
   * Parse a file into a Meld AST node.
   * 
   * @param filePath - The path of the file to parse
   * @returns The parsed Meld AST node
   */
  parseFile(filePath: string): Promise<MeldNode[]>;
} 