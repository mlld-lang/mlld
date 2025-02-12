import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImportDirectiveHandler } from '../import';
import { TestContext } from '../../__tests__/test-utils';
import * as pathModule from 'path';

// Mock path module
vi.mock('path', async () => {
  const { createPathMock } = await import('../../../../tests/__mocks__/path');
  return createPathMock();
});

describe('ImportDirectiveHandler', () => {
  let context: TestContext;
  let handler: ImportDirectiveHandler;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    handler = new ImportDirectiveHandler();

    // Set up test files
    await context.writeFile('project/mock.meld', '@text greeting = "Hello"');
    await context.writeFile('project/other.meld', '@data config = { "test": true }');
    await context.writeFile('project/nested/test.meld', '@text nested = "value"');

    // Set current file path
    context.state.setCurrentFilePath(context.fs.getPath('project/mock.meld'));
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should handle import directives', async () => {
    const location = context.createLocation(1, 1);
    const node = context.createDirectiveNode('import', {
      source: '$PROJECTPATH/other.meld'
    }, location);

    await handler.handle(node, context.state, context.createHandlerContext());
    expect(context.state.getDataVar('config')).toEqual({ test: true });
  });

  it('should handle nested imports', async () => {
    const location = context.createLocation(1, 1);
    const node = context.createDirectiveNode('import', {
      source: '$PROJECTPATH/nested/test.meld'
    }, location);

    await handler.handle(node, context.state, context.createHandlerContext());
    expect(context.state.getText('nested')).toBe('value');
  });

  it('should throw on missing source', async () => {
    const location = context.createLocation(1, 1);
    const node = context.createDirectiveNode('import', {}, location);

    await expect(handler.handle(node, context.state, context.createHandlerContext()))
      .rejects.toThrow('Import source is required');
  });

  it('should throw on file not found', async () => {
    const location = context.createLocation(1, 1);
    const node = context.createDirectiveNode('import', {
      source: '$PROJECTPATH/nonexistent.meld'
    }, location);

    await expect(handler.handle(node, context.state, context.createHandlerContext()))
      .rejects.toThrow('ENOENT: no such file or directory');
  });

  it('should handle relative paths', async () => {
    // Create a nested directory structure
    await context.writeFile('project/nested/current.meld', '');
    await context.writeFile('project/nested/local.meld', '@text local = "local value"');
    
    // Set current file to the nested directory
    context.state.setCurrentFilePath(context.fs.getPath('project/nested/current.meld'));

    const location = context.createLocation(1, 1);
    const node = context.createDirectiveNode('import', {
      source: '$PROJECTPATH/nested/local.meld'
    }, location);

    await handler.handle(node, context.state, context.createHandlerContext());
    expect(context.state.getText('local')).toBe('local value');
  });

  it('should handle home directory imports', async () => {
    // Create a file in the home directory
    await context.writeFile('home/user/config.meld', '@text homeConfig = "home value"');

    const location = context.createLocation(1, 1);
    const node = context.createDirectiveNode('import', {
      source: '$HOMEPATH/user/config.meld'
    }, location);

    await handler.handle(node, context.state, context.createHandlerContext());
    expect(context.state.getText('homeConfig')).toBe('home value');
  });

  it('should handle imports with variables', async () => {
    // Set up a path variable
    context.state.setPathVar('configPath', context.fs.getPath('project/other.meld'));

    const location = context.createLocation(1, 1);
    const node = context.createDirectiveNode('import', {
      source: '${configPath}'
    }, location);

    await handler.handle(node, context.state, context.createHandlerContext());
    expect(context.state.getDataVar('config')).toEqual({ test: true });
  });

  it('should preserve error locations', async () => {
    const location = context.createLocation(5, 3);
    const node = context.createDirectiveNode('import', {
      source: '$PROJECTPATH/nonexistent.meld'
    }, location);

    try {
      await handler.handle(node, context.state, context.createHandlerContext());
      expect(true).toBe(false); // This line should not be reached
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.location).toBeDefined();
      expect(error.location.line).toBe(5);
      expect(error.location.column).toBe(3);
    }
  });

  describe('advanced path handling', () => {
    it('should handle path variables in nested imports', async () => {
      // Set up nested import structure
      await context.writeFile('project/config/paths.meld', '@path configDir = "$PROJECTPATH/config"');
      await context.writeFile('project/config/settings.meld', '@text setting = "${configDir}/value"');
      
      // First import paths.meld to set up path variable
      const location1 = context.createLocation(1, 1);
      const node1 = context.createDirectiveNode('import', {
        source: '$PROJECTPATH/config/paths.meld'
      }, location1);
      
      await handler.handle(node1, context.state, context.createHandlerContext());
      
      // Then import settings.meld which uses the path variable
      const location2 = context.createLocation(2, 1);
      const node2 = context.createDirectiveNode('import', {
        source: '$PROJECTPATH/config/settings.meld'
      }, location2);
      
      await handler.handle(node2, context.state, context.createHandlerContext());
      
      expect(context.state.getText('setting')).toBe(context.fs.getPath('project/config/value'));
    });

    it('should detect circular imports', async () => {
      // Create files that import each other
      await context.writeFile('project/a.meld', '@import "$PROJECTPATH/b.meld"');
      await context.writeFile('project/b.meld', '@import "$PROJECTPATH/a.meld"');
      
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('import', {
        source: '$PROJECTPATH/a.meld'
      }, location);

      // First import should succeed
      await handler.handle(node, context.state, context.createHandlerContext());

      // Second import (from b.meld back to a.meld) should fail
      const location2 = context.createLocation(1, 1);
      const node2 = context.createDirectiveNode('import', {
        source: '$PROJECTPATH/a.meld'
      }, location2);
      
      await expect(handler.handle(node2, context.state, context.createHandlerContext()))
        .rejects.toThrow('Circular import detected');
    });

    it('should validate import paths', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('import', {
        source: '../outside/file.meld'
      }, location);
      
      await expect(handler.handle(node, context.state, context.createHandlerContext()))
        .rejects.toThrow('Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.');
    });
  });
}); 