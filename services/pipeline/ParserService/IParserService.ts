import type { MeldNode } from 'meld-spec';

export interface IParserService {
  /**
   * Parse Meld content into an AST using meld-ast.
   * @param content The Meld content to parse
   * @returns A promise that resolves to an array of MeldNodes representing the AST
   * @throws {MeldParseError} If the content cannot be parsed
   */
  parse(content: string): Promise<MeldNode[]>;

  /**
   * Parse Meld content and provide location information for each node.
   * This is useful for error reporting and source mapping.
   * @param content The Meld content to parse
   * @param filePath Optional file path for better error messages
   * @returns A promise that resolves to an array of MeldNodes with location information
   * @throws {MeldParseError} If the content cannot be parsed
   */
  parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]>;
} 