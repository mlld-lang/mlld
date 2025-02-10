import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbedDirectiveHandler } from '../embed';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'path';
import * as fs from 'fs';
import { DirectiveRegistry } from '../registry';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';
import { MeldLLMXMLError } from '../../../converter/llmxml-utils';

// Mock llmxml-utils
vi.mock('../../../converter/llmxml-utils', async () => {
  const actual = await vi.importActual<typeof import('../../../converter/llmxml-utils')>('../../../converter/llmxml-utils');
  return {
    ...actual,
    MeldLLMXMLError: actual.MeldLLMXMLError,
    extractSection: vi.fn().mockImplementation(async (content: string, section: string, options: any) => {
      // Default implementation for successful cases
      if (section === 'Section 1') {
        return '## Section 1\n\nContent 1';
      }
      if (section === 'Section 2') {
        return '## Section 2\n\nContent 2\n\n### Subsection 2.1\nNested content';
      }
      if (section === 'Section Two') {
        return '## Section 1\n\nContent 1';  // Fuzzy match returns Section 1
      }
      if (section === 'Nonexistent Section') {
        throw new actual.MeldLLMXMLError('Section not found', 'SECTION_NOT_FOUND', { title: section });
      }
      if (section === 'Section One') {
        throw new actual.MeldLLMXMLError('Section not found', 'SECTION_NOT_FOUND', { title: section, bestMatch: 'Section 1' });
      }
      if (section === 'Incomplete code block') {
        throw new actual.MeldLLMXMLError('Failed to parse markdown', 'PARSE_ERROR', { details: 'Unclosed code block' });
      }
      if (section === 'Subsection' && content.includes('### Subsection\n## Section')) {
        throw new actual.MeldLLMXMLError('Invalid heading level', 'INVALID_LEVEL', { section });
      }
      return content;
    })
  };
});

// Export mockFiles for other tests to use
export const _mockFiles: { [key: string]: string } = {};
export const _mockErrors: { [key: string]: Error } = {};

