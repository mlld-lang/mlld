import { parse } from 'meld-ast';
import type { MeldNode } from 'meld-spec';

/**
 * Parses Meld content into an AST
 * @param content The Meld content to parse
 * @returns The parsed AST
 */
export function parseMeldContent(content: string): MeldNode[] {
  try {
    return parse(content) as MeldNode[];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse Meld content: ${message}`);
  }
} 