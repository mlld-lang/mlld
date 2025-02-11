import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbedDirectiveHandler } from '../embed';
import type { DirectiveNode } from 'meld-spec';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';
import { MeldLLMXMLError } from '../../../converter/llmxml-utils';
import path from 'path';

// Mock path module
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual
  };
});

// Mock llmxml-utils for section extraction
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

describe('EmbedDirectiveHandler', () => {
  let context: TestContext;
  let embedDirectiveHandler: EmbedDirectiveHandler;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    embedDirectiveHandler = new EmbedDirectiveHandler();

    // Set up test files
    await context.writeFile('project/file.txt', 'Test content');
    await context.writeFile('project/doc.md', `
# Title

## Section 1
Content 1

## Section 2
Content 2

### Subsection 2.1
Nested content
`);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('basic file embedding', () => {
    it('should embed file contents', async () => {
      const filePath = '$PROJECTPATH/file.txt';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = context.fs.getPath('project/file.txt');
      expect(context.state.getTextVar(`embed:${resolvedPath}`)).toBe('Test content');
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
        source: '$PROJECTPATH/nonexistent.txt'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('ENOENT: no such file or directory');
    });
  });

  describe('section extraction', () => {
    it('should extract exact section match', async () => {
      const filePath = '$PROJECTPATH/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Section 1'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = context.fs.getPath('project/doc.md');
      const content = context.state.getTextVar(`embed:${resolvedPath}`);
      expect(content).toContain('Content 1');
      expect(content).not.toContain('Content 2');
    });

    it('should extract section with fuzzy matching', async () => {
      const filePath = '$PROJECTPATH/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Section Two',  // Different from actual "Section 2"
        fuzzyMatch: true
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = context.fs.getPath('project/doc.md');
      const content = context.state.getTextVar(`embed:${resolvedPath}`);
      expect(content).toContain('Content 1');
      expect(content).not.toContain('Content 2');
    });

    it('should include nested sections by default', async () => {
      const filePath = '$PROJECTPATH/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Section 2'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = context.fs.getPath('project/doc.md');
      const content = context.state.getTextVar(`embed:${resolvedPath}`);
      expect(content).toContain('Content 2');
      expect(content).toContain('Subsection 2.1');
      expect(content).toContain('Nested content');
    });

    it('should throw error for non-existent section', async () => {
      const filePath = '$PROJECTPATH/doc.md';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Nonexistent Section'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Section "Nonexistent Section" not found');
    });

    it('should suggest similar section name when not found', async () => {
      const filePath = '$PROJECTPATH/doc.md';
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
      const filePath = '$PROJECTPATH/invalid.md';
      await context.writeFile('project/invalid.md', '## Incomplete code block\n```typescript\nconst x = {');
      
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath,
        section: 'Incomplete code block'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Failed to parse markdown');
    });
  });

  describe('path resolution', () => {
    it('should resolve paths relative to current file', async () => {
      await context.writeFile('project/nested/dir/source.txt', 'Nested content');
      await context.writeFile('project/nested/dir/current.meld', '');
      
      const currentPath = context.fs.getPath('project/nested/dir/current.meld');
      context.state.setCurrentFilePath(currentPath);

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '$PROJECTPATH/nested/dir/source.txt'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = context.fs.getPath('project/nested/dir/source.txt');
      expect(context.state.getTextVar(`embed:${resolvedPath}`)).toBe('Nested content');
    });

    it('should handle home directory paths', async () => {
      await context.writeFile('home/user/data.txt', 'Home content');
      
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '$HOMEPATH/user/data.txt'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = context.fs.getPath('home/user/data.txt');
      expect(context.state.getTextVar(`embed:${resolvedPath}`)).toBe('Home content');
    });
  });
}); 