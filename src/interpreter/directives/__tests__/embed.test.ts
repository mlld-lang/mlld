import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { embedDirectiveHandler } from '../embed';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'path';
import * as fs from 'fs';
import { DirectiveRegistry } from '../registry';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';

describe('EmbedDirectiveHandler', () => {
  let context: TestContext;
  const mockFiles: Record<string, string> = {};

  beforeEach(() => {
    context = new TestContext();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(embedDirectiveHandler);

    // Mock path module
    vi.mock('path', async () => {
      const actualPath = await vi.importActual<typeof import('path')>('path');
      return {
        ...actualPath,
        resolve: vi.fn((p: string) => p),
        join: vi.fn((...paths: string[]) => paths.join('/')),
        dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
        isAbsolute: vi.fn(),
      };
    });

    // Mock fs module
    vi.mock('fs', async () => {
      const actualFs = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actualFs,
        readFileSync: vi.fn((path: string) => {
          if (path in mockFiles) {
            return mockFiles[path];
          }
          throw new Error(`Mock file not found: ${path}`);
        }),
        existsSync: vi.fn((path: string) => path in mockFiles),
        mkdirSync: vi.fn(),
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    Object.keys(mockFiles).forEach(key => delete mockFiles[key]);
  });

  describe('basic embedding', () => {
    it('should embed file content', () => {
      const filePath = '/test/file.txt';
      mockFiles[filePath] = 'Embedded content';

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        path: filePath
      }, location);

      embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const nodes = context.state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('Embedded content');
    });

    it('should handle missing files', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('embed', {
        path: '/nonexistent/file.txt'
      }, location);

      expect(() => 
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).toThrow(MeldError);
    });
  });

  describe('location handling', () => {
    it('should adjust locations in right-side mode', () => {
      const filePath = '/test/file.txt';
      mockFiles[filePath] = 'Embedded content';

      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const embedLocation = nestedContext.createLocation(2, 4);

      const node = nestedContext.createDirectiveNode('embed', {
        path: filePath
      }, embedLocation);

      embedDirectiveHandler.handle(node, nestedContext.state, nestedContext.createHandlerContext());

      const nodes = nestedContext.state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].location?.start.line).toBe(6); // base.line (5) + relative.line (2) - 1
      expect(nodes[0].location?.start.column).toBe(4);
    });

    it('should preserve error locations', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const embedLocation = nestedContext.createLocation(2, 4);

      const node = nestedContext.createDirectiveNode('embed', {
        path: undefined
      }, embedLocation);

      try {
        embedDirectiveHandler.handle(node, nestedContext.state, nestedContext.createHandlerContext());
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

  describe('nested embedding', () => {
    it('should handle nested embedded content', () => {
      const parentPath = '/test/parent.txt';
      const childPath = '/test/child.txt';
      mockFiles[parentPath] = '@embed path: /test/child.txt';
      mockFiles[childPath] = 'Child content';

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        path: parentPath
      }, location);

      embedDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const nodes = context.state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('Child content');
    });

    it('should prevent circular embedding', () => {
      const filePath = '/test/circular.txt';
      mockFiles[filePath] = '@embed path: /test/circular.txt';

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('embed', {
        path: filePath
      }, location);

      expect(() => 
        embedDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).toThrow(/Circular/);
    });
  });
}); 