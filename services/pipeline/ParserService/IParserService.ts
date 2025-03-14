import type { MeldNode } from '@core/syntax/types.js';

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
export interface IParserService {
  /**
   * Parse Meld content into an AST using meld-ast.
   * 
   * @param content - The Meld content to parse
   * @returns A promise that resolves to an array of MeldNodes representing the AST
   * @throws {MeldParseError} If the content cannot be parsed
   * 
   * @example
   * ```ts
   * const content = '@text greeting = "Hello, world!"';
   * const nodes = await parserService.parse(content);
   * // nodes contains a DirectiveNode representing the @text directive
   * ```
   */
  parse(content: string): Promise<MeldNode[]>;

  /**
   * Parse Meld content and provide location information for each node.
   * This is useful for error reporting and source mapping.
   * 
   * @param content - The Meld content to parse
   * @param filePath - Optional file path for better error messages
   * @returns A promise that resolves to an array of MeldNodes with location information
   * @throws {MeldParseError} If the content cannot be parsed
   * 
   * @example
   * ```ts
   * const content = '@text greeting = "Hello, world!"';
   * const nodes = await parserService.parseWithLocations(content, 'example.meld');
   * // nodes contains a DirectiveNode with location information
   * ```
   */
  parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]>;
} 