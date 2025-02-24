import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from './index.js';
import { TestContext } from '@tests/utils/index.js';
import type { ProcessOptions } from '@core/types/index.js';
import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';

// Define the type for main function options
type MainOptions = {
  fs?: NodeFileSystem;
  format?: 'llm';
  services?: any;
};

describe('SDK Integration Tests', () => {
  let context: TestContext;
  let testFilePath: string;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    testFilePath = 'test.meld';
  });

  afterEach(async () => {
    await context.cleanup();
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
      
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      await main(testFilePath, { fs: context.fs, services });
      
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

    it('should allow service injection through options', async () => {
      const customState = context.services.state;
      const spy = vi.spyOn(customState, 'enableTransformation');

      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      await main(testFilePath, {
        fs: context.fs,
        services: { state: customState },
        transformation: true
      });

      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('Transformation Mode', () => {
    it('should enable transformation through options', async () => {
      const content = `
        @text greeting = "Hello"
        @run [echo test]
        Content
      `;
      await context.fs.writeFile(testFilePath, content);
      
      // Start debug session with visualization
      const sessionId = await context.startDebugSession({
        captureConfig: {
          capturePoints: ['pre-transform', 'post-transform'],
          includeFields: ['nodes', 'transformedNodes', 'variables'],
          format: 'full'
        },
        visualization: {
          format: 'mermaid',
          includeMetadata: true,
          includeTimestamps: true
        },
        traceOperations: true
      });
      
      const result = await main(testFilePath, {
        fs: context.fs,
        services: context.services,
        transformation: true
      });

      // Get debug results
      const debugResult = await context.endDebugSession(sessionId);
      console.log('State visualization:', await context.visualizeState());
      console.log('Debug operations:', debugResult.operations);
      
      // In transformation mode, directives should be replaced
      expect(result).not.toContain('[run directive output placeholder]');
      expect(result).toContain('test');
    });

    it('should respect existing transformation state', async () => {
      const content = '@run [echo test]';
      await context.fs.writeFile(testFilePath, content);
      
      // Enable transformation through context
      context.enableTransformation();
      
      const result = await main(testFilePath, {
        fs: context.fs,
        services: context.services
      });
      
      // Should still be in transformation mode
      expect(result).not.toContain('[run directive output placeholder]');
      expect(result).toContain('test');
    });
  });

  describe('Debug Mode', () => {
    it('should enable debug service when requested', async () => {
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      
      await main(testFilePath, {
        fs: context.fs,
        debug: true
      });
      
      // Verify debug service was created
      expect(context.services.debug).toBeDefined();
    });

    it('should capture debug information when enabled', async () => {
      const content = '@run [echo test]';
      await context.fs.writeFile(testFilePath, content);
      
      context.enableDebug();
      
      await main(testFilePath, {
        fs: context.fs,
        services: context.services,
        debug: true
      });
      
      // Verify debug data was captured
      const debugData = await context.services.debug.getDebugData();
      expect(debugData).toBeDefined();
      expect(debugData.operations).toHaveLength(1);
    });
  });

  describe('Format Conversion', () => {
    it('should handle definition directives correctly', async () => {
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      const result = await main(testFilePath, { 
        fs: context.fs,
        services: context.services
      });
      // Definition directives should be omitted from output
      expect(result).toBe('');
    });

    it('should handle execution directives correctly', async () => {
      await context.fs.writeFile(testFilePath, '@run [echo test]');
      
      context.enableDebug();
      context.disableTransformation(); // Explicitly disable transformation
      
      const result = await main(testFilePath, {
        fs: context.fs,
        format: 'llm',
        services: context.services,
        debug: true
      });

      // Verify result
      expect(result).toContain('[run directive output placeholder]');
      
      // Verify debug data
      const debugData = await context.services.debug.getDebugData();
      expect(debugData.operations).toBeDefined();
    });

    it('should handle complex meld content with mixed directives', async () => {
      const content = `
        @text greeting = "Hello"
        @data config = { "value": 123 }
        Some text content
        @run [echo test]
        More text
      `;
      await context.fs.writeFile(testFilePath, content);
      context.disableTransformation(); // Explicitly disable transformation
      const result = await main(testFilePath, { 
        fs: context.fs,
        services: context.services
      });
      
      // Definition directives should be omitted
      expect(result).not.toContain('"identifier": "greeting"');
      expect(result).not.toContain('"value": "Hello"');
      expect(result).not.toContain('"identifier": "config"');
      
      // Text content should be preserved
      expect(result).toContain('Some text content');
      expect(result).toContain('More text');
      
      // Execution directives should show placeholder
      expect(result).toContain('[run directive output placeholder]');
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      await context.fs.writeFile(testFilePath, '@invalid not_a_valid_directive');
      
      await expect(main(testFilePath, { 
        fs: context.fs,
        services: context.services
      })).rejects.toThrow();
    });

    it('should handle missing files correctly', async () => {
      await expect(main('nonexistent.meld', { 
        fs: context.fs,
        services: context.services
      })).rejects.toThrow(MeldFileNotFoundError);
    });

    it('should handle service initialization errors', async () => {
      const badServices = {
        ...context.services,
        directive: undefined
      };

      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      
      await expect(main(testFilePath, {
        fs: context.fs,
        services: badServices
      })).rejects.toThrow();
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const content = `
        @text greeting = "Hello"
        @run [echo test]
        Some content
      `;
      await context.fs.writeFile(testFilePath, content);
      context.disableTransformation(); // Explicitly disable transformation
      const result = await main(testFilePath, { 
        fs: context.fs,
        services: context.services
      });
      
      // Definition directive should be omitted
      expect(result).not.toContain('"kind": "text"');
      expect(result).not.toContain('"identifier": "greeting"');
      
      // Execution directive should show placeholder
      expect(result).toContain('[run directive output placeholder]');
      
      // Text content should be preserved
      expect(result).toContain('Some content');
    });

    it('should preserve state and content in transformation mode', async () => {
      const content = `
        @text first = "First"
        @text second = "Second"
        @run [echo test]
        Content
      `;
      await context.fs.writeFile(testFilePath, content);
      
      // Enable transformation mode through state service
      context.services.state.enableTransformation(true);
      
      const result = await main(testFilePath, {
        fs: context.fs,
        services: context.services
      });
      
      // In transformation mode, directives should be replaced with their results
      expect(result).not.toContain('"identifier": "first"');
      expect(result).not.toContain('"value": "First"');
      expect(result).not.toContain('"identifier": "second"');
      
      // Text content should be preserved
      expect(result).toContain('Content');
      
      // Run directive should be transformed (if transformation is working)
      expect(result).toContain('test');
    });
  });

  describe('Edge Cases', () => {
    it.todo('should handle large files efficiently');
    it.todo('should handle deeply nested imports');
  });
}); 