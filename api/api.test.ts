import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processMeld } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { ProcessOptions } from '@core/types/index.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';

// Define the type for main function options
type MainOptions = {
  fs?: IFileSystem;
  format?: 'xml';
  services?: any;
};

describe('SDK Integration Tests', () => {
  let context: TestContextDI;
  let testFilePath: string;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
    testFilePath = 'test.meld';
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Service Management', () => {
    it('should create services in correct initialization order', async () => {
      // Create a new DirectiveService instance to spy on
      const directive = new DirectiveService();
      const initSpy = vi.spyOn(directive, 'initialize');
      
      // Create services object with our spied service
      const services = {
        ...context.services,
        directive
      };
      
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      await processMeld(testFilePath, { fs: context.services.filesystem as unknown as NodeFileSystem, services: services as any });
      
      // Verify directive.initialize was called with services in correct order
      expect(initSpy).toHaveBeenCalledWith(
        expect.any(Object), // validation
        expect.any(Object), // state
        expect.any(Object), // path
        expect.any(Object), // filesystem
        expect.any(Object), // parser
        expect.any(Object), // interpreter
        expect.any(Object), // circularity
        expect.any(Object)  // resolution
      );
    });

    // TODO(transformation-removal): Add tests for new default behavior
    // - Test directive processing without transformation mode
    // - Verify directive output in default state
    // - Test state management with new behavior
    it('should process content with default behavior', async () => {
      const content = '@text greeting = "Hello"';
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      const result = await processMeld(testFilePath, { 
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any
      });
      expect(result).toBe(content);
    });

    it('should allow service injection through options', async () => {
      const customState = context.services.state;
      const spy = vi.spyOn(customState, 'setTransformationEnabled');

      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: { state: customState } as any,
        transformation: true
      });

      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('Transformation Mode', () => {
    // TODO: These tests are deprecated as transformation mode has been removed.
    // They should be refactored to test the new default behavior or removed entirely.
    it.skip('should enable transformation through options', async () => {
      const content = `@text greeting = "Hello"
@run[echo test]`;
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      // Start a debug session to capture metrics
      const sessionId = await context.startDebugSession();
      
      const result = await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any,
        transformation: true
      });

      // Get debug results
      const debugResult = await context.endDebugSession(sessionId);
      
      // Verify debugging data
      expect(debugResult).toBeDefined();
      expect(debugResult.metrics).toBeDefined();
      expect(debugResult.startTime).toBeLessThan(debugResult.endTime);
      
      // In transformation mode, directives should be replaced
      expect(result).not.toContain('[run directive output placeholder]');
      expect(result).toContain('test');
    });

    it.skip('should respect existing transformation state', async () => {
      const content = '@run [echo test]';
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any
      });
      
      // Should still be in transformation mode
      expect(result).not.toContain('[run directive output placeholder]');
      expect(result).toContain('test');
    });

    it('should process content with custom state', async () => {
      const customState = new StateService();
      const content = '@text greeting = "Hello"';
      const options = {
        state: customState
        // Remove transformation: true
      };
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      const result = await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: options
      });
      expect(result).toBe(content);
    });
  });

  describe('Debug Mode', () => {
    it('should enable debug mode through options', async () => {
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      
      await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any,
        debug: true
      });
      
      // Verify debug data was captured
      const debugData = await (context.services.debug as any).getDebugData();
      expect(debugData).toBeDefined();
      expect(debugData.operations).toHaveLength(1);
    });
  });

  describe('Format Conversion', () => {
    it('should handle definition directives correctly', async () => {
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      const result = await processMeld(testFilePath, { 
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any
      });
      // Definition directives should be omitted from output
      expect(result).toBe('');
    });

    it('should handle execution directives correctly', async () => {
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@run [echo test]');
      
      context.enableDebug();
      // Transformation is always enabled now, we can't disable it
      
      const result = await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        format: 'xml',
        services: context.services as any, // Cast to any to avoid type errors
        debug: true
      });

      // Verify result - transformation is always enabled, so we should get the output
      expect(result).toContain('test');
      expect(result).not.toContain('[run directive output placeholder]');
    });

    it('should handle complex meld content with mixed directives', async () => {
      const content = `
@text greeting = "Hello"
@data config = { "value": 123 }
Some text content
@run [echo test]
More text`;
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      // Transformation is always enabled now, we can't disable it
      const result = await processMeld(testFilePath, { 
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any
      });
      
      // Definition directives should be omitted
      expect(result).not.toContain('"identifier": "greeting"');
      expect(result).not.toContain('"value": "Hello"');
      expect(result).not.toContain('"identifier": "config"');
      
      // Text content should be preserved
      expect(result).toContain('Some text content');
      expect(result).toContain('More text');
      
      // Execution directives should be transformed (not showing placeholders)
      expect(result).toContain('test');
      expect(result).not.toContain('[run directive output placeholder]');
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      const invalidContent = '@invalid directive';
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), invalidContent);
      
      await expect(processMeld(testFilePath, { 
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any
      })).rejects.toThrow();
    });

    it('should handle missing files correctly', async () => {
      const nonExistentFile = 'non-existent.meld';
      
      await expect(processMeld(nonExistentFile, { 
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any
      })).rejects.toThrow(MeldFileNotFoundError);
    });

    it('should handle service initialization errors', async () => {
      // Create a service that will throw during initialization
      const brokenServices = {
        ...context.services,
        directive: undefined
      };
      
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      
      await expect(processMeld(testFilePath, { 
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: brokenServices as any
      })).rejects.toThrow();
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const content = `
@text greeting = "Hello"
@run [echo {{greeting}}]`;
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any,
        transformation: true
      });
      
      // In transformation mode, directives should be replaced with their results
      expect(result).toContain('Hello');
      expect(result).not.toContain('@text');
      expect(result).not.toContain('@run');
    });

    it('should preserve state and content in transformation mode', async () => {
      const content = `
@text greeting = "Hello"
@text name = "World"
@run [echo {{greeting}}, {{name}}!]`;
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any,
        transformation: true
      });
      
      // Resolved variables should be outputted
      expect(result).toContain('Hello, World!');
    });
  });

  describe('Edge Cases', () => {
    it.todo('should handle large files efficiently');
    it.todo('should handle deeply nested imports');
  });

  describe('Examples', () => {
    it('should run api-demo-simple.meld example file', async () => {
      // Create a simplified test file
      const content = `
# Simple Example

## Title

@run [echo "This is a simple example"]`;
      await context.services.filesystem.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.services.filesystem as unknown as NodeFileSystem,
        services: context.services as any,
        transformation: true
      });
      
      // Verify the output contains the transformed content - now in XML format
      expect(result).toContain('<SimpleExample>');
      expect(result).toContain('<Title>');
      expect(result).toContain('This is a simple example');
    });
  });
}); 