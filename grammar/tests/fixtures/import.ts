/**
 * Test fixtures for import directive with the new AST structure
 */
import type { DirectiveNode } from '../../../core/ast/types';

export interface DirectiveFixture {
  name: string;
  description: string;
  input: string;
  expected: {
    kind: string;
    subtype: string;
    values: Record<string, unknown[]>;
    raw?: Record<string, string>;
    meta?: Record<string, unknown>;
  };
}

export const importFixtures: DirectiveFixture[] = [
  {
    name: 'import-all',
    description: 'Import directive with wildcard import',
    input: '@import { * } from "file.md"',
    expected: {
      kind: 'import',
      subtype: 'importAll',
      values: {
        imports: [
          {
            type: 'VariableReference',
            identifier: '*',
            valueType: 'import',
            isVariableReference: true
          }
        ],
        path: [
          {
            type: 'Text',
            content: 'file'
          },
          {
            type: 'DotSeparator',
            value: '.'
          },
          {
            type: 'Text',
            content: 'md'
          }
        ]
      },
      raw: {
        imports: '*',
        path: 'file.md'
      },
      meta: {
        path: {
          isAbsolute: false,
          isRelative: true,
          hasVariables: false,
          hasTextVariables: false,
          hasPathVariables: false
        }
      }
    }
  },
  {
    name: 'import-selected',
    description: 'Import directive with selected imports',
    input: '@import { name } from "file.md"',
    expected: {
      kind: 'import',
      subtype: 'importSelected',
      values: {
        imports: [
          {
            type: 'VariableReference',
            identifier: 'name',
            valueType: 'import',
            isVariableReference: true
          }
        ],
        path: [
          {
            type: 'Text',
            content: 'file'
          },
          {
            type: 'DotSeparator',
            value: '.'
          },
          {
            type: 'Text',
            content: 'md'
          }
        ]
      },
      raw: {
        imports: 'name',
        path: 'file.md'
      },
      meta: {
        path: {
          isAbsolute: false,
          isRelative: true,
          hasVariables: false,
          hasTextVariables: false,
          hasPathVariables: false
        }
      }
    }
  },
  {
    name: 'import-with-dollar-variable',
    description: 'Import directive with path variable using $path format',
    input: '@import { name } from "$path"',
    expected: {
      kind: 'import',
      subtype: 'importSelected',
      values: {
        imports: [
          {
            type: 'VariableReference',
            identifier: 'name',
            valueType: 'import',
            isVariableReference: true
          }
        ],
        path: [
          {
            type: 'VariableReference',
            valueType: 'path',
            identifier: 'path',
            isVariableReference: true
          }
        ]
      },
      raw: {
        imports: 'name',
        path: '$path'
      },
      meta: {}
    }
  }
];

export const importInvalidFixtures: DirectiveFixture[] = [
  {
    name: 'invalid-import',
    description: 'Import directive with invalid syntax',
    input: '@import { name } from',
    expected: {
      kind: 'error',
      subtype: 'syntaxError',
      values: {
        error: [
          {
            type: 'Error',
            error: 'Invalid import syntax'
          }
        ]
      }
    }
  }
];