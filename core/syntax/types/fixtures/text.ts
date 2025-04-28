import type { ParserTestCase } from '@core/syntax/types/parser';

export const textTests: ParserTestCase[] = [
  {
    name: 'simple-text',
    description: 'Text directive with simple value',
    input: '@text [Hello, world!]',
    expected: {
      type: 'Directive',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }, // Placeholder
      nodeId: 'placeholder-id',
      directive: {
        kind: 'text',
        values: [
          {
            type: 'Text',
            content: 'Hello, world!',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }, // Placeholder
            nodeId: 'placeholder-id' // Placeholder
          }
        ]
      }
    }
  }
];

export const textInvalidTests: ParserTestCase[] = [
  {
    name: 'invalid-text',
    description: 'Text directive with invalid syntax',
    input: '@text greeting =',
    expected: {
      type: 'Error',
      nodeId: 'test-error-6',
      error: 'Invalid text value'
    }
  }
];
