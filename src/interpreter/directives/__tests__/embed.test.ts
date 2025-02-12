import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbedDirectiveHandler } from '../embed';
import * as pathModule from 'path';
import { addMockFile, clearMocks } from '../../../__mocks__/fs';
import { TestContext } from '../../__tests__/test-utils';

// Mock path module
vi.mock('path', async () => {
  const { createPathMock } = await import('../../../../tests/__mocks__/path');
  return createPathMock();
});

// Import path utils after mock setup
import { pathTestUtils } from '../../../../tests/__mocks__/path';

// Mock fs module
vi.mock('fs', () => import('../../../__mocks__/fs'));

// Mock fs/promises module
vi.mock('fs/promises', () => import('../../../__mocks__/fs'));

// Mock fs-extra module to use our fs mock
vi.mock('fs-extra', () => import('../../../__mocks__/fs'));

describe('EmbedDirectiveHandler', () => {
  let context: TestContext;
  let embedDirectiveHandler: EmbedDirectiveHandler;

  beforeEach(async () => {
    // Reset path mock between tests
    const mock = vi.mocked(pathModule);
    pathTestUtils.resetMocks(mock);

    // Clear fs mocks and add test files
    clearMocks();
    addMockFile('test.txt', 'Test content');
    addMockFile('test.md', '# Test Markdown\nContent');

    context = new TestContext();
    await context.initialize();
    embedDirectiveHandler = new EmbedDirectiveHandler();
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetAllMocks();
  });

  describe('basic file embedding', () => {
    it('should embed file contents', async () => {
      const filePath = '$PROJECTPATH/file.txt';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = context.fs.getPath(pathModule.join('project', 'file.txt'));
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

      const resolvedPath = context.fs.getPath(pathModule.join('project', 'doc.md'));
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

      const resolvedPath = context.fs.getPath(pathModule.join('project', 'doc.md'));
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

      const resolvedPath = context.fs.getPath(pathModule.join('project', 'doc.md'));
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
      await context.writeFile(pathModule.join('project', 'nested', 'dir', 'source.txt'), 'Nested content');
      await context.writeFile(pathModule.join('project', 'nested', 'dir', 'current.meld'), '');
      
      const currentPath = context.fs.getPath(pathModule.join('project', 'nested', 'dir', 'current.meld'));
      context.state.setCurrentFilePath(currentPath);

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '$PROJECTPATH/nested/dir/source.txt'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = context.fs.getPath(pathModule.join('project', 'nested', 'dir', 'source.txt'));
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

  describe('circular reference detection', () => {
    it('should detect and throw error for circular references', async () => {
      const filePath = '$PROJECTPATH/file.txt';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      // First embed should succeed
      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      // Second embed of the same file should throw
      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Circular reference detected');

      // Verify the error message includes the file path
      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow(filePath);
    });

    it('should clear embedded paths when requested', async () => {
      const filePath = '$PROJECTPATH/file.txt';
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      // First embed should succeed
      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      // Clear the embedded paths
      embedDirectiveHandler.clearEmbeddedPaths();

      // Second embed should now succeed
      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).resolves.not.toThrow();
    });
  });
}); 