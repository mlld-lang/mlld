import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pathDirectiveHandler } from '../path';
import type { DirectiveNode } from 'meld-spec';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';
import path from 'path';
import { MeldPathError } from '../../errors/types';

// Mock path module
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    default: actual,
  };
});

describe('PathDirectiveHandler', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    context.state.setCurrentFilePath(context.fs.getPath('test.meld'));
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('special variable handling', () => {
    it('handles path directive with $HOMEPATH', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'testPath',
        path: '$HOMEPATH/test/file.txt'
      }, location);

      await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('home/test/file.txt');
      expect(context.state.getPathVar('testPath')).toBe(expectedPath);
    });

    it('handles path directive with $PROJECTPATH', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'testPath',
        path: '$PROJECTPATH/test/file.txt'
      }, location);

      await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('project/test/file.txt');
      expect(context.state.getPathVar('testPath')).toBe(expectedPath);
    });

    it('handles path directive with aliases', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'testPath',
        path: '$~/test/file.txt'
      }, location);

      await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('home/test/file.txt');
      expect(context.state.getPathVar('testPath')).toBe(expectedPath);
    });

    it('rejects invalid special variable paths', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'testPath',
        path: '/absolute/path'
      }, location);

      await expect(pathDirectiveHandler.handle(node, context.state, context.createHandlerContext()))
        .rejects.toThrow('Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.');
    });
  });

  describe('error handling', () => {
    it('should throw error for missing name', async () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('path', {
        path: '$HOMEPATH/test.txt'
      }, location);

      await expect(
        pathDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Path name is required');
    });

    it('should throw error for missing value', async () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('path', {
        name: 'test'
      }, location);

      await expect(
        pathDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Path value is required');
    });

    it('should preserve error locations in right-side mode', async () => {
      const location = context.createLocation(2, 4);
      const node = context.createDirectiveNode('path', {
        name: 'test'
      }, location);

      try {
        await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext('rightside'));
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldPathError);
        if (error instanceof MeldPathError) {
          expect(error.location).toBeDefined();
          expect(error.location).toEqual({ line: 2, column: 4 });
        }
      }
    });
  });

  describe('path resolution', () => {
    it('should resolve paths relative to current file', async () => {
      // Create a test file structure
      await context.writeFile('other/location/file.meld', '');
      context.state.setCurrentFilePath(context.fs.getPath('other/location/file.meld'));

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        path: '$PROJECTPATH/relative/path'
      }, location);

      await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('project/relative/path');
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });

    it('should handle path variables in values', async () => {
      const location1 = context.createLocation(1, 1);
      const location2 = context.createLocation(2, 1);

      const node1 = context.createDirectiveNode('path', {
        name: 'base',
        path: '$PROJECTPATH/base/path'
      }, location1);

      const node2 = context.createDirectiveNode('path', {
        name: 'test',
        path: '${base}/subdir'
      }, location2);

      await pathDirectiveHandler.handle(node1, context.state, context.createHandlerContext());
      await pathDirectiveHandler.handle(node2, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('project/base/path/subdir');
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });
  });

  describe('path normalization', () => {
    it('should normalize paths with . and ..', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        path: '$PROJECTPATH/dir/./subdir/../file.txt'
      }, location);

      await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('project/dir/file.txt');
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });

    it('should reject paths trying to escape project root', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        path: '$PROJECTPATH/../../outside.txt'
      }, location);

      await expect(pathDirectiveHandler.handle(node, context.state, context.createHandlerContext()))
        .rejects.toThrow('Relative navigation (..) is not allowed in paths');
    });

    it('should handle multiple variable substitutions', async () => {
      // Set up initial path variables
      const setupLocation = context.createLocation(1, 1);
      const setupNode = context.createDirectiveNode('path', {
        name: 'base',
        path: '$PROJECTPATH/base'
      }, setupLocation);
      await pathDirectiveHandler.handle(setupNode, context.state, context.createHandlerContext());

      // Test multiple substitutions
      const location = context.createLocation(2, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        path: '${base}/${subdir}/file.txt'
      }, location);

      context.state.setPathVar('subdir', 'nested');
      await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('project/base/nested/file.txt');
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });
  });

  describe('directory structure validation', () => {
    it('should handle deep nested directories', async () => {
      // Create a deep directory structure
      await context.writeFile('project/a/b/c/d/file.txt', '');

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        path: '$PROJECTPATH/a/b/c/d/file.txt'
      }, location);

      await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('project/a/b/c/d/file.txt');
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });

    it('should handle paths with special characters', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        path: '$PROJECTPATH/test space/file-name_1.txt'
      }, location);

      await pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = context.fs.getPath('project/test space/file-name_1.txt');
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });
  });
}); 