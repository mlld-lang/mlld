import { parse } from 'meld-ast';
import type { MeldNode } from 'meld-spec';
import { MeldParseError } from './errors/errors.js';

/**
 * Parses Meld content into an AST
 * @param content The Meld content to parse
 * @returns The parsed AST
 */
export function parseMeldContent(content: string): MeldNode[] {
  try {
    return parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MeldParseError(`Failed to parse Meld content: ${message}`);
  }
} 