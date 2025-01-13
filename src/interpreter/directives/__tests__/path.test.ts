import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pathDirectiveHandler } from '../path';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'path';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';

describe('PathDirectiveHandler', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    context.state.setCurrentFilePath('/project/root/test.meld');

    vi.mock('path', () => ({
      resolve: vi.fn((...args) => args.join('/')),
      join: vi.fn((...args) => args.join('/')),
      dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
      normalize: vi.fn((p) => p)
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic path handling', () => {
    it('should handle absolute paths', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        value: '/absolute/path'
      }, location);

      pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      expect(context.state.getPathVar('test')).toBe('/absolute/path');
    });

    it('should handle relative paths', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        value: './relative/path'
      }, location);

      pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = '/project/root/relative/path';
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });

    it('should handle parent directory paths', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        value: '../parent/path'
      }, location);

      pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = '/project/parent/path';
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });
  });

  describe('error handling', () => {
    it('should throw error for missing name', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('path', {
        value: '/some/path'
      }, location);

      expect(() => 
        pathDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).toThrow(MeldError);
    });

    it('should throw error for missing value', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('path', {
        name: 'test'
      }, location);

      expect(() => 
        pathDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).toThrow(MeldError);
    });

    it('should preserve error locations in right-side mode', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const pathLocation = nestedContext.createLocation(2, 4);

      const node = nestedContext.createDirectiveNode('path', {
        name: 'test'
      }, pathLocation);

      try {
        pathDirectiveHandler.handle(node, nestedContext.state, nestedContext.createHandlerContext());
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        if (error instanceof MeldError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(6); // base.line (5) + relative.line (2) - 1
          expect(error.location?.column).toBe(4);
        }
      }
    });
  });

  describe('path resolution', () => {
    it('should resolve paths relative to current file', () => {
      context.state.setCurrentFilePath('/other/location/file.meld');

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('path', {
        name: 'test',
        value: './relative/path'
      }, location);

      pathDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const expectedPath = '/other/location/relative/path';
      expect(context.state.getPathVar('test')).toBe(expectedPath);
    });

    it('should handle path variables in values', () => {
      const location1 = context.createLocation(1, 1);
      const location2 = context.createLocation(2, 1);

      const node1 = context.createDirectiveNode('path', {
        name: 'base',
        value: '/base/path'
      }, location1);

      const node2 = context.createDirectiveNode('path', {
        name: 'test',
        value: '{base}/subdir'
      }, location2);

      pathDirectiveHandler.handle(node1, context.state, context.createHandlerContext());
      pathDirectiveHandler.handle(node2, context.state, context.createHandlerContext());

      expect(context.state.getPathVar('test')).toBe('/base/path/subdir');
    });
  });
}); 