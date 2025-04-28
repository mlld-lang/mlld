import type { ParserTestCase } from '@core/syntax/types/parser';

export const dataTests: ParserTestCase[] = [
  {
    name: 'simple-object',
    description: 'Data directive with simple object',
    input: '@data user = { name: "John", age: 30 }',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 38 }
      },
      directive: {
        kind: 'data',
        identifier: 'user',
        source: 'literal',
        value: {
          name: [
            {
              type: 'Text',
              nodeId: 'placeholder-id',
              location: {
                start: { line: 1, column: 20 },
                end: { line: 1, column: 26 }
              },
              content: 'John'
            }
          ],
          age: 30
        }
      }
    }
  },
  {
    name: 'simple-array',
    description: 'Data directive with simple array',
    input: '@data numbers = [1, 2, 3]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 26 },
        source: undefined
      },
      directive: {
        kind: 'data',
        identifier: 'numbers',
        source: 'literal',
        value: [1, 2, 3]
      }
    }
  },
  {
    name: 'complex-object',
    description: 'Data directive with complex object and variables',
    input: '@data user = { name: ${name}, age: 30, settings: { theme: ${theme}, enabled: true }, tags: [${tag1}, ${tag2}] }',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 100 },
        source: undefined
      },
      directive: {
        kind: 'data',
        identifier: 'user',
        source: 'literal'
      }
    }
  }
];

export const dataInvalidTests: ParserTestCase[] = [
  {
    name: 'invalid-json',
    description: 'Data directive with invalid JSON',
    input: '@data broken = { name: "John", }',
    expected: {
      type: 'Error',
      nodeId: 'test-error-1',
      error: 'JSON parse error'
    }
  }
];
