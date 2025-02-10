import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbedDirectiveHandler } from '../embed';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'path';
import * as fs from 'fs';
import { DirectiveRegistry } from '../registry';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';
import { MeldLLMXMLError } from '../../../converter/llmxml-utils';

// Export mockFiles for other tests to use
export const _mockFiles: { [key: string]: string } = {};
export const _mockErrors: { [key: string]: Error } = {};

describe('EmbedDirectiveHandler', () => {
  let context: TestContext;
  let embedDirectiveHandler: EmbedDirectiveHandler;

  beforeEach(() => {
    context = new TestContext();
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
        resolve: vi.fn((p: string) => p),
        join: vi.fn((...paths: string[]) => paths.join('/')),
        dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
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
    const markdownContent = `
# Title

## Section 1
Content 1

## Section 2
Content 2

### Subsection 2.1
Nested content
`;

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
      expect(content).toContain('Content 2');
      expect(content).not.toContain('Content 1');
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
      ).rejects.toThrow('Section "Nonexistent Section" not found');
    });
  });

  describe('location handling', () => {
    it('should adjust locations in right-side mode', async () => {
      const filePath = '/test/file.txt';
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const nodes = context.state.getNodes();
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

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow(/Circular/);
    });
  });
}); 