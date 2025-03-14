import type { ParserTestCase } from '@core/syntax/types/parser.js';

// Data directive test cases
export const dataTests: ParserTestCase[] = [
  {
    name: 'simple-object',
    description: 'Data directive with simple object',
    input: '@data user = { name: "John", age: 30 }',
    expected: {
      type: 'Directive',
      directive: {
        kind: 'data',
        identifier: 'user',
        source: 'literal',
        value: { name: 'John', age: 30 }
      }
    }
  },
  {
    name: 'simple-array',
    description: 'Data directive with simple array',
    input: '@data numbers = [1, 2, 3]',
    expected: {
      type: 'Directive',
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
      directive: {
        kind: 'define',
        name: 'list',
        command: {
          kind: 'run',
          command: 'ls -la'
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
      directive: {
        kind: 'embed',
        path: {
          raw: 'path/to/file.md',
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
      directive: {
        kind: 'embed',
        path: {
          raw: 'file.md:2',
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
      directive: {
        kind: 'embed',
        path: {
          raw: 'file.md',
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
  {
    name: 'path-with-brackets',
    description: 'Embed directive with path containing brackets',
    input: '@embed [file[1].md]',
    expected: {
      type: 'Directive',
      directive: {
        kind: 'embed',
        path: {
          raw: 'file[1].md',
          normalized: './file[1].md',
          structured: {
            base: '.',
            cwd: true,
            segments: ['file[1].md'],
            variables: {}
          }
        }
      }
    }
  }
];

export const embedInvalidTests: ParserTestCase[] = [
  {
    name: 'empty-path',
    description: 'Embed directive with empty path',
    input: '@embed []',
    expected: {
      type: 'Error',
      error: 'Path cannot be empty'
    }
  }
];

// Import directive test cases
export const importTests: ParserTestCase[] = [
  {
    name: 'simple-import',
    description: 'Import directive with path',
    input: '@import [utilities.meld]',
    expected: {
      type: 'Directive',
      directive: {
        kind: 'import',
        imports: [{ name: '*', alias: null }],
        path: {
          raw: 'utilities.meld',
          normalized: './utilities.meld',
          structured: {
            base: '.',
            cwd: true,
            segments: ['utilities.meld'],
            variables: {}
          }
        }
      }
    }
  },
  {
    name: 'import-path-variable',
    description: 'Import with path variable',
    input: '@import [$pathvar]',
    expected: {
      type: 'Directive',
      directive: {
        kind: 'import',
        imports: [{ name: '*', alias: null }],
        path: {
          raw: '$pathvar',
          normalized: './$pathvar',
          isPathVariable: true,
          structured: {
            base: '.',
            cwd: false,
            segments: ['$pathvar'],
            variables: {
              path: ['pathvar']
            }
          }
        }
      }
    }
  },
  {
    name: 'import-homepath',
    description: 'Import with HOMEPATH variable',
    input: '@import [$HOMEPATH/config.meld]',
    expected: {
      type: 'Directive',
      directive: {
        kind: 'import',
        imports: [{ name: '*', alias: null }],
        path: {
          raw: '$HOMEPATH/config.meld',
          normalized: '$HOMEPATH/config.meld',
          structured: {
            base: '$HOMEPATH',
            cwd: false,
            segments: ['config.meld'],
            variables: {
              special: ['HOMEPATH']
            }
          }
        }
      }
    }
  }
];

export const importInvalidTests: ParserTestCase[] = [
  {
    name: 'missing-path',
    description: 'Import directive without path',
    input: '@import []',
    expected: {
      type: 'Error',
      error: 'Path cannot be empty'
    }
  }
];

// Run directive test cases
export const runTests: ParserTestCase[] = [
  {
    name: 'simple-command',
    description: 'Run directive with simple command',
    input: '@run [echo hello world]',
    expected: {
      type: 'Directive',
      directive: {
        kind: 'run',
        command: 'echo hello world'
      }
    }
  }
];

export const runInvalidTests: ParserTestCase[] = [
  {
    name: 'empty-command',
    description: 'Run directive with empty command',
    input: '@run []',
    expected: {
      type: 'Error',
      error: 'Command cannot be empty'
    }
  }
];

// Text directive test cases
export const textTests: ParserTestCase[] = [
  {
    name: 'text-variable',
    description: 'Text directive with variable value',
    input: '@text greeting = "Hello, world!"',
    expected: {
      type: 'Directive',
      directive: {
        kind: 'text',
        identifier: 'greeting',
        source: 'literal',
        value: 'Hello, world!'
      }
    }
  }
];

export const textInvalidTests: ParserTestCase[] = [
  {
    name: 'missing-value',
    description: 'Text directive without value',
    input: '@text greeting =',
    expected: {
      type: 'Error',
      error: 'Value is required'
    }
  }
];