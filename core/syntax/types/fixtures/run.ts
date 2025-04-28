import type { ParserTestCase } from '@core/syntax/types/parser';

export const runTests: ParserTestCase[] = [
  {
    name: 'simple-run',
    description: 'Run directive with simple command',
    input: '@run [ls]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'run',
        subtype: 'runCommand',
        raw: 'ls',
        values: [
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            content: 'ls',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          }
        ]
      }
    }
  },
  {
    name: 'run-with-variables',
    description: 'Run directive with variable interpolation',
    input: '@run [echo {{message}}]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'run',
        subtype: 'runCommand',
        raw: 'echo {{message}}',
        values: [
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            content: 'echo ',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          },
          {
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            valueType: 'text',
            isVariableReference: true,
            identifier: 'message',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          }
        ]
      }
    }
  },
  {
    name: 'run-defined',
    description: 'Run directive with defined command',
    input: '@run $mycommand ({{param}}, {{variable}})',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'run',
        subtype: 'runDefined',
        raw: '$mycommand',
        values: [
          {
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            valueType: 'path',
            isVariableReference: true,
            identifier: 'mycommand',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          }
        ],
        args: [
          {
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            valueType: 'text',
            isVariableReference: true,
            identifier: 'param',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          },
          {
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            valueType: 'text',
            isVariableReference: true,
            identifier: 'variable',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          }
        ]
      }
    }
  },
  {
    name: 'run-code',
    description: 'Run directive with code block',
    input: '@run python [ print("Hello world") ]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'run',
        subtype: 'runCode',
        language: 'python',
        values: [
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            content: 'print("Hello world")',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          }
        ]
      }
    }
  },
  {
    name: 'run-code-params',
    description: 'Run directive with code block and parameters',
    input: '@run python ({{variable}}) [ print(variable) ]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'run',
        subtype: 'runCodeParams',
        language: 'python',
        values: [
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            content: 'print(variable)',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          }
        ],
        args: [
          {
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            valueType: 'text',
            isVariableReference: true,
            identifier: 'variable',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          }
        ]
      }
    }
  },
  {
    name: 'run-dollar-variable-no-args',
    description: 'Run directive with dollar variable command and no arguments',
    input: '@run $command',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'run',
        subtype: 'runDefined',
        raw: '$command',
        values: [
          {
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            valueType: 'path',
            isVariableReference: true,
            identifier: 'command',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
          }
        ],
        args: []
      }
    }
  }
];

export const runInvalidTests: ParserTestCase[] = [
  {
    name: 'invalid-run',
    description: 'Run directive with invalid syntax',
    input: '@run []',
    expected: {
      type: 'Error',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      error: 'Invalid command'
    }
  }
];
