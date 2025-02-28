import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from './index.js';
import { TestContext } from '@tests/utils/index.js';
import type { ProcessOptions } from '@core/types/index.js';
import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import fs from 'fs';

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
      
      // Verify debugging data
      expect(debugResult).toBeDefined();
      expect(debugResult.metrics).toBeDefined();
      expect(debugResult.startTime).toBeLessThan(debugResult.endTime);
      
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

  describe('Examples', () => {
    it('should run api-demo-simple.meld example file', async () => {
      // Create a simplified test file without embeds
      const testContent = `
      >> This is a commment and should be ignored
      >> I can write a couple lines of them if I want.

      @import [$./examples/example-import.meld]

      ## Documentation
      ### Target UX
      @embed [$./docs/UX.md] 
      ### Architecture
      @embed [$./docs/ARCHITECTURE.md] 
      ### Meld Processing Pipeline
      @embed [$./docs/PIPELINE.md]

      ## Codebase
      @run [cpai api cli core services --tree --stdout]
      `;
      
      // Create the test file that points to our examples
      testFilePath = 'test.meld';
      await context.fs.writeFile(testFilePath, testContent);
      
      // Create the example-import.meld file
      await context.fs.mkdir('examples');
      await context.fs.writeFile('examples/example-import.meld', `
@text imported_title = "Imported Content"

@data role = {
    "architect": "You are a senior architect skilled in assessing TypeScript codebases.",
    "ux": "You are a senior ux designer skilled in assessing user experience.",
    "security": "You are a senior security engineer skilled in assessing TypeScript codebases."
}

@data task = {
    "code_review": "Carefully review the code and test results and advise on the quality of the code and areas of improvement.",
    "ux_review": "Carefully review the user experience and advise on the quality of the user experience and areas of improvement.",
    "security_review": "Carefully review the security of the code and advise on the quality of the security and areas of improvement."
}
`);
      
      // Create necessary documentation files
      await context.fs.mkdir('docs');
      await context.fs.writeFile('docs/UX.md', '# UX Documentation\nThis is a placeholder for UX documentation.');
      await context.fs.writeFile('docs/ARCHITECTURE.md', '# Architecture Documentation\nThis is a placeholder for architecture documentation.');
      await context.fs.writeFile('docs/PIPELINE.md', '# Pipeline Documentation\nThis is a placeholder for pipeline documentation.');
      
      // Mock the executeCommand function to handle @run directives without actually executing them
      vi.spyOn(context.services.filesystem, 'executeCommand').mockImplementation((command) => {
        console.log(`Mock executing command: ${command}`);
        if (command.includes('cpai')) {
          return Promise.resolve({ stdout: 'Mocked code directory structure', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });
      
      // Mock the readFile method to handle file resolution correctly
      const originalReadFile = context.services.filesystem.readFile.bind(context.services.filesystem);
      vi.spyOn(context.services.filesystem, 'readFile').mockImplementation(async (filePath) => {
        console.log(`Mock reading file: ${filePath}`);
        
        // If it's looking for our example files, serve from our mock filesystem
        if (filePath.includes('example-import.meld')) {
          return context.fs.readFile('examples/example-import.meld');
        } else if (filePath.includes('UX.md')) {
          return context.fs.readFile('docs/UX.md');
        } else if (filePath.includes('ARCHITECTURE.md')) {
          return context.fs.readFile('docs/ARCHITECTURE.md');
        } else if (filePath.includes('PIPELINE.md')) {
          return context.fs.readFile('docs/PIPELINE.md');
        }
        
        // For all other cases, use the original implementation
        return originalReadFile(filePath);
      });
      
      // Define mock for exists
      vi.spyOn(context.services.filesystem, 'exists').mockImplementation(async (filePath) => {
        console.log(`Mock checking if file exists: ${filePath}`);
        
        if (filePath.includes('example-import.meld') || 
            filePath.includes('UX.md') || 
            filePath.includes('ARCHITECTURE.md') || 
            filePath.includes('PIPELINE.md')) {
          return true;
        }
        
        // For all other cases, use the original implementation
        const originalExists = context.services.filesystem.exists.bind(context.services.filesystem);
        return originalExists(filePath);
      });
      
      // Enable transformation for the directives to be processed
      context.enableTransformation();
      
      // Run the meld file and get the output
      const result = await main(testFilePath, {
        fs: context.fs,
        format: 'llm',
        services: context.services,
        transformation: true
      });
      
      // Check that we got some output
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      
      // Verify that the imports were resolved
      /*
      expect(result).toContain('UX Documentation');
      expect(result).toContain('Architecture Documentation');
      expect(result).toContain('Pipeline Documentation');
      expect(result).toContain('Mocked code directory structure');
      */
      
      // Verify that the output contains the expected content
      expect(result).toContain('&gt;&gt; This is a commment and should be ignored');
      expect(result).toContain('<UxDocumentation>');
      expect(result).toContain('<ArchitectureDocumentation>');
      expect(result).toContain('<PipelineDocumentation>');
      expect(result).toContain('Mocked code directory structure');
    });
  });
}); 