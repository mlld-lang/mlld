import type { ParserTestCase } from '@core/syntax/types/parser';

// Data directive test cases
export const dataTests: ParserTestCase[] = [
  {
    name: 'simple-object',
    description: 'Data directive with simple object',
    input: '@data user = { name: "John", age: 30 }',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-1',
      directive: {
        kind: 'data',
        identifier: 'user',
        source: 'literal',
        value: {
          name: [
            {
              type: 'Text',
              content: 'John',
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
      nodeId: 'test-node-2',
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
      nodeId: 'test-node-3',
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

// Define directive test cases
export const defineTests: ParserTestCase[] = [
  {
    name: 'simple-define-run',
    description: 'Define directive with run command',
    input: '@define list = @run [ls -la]',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-4',
      directive: {
        kind: 'define',
        name: 'list',
        command: {
          subtype: 'runCommand',
          command: [
            {
              type: 'Text',
              content: 'ls -la',
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
      nodeId: 'test-error-2',
      error: 'Invalid command type'
    }
  }
];

// Embed directive test cases
export const embedTests: ParserTestCase[] = [
  {
    name: 'simple-embed',
    description: 'Embed directive with simple path',
    input: '@embed [path/to/file.md]',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-5',
      directive: {
        kind: 'embed',
        subtype: 'embedPath',
        path: {
          raw: 'path/to/file.md',
          interpolatedValue: [
            { type: 'Text', content: 'path/to/file.md' }
          ],
          normalized: 'path/to/file.md',
          structured: {
            base: '.',
            segments: ['path', 'to', 'file.md'],
            variables: {}
          }
        }
      }
    }
  },
  {
    name: 'header-level',
    description: 'Embed directive with header level',
    input: '@embed [file.md:2]',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-6',
      directive: {
        kind: 'embed',
        subtype: 'embedPath',
        path: {
          raw: 'file.md:2',
          interpolatedValue: [
            { type: 'Text', content: 'file.md:2' }
          ],
          normalized: './file.md:2',
          structured: {
            base: '.',
            cwd: true,
            segments: ['file.md:2'],
            variables: {}
          }
        }
      }
    }
  },
  {
    name: 'section-with-header',
    description: 'Embed directive with section + header',
    input: '@embed [file.md#section:2]',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-7',
      directive: {
        kind: 'embed',
        subtype: 'embedPath',
        path: {
          raw: 'file.md',
          interpolatedValue: [
            { type: 'Text', content: 'file.md#section:2' }
          ],
          normalized: './file.md',
          structured: {
            base: '.',
            cwd: true,
            segments: ['file.md'],
            variables: {}
          }
        },
        section: 'section:2'
      }
    }
  },
  // {
  //   name: 'path-with-brackets',
  //   description: 'Embed directive with path containing brackets',
  //   input: '@embed [file[1].md]',
  //   expected: {
  //     type: 'Directive',
  //     directive: {
  //       kind: 'embed',
  //       subtype: 'embedPath',
  //       path: {
  //         raw: 'file[1].md',
  //         normalized: './file[1].md',
  //         structured: {
  //           base: '.',
  //           cwd: true,
  //           segments: ['file[1].md'],
  //           variables: {}
  //         }
  //       }
  //     }
  //   }
  // } // Skipped - Known Issue #29
];

export const embedInvalidTests: ParserTestCase[] = [
  {
    name: 'invalid-path',
    description: 'Embed directive with invalid path',
    input: '@embed []',
    expected: {
      type: 'Error',
      nodeId: 'test-error-3',
      error: 'Invalid path'
    }
  }
];

// Import directive test cases
export const importTests: ParserTestCase[] = [
  {
    name: 'simple-import',
    description: 'Import directive with simple path',
    input: '@import [name] from [path/to/file.md]',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-8',
      directive: {
        kind: 'import',
        subtype: 'importPath',
        imports: [
          { name: 'name', alias: null }
        ],
        path: {
          raw: 'path/to/file.md',
          interpolatedValue: [
            { type: 'Text', content: 'path/to/file.md' }
          ],
          normalized: 'path/to/file.md',
          structured: {
            base: '.',
            segments: ['path', 'to', 'file.md'],
            variables: {}
          }
        }
      }
    }
  },
  {
    name: 'import-with-variable',
    description: 'Import directive with variable in path',
    input: '@import [name] from [${path}]',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-9',
      directive: {
        kind: 'import',
        subtype: 'importPath',
        imports: [
          { name: 'name', alias: null }
        ],
        path: {
          raw: '${path}',
          interpolatedValue: [
            { type: 'Text', valueType: 'path', identifier: 'path', isSpecial: false, isVariableReference: true }
          ],
          normalized: '${path}',
          isPathVariable: true,
          structured: {
            base: '.',
            segments: ['${path}'],
            variables: { path: true }
          }
        }
      }
    }
  },
  {
    name: 'import-with-special-var',
    description: 'Import directive with special variable in path',
    input: '@import [name] from [${__cwd}/file.md]',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-10',
      directive: {
        kind: 'import',
        subtype: 'importPath',
        imports: [
          { name: 'name', alias: null }
        ],
        path: {
          raw: '${__cwd}/file.md',
          interpolatedValue: [
            { type: 'Text', valueType: 'path', identifier: '__cwd', isSpecial: true, isVariableReference: true },
            { type: 'Text', content: '/file.md' }
          ],
          normalized: '${__cwd}/file.md',
          structured: {
            base: '.',
            segments: ['${__cwd}', 'file.md'],
            variables: { __cwd: true }
          }
        }
      }
    }
  }
];

export const importInvalidTests: ParserTestCase[] = [
  {
    name: 'invalid-import',
    description: 'Import directive with invalid syntax',
    input: '@import [name] from',
    expected: {
      type: 'Error',
      nodeId: 'test-error-4',
      error: 'Invalid import syntax'
    }
  }
];

// Run directive test cases
export const runTests: ParserTestCase[] = [
  {
    name: 'simple-run',
    description: 'Run directive with simple command',
    input: '@run [ls -la]',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-11',
      directive: {
        kind: 'run',
        command: [
          {
            type: 'Text',
            content: 'ls -la',
          }
        ],
        subtype: 'runCommand'
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
      nodeId: 'test-error-5',
      error: 'Invalid command'
    }
  }
];

// Text directive test cases
export const textTests: ParserTestCase[] = [
  {
    name: 'simple-text',
    description: 'Text directive with simple value',
    input: '@text greeting = "Hello, world!"',
    expected: {
      type: 'Directive',
      nodeId: 'test-node-12',
      directive: {
        kind: 'text',
        identifier: 'greeting',
        source: 'literal',
        value: [
          {
            type: 'Text',
            content: 'Hello, world!'
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