describe('EmbedDirectiveHandler', () => {
  let context: TestContext;
  let embedDirectiveHandler: EmbedDirectiveHandler;

  beforeEach(() => {
    context = new TestContext();
    context.createHandlerContext = () => ({
      mode: 'toplevel',
      workspaceRoot: '/test',
      currentFilePath: '/test/current.md'
    });
    embedDirectiveHandler = new EmbedDirectiveHandler();
    
    // Clear mock files and errors
    Object.keys(_mockFiles).forEach(key => delete _mockFiles[key]);
    Object.keys(_mockErrors).forEach(key => delete _mockErrors[key]);

    // Set up default test files
    _mockFiles['/test/file.txt'] = 'Test content';
    _mockFiles['/test/doc.md'] = `
# Title

## Section 1
Content 1

## Section 2
Content 2

### Subsection 2.1
Nested content
`;

    // Mock path module
    vi.mock('path', async () => {
      const actualPath = await vi.importActual<typeof import('path')>('path');
      return {
        ...actualPath,
        resolve: vi.fn((...paths: string[]) => {
          // For test paths starting with /test/, return as is
          const resolved = paths.join('/');
          if (resolved.startsWith('/test/')) {
            return resolved;
          }
          // Otherwise use the actual resolve
          return actualPath.resolve(...paths);
        }),
        join: vi.fn((...paths: string[]) => paths.join('/')),
        dirname: vi.fn((p: string) => {
          // For test paths, return /test
          if (p.startsWith('/test/')) {
            return '/test';
          }
          return p.split('/').slice(0, -1).join('/');
        }),
        isAbsolute: vi.fn((p: string) => p.startsWith('/'))
      };
    });

    // Mock fs module
    vi.mock('fs/promises', () => ({
      readFile: vi.fn(async (filePath: string) => {
        if (_mockErrors[filePath]) {
          throw _mockErrors[filePath];
        }
        if (_mockFiles[filePath]) {
          return _mockFiles[filePath];
        }
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
      })
    }));

    vi.mock('fs', () => ({
      existsSync: vi.fn((filePath: string) => !!_mockFiles[filePath]),
      readFileSync: vi.fn((filePath: string) => {
        if (_mockErrors[filePath]) {
          throw _mockErrors[filePath];
        }
        if (_mockFiles[filePath]) {
          return _mockFiles[filePath];
        }
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
      })
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic file embedding', () => {
    it('should embed file contents', async () => {
      const filePath = '/test/file.txt';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      expect(context.state.getTextVar(`embed:${filePath}`)).toBe('Test content');
    });

    it('should throw error for missing source', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {}, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Embed source is required');
    });

    it('should throw error for non-existent file', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '/nonexistent.txt'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('ENOENT: no such file or directory');
    });
  });

  describe('section extraction', () => {
    it('should extract exact section match', async () => {
      const filePath = '/test/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Section 1'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const content = context.state.getTextVar(`embed:${filePath}`);
      expect(content).toContain('Content 1');
      expect(content).not.toContain('Content 2');
    });

    it('should extract section with fuzzy matching', async () => {
      const filePath = '/test/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Section Two',  // Different from actual "Section 2"
        fuzzyMatch: true
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const content = context.state.getTextVar(`embed:${filePath}`);
      expect(content).toContain('Content 1');
      expect(content).not.toContain('Content 2');
    });

    it('should include nested sections by default', async () => {
      const filePath = '/test/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Section 2'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const content = context.state.getTextVar(`embed:${filePath}`);
      expect(content).toContain('Content 2');
      expect(content).toContain('Subsection 2.1');
      expect(content).toContain('Nested content');
    });

    it('should throw error for non-existent section', async () => {
      const filePath = '/test/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Nonexistent Section'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Section "Nonexistent Section" not found in /test/doc.md');
    });

    it('should suggest similar section name when not found', async () => {
      const filePath = '/test/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Section One'  // Similar to "Section 1"
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Did you mean "Section 1"?');
    });

    it('should handle parse errors in markdown', async () => {
      const filePath = '/test/invalid.md';
      _mockFiles[filePath] = '## Incomplete code block\n```typescript\nconst x = {';
      
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Incomplete code block'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Failed to parse markdown in /test/invalid.md');
    });

    it('should handle invalid heading levels', async () => {
      const filePath = '/test/invalid-levels.md';
      _mockFiles[filePath] = '### Subsection\n## Section'; // Invalid nesting
      
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Subsection'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Invalid heading level in section "Subsection" in /test/invalid-levels.md');
    });

    it('should handle invalid section options', async () => {
      const filePath = '/test/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Section 1',
        fuzzyThreshold: 2.0  // Invalid threshold > 1.0
      }, location);

      // Mock extractSection to throw for this specific test
      const { extractSection } = await import('../../../converter/llmxml-utils');
      vi.mocked(extractSection).mockImplementationOnce(async () => {
        throw new MeldLLMXMLError('Invalid fuzzy threshold', 'INVALID_SECTION_OPTIONS', { threshold: 2.0 });
      });

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Invalid section options for "Section 1" in /test/doc.md');
    });
  });

  describe('location handling', () => {
    it('should adjust locations in right-side mode', async () => {
      const filePath = '/test/file.txt';
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation); // This creates a context with mode: 'rightside'
      const location = nestedContext.createLocation(2, 4);
      const node = nestedContext.createDirectiveNode('embed', {
        source: filePath
      }, location);

      await embedDirectiveHandler.handle(node, nestedContext.state, nestedContext.createHandlerContext());

      const nodes = nestedContext.state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].location?.start.line).toBe(6); // base.line (5) + relative.line (2) - 1
      expect(nodes[0].location?.start.column).toBe(4);
    });

    it('should preserve error locations', async () => {
      const location = context.createLocation(6, 4);
      const node = context.createDirectiveNode('embed', {}, location);

      try {
        await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        if (error instanceof MeldError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(6);
          expect(error.location?.column).toBe(4);
        }
      }
    });
  });

  describe('nested embedding', () => {
    it('should handle nested embedded content', async () => {
      const filePath = '/test/file.txt';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const nodes = context.state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('Test content');
    });

    it('should prevent circular embedding', async () => {
      const filePath = '/test/circular.txt';
      _mockFiles[filePath] = '<!-- @embed source="/test/circular.txt" -->';

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      // First call should succeed
      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      // Second call should fail with circular reference
      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow(/Circular reference detected/);
    });
  });
}); 