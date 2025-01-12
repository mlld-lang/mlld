import { describe, it, expect, beforeEach, vi } from 'vitest';
import { embedDirectiveHandler } from '../embed';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode } from 'meld-spec';
import * as fs from 'fs';
import * as path from 'path';
import { DirectiveRegistry } from '../registry';
import { MeldDirectiveError } from '../../errors/errors';

// Mock external dependencies
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn()
  },
  readFileSync: vi.fn()
}));

vi.mock('path', () => ({
  default: {
    extname: vi.fn(),
    isAbsolute: vi.fn()
  },
  extname: vi.fn(),
  isAbsolute: vi.fn()
}));

describe('EmbedDirectiveHandler', () => {
  let handler = embedDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    vi.resetAllMocks();
    state = new InterpreterState();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(embedDirectiveHandler);

    // Setup default mock implementations
    vi.mocked(fs.readFileSync).mockReturnValue('mock content');
    vi.mocked(path.extname).mockReturnValue('.md');
    vi.mocked(path.isAbsolute).mockReturnValue(false);
  });

  describe('canHandle', () => {
    it('should handle embed directives', () => {
      expect(handler.canHandle('embed')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('run')).toBe(false);
      expect(handler.canHandle('data')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle basic embed', () => {
      const mockContent = 'Some content';
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      expect(fs.readFileSync).toHaveBeenCalledWith('./test.md', 'utf8');
      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual({
        type: 'Text',
        content: mockContent,
        location: node.location
      });
    });

    it('should throw error if path is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow('Embed directive requires a path');
    });

    it('should throw error if path is invalid', () => {
      vi.mocked(path.extname).mockReturnValue('');
      
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: 'invalid'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow('Embed path must be a valid file path');
    });

    it('should extract specified section', () => {
      const mockContent = `# Header 1
Some content

## Target Section
Section content
More content

### Subsection
Subsection content

## Another Section
Other content`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          section: 'Target Section'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      expect(fs.readFileSync).toHaveBeenCalledWith('./test.md', 'utf8');
      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toContain('## Target Section');
      expect(nodes[0].content).toContain('Section content');
      expect(nodes[0].content).toContain('More content');
      expect(nodes[0].content).toContain('### Subsection');
      expect(nodes[0].content).not.toContain('# Header 1');
      expect(nodes[0].content).not.toContain('## Another Section');
    });

    it('should throw error if section not found', () => {
      const mockContent = `# Header 1\nSome content`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          section: 'Non-existent Section'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow('Section "Non-existent Section" not found in content');
    });

    it('should adjust header levels', () => {
      const mockContent = `# Header 1
## Header 2
### Header 3`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          headerLevel: '###'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('### Header 1\n#### Header 2\n##### Header 3');
    });

    it('should add content under specified header', () => {
      const mockContent = `# Existing Header\nSome content`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          underHeader: 'New Header'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('# New Header\n\n# Existing Header\nSome content');
    });

    it('should extract specified items', () => {
      const mockContent = `# Item 1
Content for item 1

## Subsection 1.1
More content

# Item 2
Content for item 2

# Item 3
Content for item 3`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          items: ['Item 1', 'Item 3']
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toContain('# Item 1');
      expect(nodes[0].content).toContain('Content for item 1');
      expect(nodes[0].content).toContain('## Subsection 1.1');
      expect(nodes[0].content).toContain('# Item 3');
      expect(nodes[0].content).toContain('Content for item 3');
      expect(nodes[0].content).not.toContain('# Item 2');
    });

    it('should throw error if items not found', () => {
      const mockContent = `# Item 1\nContent`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          items: ['Non-existent Item']
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow('Items not found in content: Non-existent Item');
    });

    it('should handle multiple transformations', () => {
      const mockContent = `# Item 1
## Subsection 1.1
Content

# Item 2
## Subsection 2.1
More content`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          items: ['Item 1'],
          headerLevel: '###',
          underHeader: 'New Header'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('# New Header\n\n### Item 1\n#### Subsection 1.1\nContent');
    });

    it('should interpret nested directives when interpret flag is set', () => {
      const mockContent = `
@data test = { "key": "value" }
Some content
@text message = "Hello"
      `.trim();
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          interpret: true
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      expect(fs.readFileSync).toHaveBeenCalledWith('./test.md', 'utf8');
      expect(state.getDataVar('test')).toEqual({ key: 'value' });
      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('Some content');
    });

    it('should interpret nested directives in extracted sections', () => {
      const mockContent = `
# Section 1
Plain text

## Target Section
@data test = { "key": "value" }
Section content
@text message = "Hello"

## Another Section
Other content
      `.trim();
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          section: 'Target Section',
          interpret: true
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      expect(state.getDataVar('test')).toEqual({ key: 'value' });
      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('Section content');
    });

    it('should not interpret nested directives when interpret flag is false', () => {
      const mockContent = `
@data test = { "key": "value" }
Some content
@text message = "Hello"
      `.trim();
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          interpret: false
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      expect(state.getDataVar('test')).toBeUndefined();
      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe(mockContent);
    });

    it('should handle nested sections', () => {
      const mockContent = `# Section 1
Content 1

## Subsection 1.1
Sub-content 1.1

### Deep Section 1.1.1
Deep content

## Subsection 1.2
Sub-content 1.2

# Section 2
Content 2`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          section: 'Subsection 1.1'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toContain('## Subsection 1.1');
      expect(nodes[0].content).toContain('Sub-content 1.1');
      expect(nodes[0].content).toContain('### Deep Section 1.1.1');
      expect(nodes[0].content).toContain('Deep content');
      expect(nodes[0].content).not.toContain('# Section 1');
      expect(nodes[0].content).not.toContain('## Subsection 1.2');
    });

    it('should handle multiple header levels in section extraction', () => {
      const mockContent = `# Level 1
Content 1

## Level 2
Content 2

### Level 3
Content 3

#### Level 4
Content 4

##### Level 5
Content 5

###### Level 6
Content 6`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          section: 'Level 2',
          headerLevel: '###'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      const content = nodes[0].content;
      expect(content).toContain('### Level 2');
      expect(content).toContain('#### Level 3');
      expect(content).toContain('##### Level 4');
      expect(content).toContain('###### Level 5');
      expect(content).toContain('####### Level 6');
      expect(content).not.toContain('# Level 1');
    });

    it('should handle items with mixed content types', () => {
      const mockContent = `# Item 1
Regular text

\`\`\`javascript
console.log("code block");
\`\`\`

> Blockquote text

- List item 1
- List item 2

# Item 2
Skip this

# Item 3
**Bold text**
*Italic text*

1. Numbered list
2. Another item`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          items: ['Item 1', 'Item 3']
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      const content = nodes[0].content;
      
      // Check Item 1 content
      expect(content).toContain('# Item 1');
      expect(content).toContain('Regular text');
      expect(content).toContain('```javascript');
      expect(content).toContain('console.log("code block")');
      expect(content).toContain('> Blockquote text');
      expect(content).toContain('- List item 1');
      expect(content).toContain('- List item 2');

      // Check Item 3 content
      expect(content).toContain('# Item 3');
      expect(content).toContain('**Bold text**');
      expect(content).toContain('*Italic text*');
      expect(content).toContain('1. Numbered list');
      expect(content).toContain('2. Another item');

      // Verify Item 2 is not included
      expect(content).not.toContain('# Item 2');
      expect(content).not.toContain('Skip this');
    });

    it('should handle empty sections gracefully', () => {
      const mockContent = `# Section 1

# Section 2
Content 2`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          section: 'Section 1'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('# Section 1\n');
    });

    it('should handle interpret flag for nested directives', () => {
      const mockContent = '@text test = "value"\n@data config = { "key": "value" }';
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          interpret: true
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      // Verify that the content was interpreted
      expect(state.getTextVar('test')).toBe('value');
      expect(state.getDataVar('config')).toEqual({ key: 'value' });
    });

    it('should combine section, header level, and under header options', () => {
      const mockContent = `# Intro
Skip this

## Target Section
Section content

### Subsection
More content`;

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: './test.md',
          section: 'Target Section',
          headerLevel: '####',
          underHeader: 'New Parent'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      const content = nodes[0].content;
      
      // Check header hierarchy and content
      expect(content).toContain('# New Parent');
      expect(content).toContain('#### Target Section');
      expect(content).toContain('##### Subsection');
      expect(content).toContain('Section content');
      expect(content).toContain('More content');
      expect(content).not.toContain('# Intro');
    });
  });
}); 