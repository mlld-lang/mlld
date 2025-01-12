import type { MeldNode } from 'meld-spec';
import { parse } from './__mocks__/meld-ast';
import { MeldParseError } from './errors/errors';

/**
 * Parse Meld content into an AST
 * @param content The Meld content to parse
 * @returns Array of AST nodes
 * @throws {MeldParseError} If parsing fails
 */
export function parseMeld(content: string): MeldNode[] {
  try {
    return parse(content);
  } catch (error) {
    throw new MeldParseError(error instanceof Error ? error.message : 'Parse error');
  }
} 