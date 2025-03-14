import type { Parser } from 'peggy';

export const parse: Parser;
export class SyntaxError extends Error {
  location: {
    start: { line: number; column: number; };
    end: { line: number; column: number; };
  };
  expected: string[];
  found: string | null;
  name: string;
  message: string;
} 