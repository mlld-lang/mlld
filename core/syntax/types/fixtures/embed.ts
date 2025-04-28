import type { ParserTestCase } from '@core/syntax/types/parser';

export const embedTests: ParserTestCase[] = [
  {
    name: 'simple-embed',
    description: 'Embed directive with simple path',
    input: '@embed [path/to/file.md]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'embed',
        subtype: 'embedPath',
        path: {
          raw: 'path/to/file.md',
          values: [
            { type: 'Text', content: 'path', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'PathSeparator', value: '/', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'Text', content: 'to', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'PathSeparator', value: '/', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'Text', content: 'file', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'DotSeparator', value: '.', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'Text', content: 'md', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } }
          ],
          hasVariables: false,
          hasTextVariables: false,
          hasPathVariables: false,
          variable_warning: false,
          isAbsolute: false,
          isRelativeToCwd: true
        }
      }
    }
  },
  {
    name: 'embed-variable',
    description: 'Embed directive with variable',
    input: '@embed {{variable}}',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'embed',
        subtype: 'embedVariable',
        values: [{
          identifier: 'variable',
          isVariableReference: true,
          location: {
            end: {
              column: 0,
              line: 0,
            },
            start: {
              column: 0,
              line: 0,
            },
          },
          nodeId: 'placeholder-id',
          type: 'VariableReference',
          valueType: 'text',
        }]
      }
    }
  },
  {
    name: 'embed-template',
    description: 'Embed directive with template',
    input: '@embed [[Template with {{variable}}]]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'embed',
        subtype: 'embedTemplate',
        content: [
          {
            type: 'Text',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            content: 'Template with '
          },
          {
            type: 'VariableReference',
            nodeId: 'placeholder-id',
            location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
            identifier: 'variable',
            valueType: 'text',
            isVariableReference: true
          }
        ],
        isTemplateContent: true
      }
    }
  },
  {
    name: 'header-level',
    description: 'Embed directive with header level',
    input: '@embed [file.md:2]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'embed',
        subtype: 'embedPath',
        path: {
          raw: 'file.md:2',
          values: [
            { type: 'Text', content: 'file', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'DotSeparator', value: '.', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'Text', content: 'md:2', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } }
          ],
          hasVariables: false,
          hasTextVariables: false,
          hasPathVariables: false,
          variable_warning: false,
          isAbsolute: false,
          isRelativeToCwd: true
        }
      }
    }
  },
  {
    name: 'section-with-header',
    description: 'Embed directive with section + header',
    input: '@embed [file.md#Introduction]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'embed',
        subtype: 'embedPath',
        path: {
          raw: 'file.md',
          values: [
            { type: 'Text', content: 'file', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'DotSeparator', value: '.', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'Text', content: 'md', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'SectionMarker', value: '#', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
            { type: 'Text', content: 'Introduction', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } }
          ],
          hasVariables: false,
          hasTextVariables: false,
          hasPathVariables: false,
          variable_warning: false,
          isAbsolute: false,
          isRelativeToCwd: true
        },
        section: 'Introduction'
      }
    }
  },
  {
    name: 'embed-path-variable',
    description: 'Embed directive with a path variable',
    input: '@embed [$data_path]',
    expected: {
      type: 'Directive',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      directive: {
        kind: 'embed',
        subtype: 'embedPath',
        path: {
          raw: '$data_path',
          values: [
            { type: 'VariableReference', nodeId: 'placeholder-id', location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }, valueType: 'path', identifier: 'data_path', isVariableReference: true }
          ],
          hasVariables: true,
          hasTextVariables: false,
          hasPathVariables: true,
          variable_warning: false,
          isAbsolute: false,
          isRelativeToCwd: false
        }
      }
    }
  }
];

export const embedInvalidTests: ParserTestCase[] = [
  {
    name: 'invalid-path',
    description: 'Embed directive with invalid path',
    input: '@embed []',
    expected: {
      type: 'Error',
      nodeId: 'placeholder-id',
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      error: 'Invalid path'
    }
  }
];
