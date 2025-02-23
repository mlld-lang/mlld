import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from './index.js';
import { TestContext } from '@tests/utils/index.js';
import type { ProcessOptions } from '@core/types/index.js';
import type { NodeFileSystem } from '@services/FileSystemService/NodeFileSystem.js';

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
      // Start debug session
      const debugSessionId = await context.startDebugSession({
        captureConfig: {
          capturePoints: ['pre-transform', 'post-transform', 'error'],
          includeFields: ['nodes', 'transformedNodes', 'variables'],
          format: 'full'
        }
      });

      try {
        await context.fs.writeFile(testFilePath, '@run [echo test]');
        
        // Get initial state snapshot for state ID
        const snapshot = await context.services.debugger.getStateSnapshot(
          context.services.state.getCurrentFilePath() || 'unknown',
          'full'
        );
        
        // Trace the operation
        const { result, diagnostics } = await context.services.debugger.traceOperation(
          snapshot.metadata.stateId,
          async () => {
            // Use type assertion to bypass type checking
            return await main(testFilePath, {
              fs: context.fs,
              format: 'llm',
              services: context.services
            } as any);
          }
        );

        expect(result).toContain('[run directive output placeholder]');

        // Get debug report
        const report = await context.services.debugger.generateDebugReport(debugSessionId);
        console.log('State Debug Report:', report);
      } finally {
        context.services.debugger.clearSession(debugSessionId);
      }
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

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const content = `
        @text greeting = "Hello"
        @run [echo test]
        Some content
      `;
      await context.fs.writeFile(testFilePath, content);
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

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      await context.fs.writeFile(testFilePath, '@invalid not_a_valid_directive');
      await expect(main(testFilePath, { 
        fs: context.fs,
        services: context.services
      }))
        .rejects
        .toThrow(/Parse error/);
    });

    // TODO: This test will be updated as part of the error handling overhaul
    // See dev/ERRORS.md - will be reclassified as a fatal error with improved messaging
    it.todo('should handle missing files correctly');

    it('should handle empty files', async () => {
      await context.fs.writeFile(testFilePath, '');
      const result = await main(testFilePath, { 
        fs: context.fs,
        services: context.services
      });
      expect(result).toBe(''); // Empty input should produce empty output
    });
  });

  describe('Edge Cases', () => {
    it.todo('should handle large files efficiently');
    it.todo('should handle deeply nested imports');
  });
}); 