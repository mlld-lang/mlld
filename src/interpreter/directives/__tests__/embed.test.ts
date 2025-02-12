import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbedDirectiveHandler } from '../embed';
import * as pathModule from 'path';
import { TestContext } from '../../__tests__/test-utils';
import { pathTestUtils } from '../../../../tests/__mocks__/path';
import { MeldEmbedError } from '../../errors/errors';
import { pathService } from '../../../services/path-service';

// Mock path module first
vi.mock('path', async () => {
  const { createPathMock } = await import('../../../../tests/__mocks__/path');
  return createPathMock({
    testRoot: '/Users/adam/dev/meld/test/_tmp',
    testHome: '/Users/adam/dev/meld/test/_tmp/home',
    testProject: '/Users/adam/dev/meld/test/_tmp/project'
  });
});

// Mock fs modules
vi.mock('fs', () => import('../../../__mocks__/fs'));
vi.mock('fs/promises', () => import('../../../__mocks__/fs-promises'));
vi.mock('fs-extra', () => import('../../../__mocks__/fs-extra'));

describe('EmbedDirectiveHandler', () => {
  let context: TestContext;
  let embedDirectiveHandler: EmbedDirectiveHandler;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    embedDirectiveHandler = new EmbedDirectiveHandler();

    // Set up test files with proper path prefixes
    await context.writeFile('$PROJECTPATH/test.txt', 'Test content');
    await context.writeFile('$PROJECTPATH/test.md', '# Test Markdown\nContent');
    await context.writeFile('$PROJECTPATH/file.txt', 'Test content');
    await context.writeFile('$PROJECTPATH/doc.md', `# Test Doc
## Section 1
Content 1

## Section 2
Content 2

### Subsection 2.1
Nested content`);
    await context.writeFile('$PROJECTPATH/nested/dir/source.txt', 'Nested content');
    await context.writeFile('$HOMEPATH/user/data.txt', 'Home content');

    // Set current file path
    context.state.setCurrentFilePath(await pathService.resolvePath('$PROJECTPATH/mock.meld'));
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

      const resolvedPath = await pathService.resolvePath('$PROJECTPATH/file.txt');
      expect(context.state.getTextVar(`embed:${resolvedPath}`)).toBe('Test content');
    });

    it('should throw error for missing source', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {}, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrowError(new MeldEmbedError('Embed source is required'));
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

      const resolvedPath = await pathService.resolvePath('$PROJECTPATH/doc.md');
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

      const resolvedPath = await pathService.resolvePath('$PROJECTPATH/doc.md');
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

      const resolvedPath = await pathService.resolvePath('$PROJECTPATH/doc.md');
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
      await context.writeFile('$PROJECTPATH/invalid.md', '## Incomplete code block\n```typescript\nconst x = {');
      
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
      await context.writeFile('$PROJECTPATH/nested/dir/source.txt', 'Nested content');
      await context.writeFile('$PROJECTPATH/nested/dir/current.meld', '');
      
      const currentPath = await pathService.resolvePath('$PROJECTPATH/nested/dir/current.meld');
      context.state.setCurrentFilePath(currentPath);

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '$PROJECTPATH/nested/dir/source.txt'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = await pathService.resolvePath('$PROJECTPATH/nested/dir/source.txt');
      expect(context.state.getTextVar(`embed:${resolvedPath}`)).toBe('Nested content');
    });

    it('should handle home directory paths', async () => {
      await context.writeFile('$HOMEPATH/user/data.txt', 'Home content');
      
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '$HOMEPATH/user/data.txt'
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = await pathService.resolvePath('$HOMEPATH/user/data.txt');
      expect(context.state.getTextVar(`embed:${resolvedPath}`)).toBe('Home content');
    });

    it('should handle path aliases', async () => {
      await context.writeFile('$PROJECTPATH/alias-test.txt', 'Alias content');
      
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '$./alias-test.txt'  // Using $. alias
      }, location);

      await embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const resolvedPath = await pathService.resolvePath('$PROJECTPATH/alias-test.txt');
      expect(context.state.getTextVar(`embed:${resolvedPath}`)).toBe('Alias content');
    });

    it('should reject raw paths', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '/absolute/path/file.txt'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.');
    });

    it('should reject path traversal attempts', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: '$PROJECTPATH/../outside.txt'
      }, location);

      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Relative navigation (..) is not allowed in paths');
    });
  });

  describe('circular reference detection', () => {
    it('should detect circular references in .meld files', async () => {
      const testMeldPath = 'test.meld';
      const content = '<!-- @embed source="test.meld" -->';
      
      // Write the test file using the test filesystem
      await context.writeFile(testMeldPath, content);
      
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        source: testMeldPath
      }, location);

      // First embed should parse but fail on nested embed
      await expect(
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Circular reference detected');
    });
  });

  describe('location handling', () => {
    it('should adjust locations in right-side mode', async () => {
      const filePath = '$PROJECTPATH/file.txt';
      const baseLocation = context.createLocation(5, 3);
      const location = context.createLocation(2, 4);
      const node = context.createDirectiveNode('embed', {
        source: filePath
      }, location);

      await embedDirectiveHandler.handle(
        node,
        context.state,
        context.createHandlerContext({
          mode: 'rightside',
          baseLocation
        })
      );

      const resolvedPath = await pathService.resolvePath('$PROJECTPATH/file.txt');
      const nodes = context.state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].location?.start.line).toBe(6); // base.line (5) + relative.line (2) - 1
      expect(nodes[0].location?.start.column).toBe(4);
    });
  });
}); 