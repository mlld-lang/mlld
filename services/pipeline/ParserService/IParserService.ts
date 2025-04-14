import type { MeldNode } from '@core/syntax/types/index.js';

/**
 * Service responsible for parsing Meld content into an Abstract Syntax Tree (AST).
 * Provides methods to parse and analyze Meld documents and fragments.
 * 
 * @remarks
 * The ParserService wraps the meld-ast parser to provide a consistent interface
 * for parsing Meld content. It adds location information to nodes and handles
 * error reporting.
 * 
 * This service is typically used as the first step in the Meld document processing
 * pipeline, converting raw text content into a structured AST that can be further
 * processed by other services.
 * 
 * Dependencies:
 * - meld-ast: For the underlying parsing functionality
 */

// Assume these types are defined correctly elsewhere
interface ParserOptions {
  filePath?: string;
}

export interface IParserService {
  parseString(content: string, options?: ParserOptions): Promise<MeldNode[]>;
  parseFile(filePath: string): Promise<MeldNode[]>;
  parse(content: string, filePath?: string): Promise<MeldNode[]>;
  parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]>;
} 