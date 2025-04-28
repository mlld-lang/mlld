import type { ParserTestCase } from '@core/syntax/types/parser';

export const importTests: ParserTestCase[] = [
  {
    name: 'import-all',
    description: 'Import directive with wildcard import',
    input: '@import [*] from [file.md]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'import',
        subtype: 'importAll',
        imports: [{ name: '*', alias: null }],
        path: {
          raw: 'file.md',
          values: [{
            type: 'Text',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, source: undefined },
            content: 'file'
          },
          {
            type: 'DotSeparator',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, source: undefined },
            value: '.'
          },
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, source: undefined },
            content: 'md'
          }],
          hasVariables: false,
          hasTextVariables: false,
          hasPathVariables: false,
          isAbsolute: false,
          isRelativeToCwd: true,
          variable_warning: false
        }
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
  //     nodeId: 'placeholder-id',
  //     location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //     directive: {
  //       kind: 'import',
  //       subtype: 'importNamed',
  //       imports: [{ name: 'variable', alias: 'var' }],
  //       path: {
  //         raw: 'file.md',
  //         values: [{
  //           type: 'Text',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           content: 'file.md'
  //         }]
  //       }
  //     }
  //   }
  // },
  {
    name: 'simple-import',
    description: 'Import directive with simple path',
    input: '@import [name] from [file.md]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'import',
        subtype: 'importStandard',
        imports: [{ name: 'name', alias: null }],
        path: {
          raw: 'file.md',
          values: [
            {
              type: 'Text',
              nodeId: 'placeholder-id',
              location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, source: undefined },
              content: 'file'
            },
            {
              type: 'DotSeparator',
              nodeId: 'placeholder-id',
              location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, source: undefined },
              value: '.'
            },
            {
              type: 'Text',
              nodeId: 'placeholder-id',
              location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, source: undefined },
              content: 'md'
            }
          ],
          hasVariables: false,
          hasTextVariables: false,
          hasPathVariables: false,
          isAbsolute: false,
          isRelativeToCwd: true,
          variable_warning: false
        }
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
  //     nodeId: 'placeholder-id',
  //     location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //     directive: {
  //       kind: 'import',
  //       subtype: 'importStandard',
  //       imports: [{ name: 'name', alias: null }],
  //       path: {
  //         raw: '{{path}}',
  //         hasVariables: true,
  //         hasTextVariables: true,
  //         hasPathVariables: false,
  //         isAbsolute: false,
  //         isRelativeToCwd: true,
  //         values: [{
  //           type: 'VariableReference',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           valueType: 'text',
  //           identifier: 'path',
  //           isVariableReference: true
  //         }],
  //         variable_warning: true
  //       }
  //     }
  //   }
  // },
  {
    name: 'import-with-dollar-variable',
    description: 'Import directive with variable in path using $path format',
    input: '@import [name] from [$path]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'import',
        subtype: 'importStandard',
        imports: [{ name: 'name', alias: null }],
        path: {
          raw: '$path',
          hasVariables: true,
          hasTextVariables: false,
          hasPathVariables: true,
          isAbsolute: false,
          isRelativeToCwd: true,
          values: [{
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, source: undefined },
            valueType: 'path',
            identifier: 'path',
            isVariableReference: true
          }],
          variable_warning: false
        }
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
  //     nodeId: 'placeholder-id',
  //     location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //     directive: {
  //       kind: 'import',
  //       subtype: 'importStandard',
  //       imports: [{ name: 'name', alias: null }],
  //       path: {
  //         raw: '$path/{{name}}',
  //         isPathVariable: true,
  //         hasVariables: true,
  //         hasTextVariables: true,
  //         hasPathVariables: true,
  //         isAbsolute: false,
  //         isRelativeToCwd: true,
  //         values: [{
  //           type: 'VariableReference',
  //           nodeId: 'placeholder-id',
  //           location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //           valueType: 'path',
  //           identifier: 'path',
  //           isSpecial: false,
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
  //         }]
  //       }
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
  //     nodeId: 'placeholder-id',
  //     location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
  //     directive: {
  //       kind: 'import',
  //       subtype: 'importStandard',
  //       imports: [{ name: 'name', alias: null }],
  //       path: {
  //         raw: '{{__cwd}}/file.md',
  //         hasVariables: true,
  //         hasTextVariables: true,
  //         hasPathVariables: false,
  //         isAbsolute: false,
  //         isRelativeToCwd: true,
  //         values: [{
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
  //         }],
  //         variable_warning: true
  //       }
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
