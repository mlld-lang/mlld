import type { ParserTestCase } from '@core/syntax/types/parser';

export const defineTests: ParserTestCase[] = [
  {
    name: 'simple-define-run',
    description: 'Define directive with run command',
    input: '@define list = @run [ls -la]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 28 } },
      directive: {
        kind: 'define',
        name: 'list',
        command: {
          subtype: 'runCommand',
          raw: 'ls -la',
          values: [
            {
              type: 'Text',
              nodeId: 'placeholder-id',
              location: { start: { line: 1, column: 22 }, end: { line: 1, column: 28 } },
              content: 'ls -la'
            }
          ]
        }
      }
    }
  }
];

export const defineInvalidTests: ParserTestCase[] = [
  {
    name: 'invalid-command',
    description: 'Define directive with invalid command',
    input: '@define badcmd = @nonexistent [value]',
    expected: {
      type: 'Error',
      nodeId: 'placeholder-id',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 36 } },
      error: 'Invalid command type'
    }
  }
];
