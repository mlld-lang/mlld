import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load a fixture file from the __fixtures__ directory
 */
export function loadFixture(name: string): string {
  return readFileSync(
    join(__dirname, name),
    'utf-8'
  );
}

/**
 * Common fixture paths
 */
export const Fixtures = {
  Markdown: {
    Basic: 'markdown/basic.md',
    Complex: 'markdown/complex.md',
    EdgeCases: 'markdown/edge-cases.md'
  },
  XML: {
    Expected: {
      Basic: 'xml/expected/basic.xml',
      Complex: 'xml/expected/complex.xml'
    }
  }
} as const; 