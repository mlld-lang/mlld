import type { ParserTestCase } from '@core/syntax/types/parser';

export const importTests: ParserTestCase[] = [
  {
    name: 'import-all',
    description: 'Import directive with wildcard import',
    input: '@import [*] from [file.md]',
    expected: {
      type: 'Directive',
      kind: 'import',
      subtype: 'importAll',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      values: {
        imports: [
          {
            type: 'VariableReference',
            identifier: '*',
            valueType: 'import',
            isVariableReference: true,
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
          }
        ],
        path: [
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            content: 'file'
          },
          {
            type: 'DotSeparator',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            value: '.'
          },
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            content: 'md'
          }
        ]
      }
    }
  },
  // TODO: Temporarily commented out until importNamed logic is revisited
  // {
  //   name: 'import-named',
  //   description: 'Import directive with named imports',
  //   input: '@import [variable as var] from [file.md]',
  //   expected: {
  //     type: 'Directive',
  //     kind: 'import',
  //     subtype: 'named',
  //     nodeId: 'placeholder-id',
  //     location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //     values: {
  //       imports: [
  //         {
  //           type: 'VariableReference',
  //           identifier: 'variable',
  //           valueType: 'import',
  //           isVariableReference: true,
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           alias: {
  //             type: 'VariableReference',
  //             identifier: 'var',
  //             valueType: 'import',
  //             isVariableReference: true,
  //             nodeId: 'placeholder-id',
  //             location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
  //           }
  //         }
  //       ],
  //       path: [
  //         {
  //           type: 'Text',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           content: 'file.md'
  //         }
  //       ]
  //     }
  //   }
  // },
  {
    name: 'simple-import',
    description: 'Import directive with simple path',
    input: '@import [name] from [file.md]',
    expected: {
      type: 'Directive',
      kind: 'import',
      subtype: 'named',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      values: {
        imports: [
          {
            type: 'VariableReference',
            identifier: 'name',
            valueType: 'import',
            isVariableReference: true,
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
          }
        ],
        path: [
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            content: 'file'
          },
          {
            type: 'DotSeparator',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            value: '.'
          },
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            content: 'md'
          }
        ]
      }
    }
  },
  // TODO: Fix grammar bug with text variables in path validation (issue #41)
  // {
  //   name: 'import-with-variable',
  //   description: 'Import directive with variable in path using {{path}} format',
  //   input: '@import [name] from [{{path}}]',
  //   expected: {
  //     type: 'Directive',
  //     kind: 'import',
  //     subtype: 'named',
  //     nodeId: 'placeholder-id',
  //     location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //     values: {
  //       imports: [
  //         {
  //           type: 'VariableReference',
  //           identifier: 'name',
  //           valueType: 'import',
  //           isVariableReference: true,
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //         }
  //       ],
  //       path: [
  //         {
  //           type: 'VariableReference',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           valueType: 'text',
  //           identifier: 'path',
  //           isVariableReference: true
  //         }
  //       ]
  //     }
  //   }
  // },
  {
    name: 'import-with-dollar-variable',
    description: 'Import directive with variable in path using $path format',
    input: '@import [name] from [$path]',
    expected: {
      type: 'Directive',
      kind: 'import',
      subtype: 'named',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      values: {
        imports: [
          {
            type: 'VariableReference',
            identifier: 'name',
            valueType: 'import',
            isVariableReference: true,
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
          }
        ],
        path: [
          {
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            valueType: 'path',
            identifier: 'path',
            isVariableReference: true
          }
        ]
      }
    }
  },
  // TODO: Fix grammar bug with text variables in path validation (issue #41)
  // {
  //   name: 'import-with-mixed-variables',
  //   description: 'Import directive with mixed variable formats ($path and {{name}})',
  //   input: '@import [name] from [$path/{{name}}]',
  //   expected: {
  //     type: 'Directive',
  //     kind: 'import',
  //     subtype: 'named',
  //     nodeId: 'placeholder-id',
  //     location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //     values: {
  //       imports: [
  //         {
  //           type: 'VariableReference',
  //           identifier: 'name',
  //           valueType: 'import',
  //           isVariableReference: true,
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //         }
  //       ],
  //       path: [
  //         {
  //           type: 'VariableReference',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           valueType: 'path',
  //           identifier: 'path',
  //           isVariableReference: true
  //         },
  //         {
  //           type: 'Text',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           content: '/'
  //         },
  //         {
  //           type: 'VariableReference',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           valueType: 'text',
  //           identifier: 'name',
  //           isVariableReference: true
  //         }
  //       ]
  //     }
  //   }
  // },
  // TODO: Fix grammar bug with text variables in path validation (issue #41)
  // {
  //   name: 'import-with-special-var',
  //   description: 'Import directive with special variable in path',
  //   input: '@import [name] from [{{__cwd}}/file.md]',
  //   expected: {
  //     type: 'Directive',
  //     kind: 'import',
  //     subtype: 'named',
  //     nodeId: 'placeholder-id',
  //     location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //     values: {
  //       imports: [
  //         {
  //           type: 'VariableReference',
  //           identifier: 'name',
  //           valueType: 'import',
  //           isVariableReference: true,
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //         }
  //       ],
  //       path: [
  //         {
  //           type: 'VariableReference',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           valueType: 'text',
  //           identifier: '__cwd',
  //           isVariableReference: true
  //         },
  //         {
  //           type: 'Text',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           content: '/file.md'
  //         }
  //       ]
  //     }
  //   }
  // }
];

export const importInvalidTests: ParserTestCase[] = [
  {
    name: 'invalid-import',
    description: 'Import directive with invalid syntax',
    input: '@import [name] from',
    expected: {
      type: 'Error',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      error: 'Invalid import syntax'
    }
  }
];
