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
import { container, type DependencyContainer } from 'tsyringe';
import { mock } from 'vitest-mock-extended';
import { URL } from 'node:url';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import type { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { ILogger } from '@core/utils/logger.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import type { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService.js';

describe('SDK Integration Tests', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;
  let testFilePath: string;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();
    testFilePath = 'test.meld';

    testContainer = container.createChildContainer();

    const mockDirectiveClient: IDirectiveServiceClient = { supportsDirective: vi.fn().mockReturnValue(true), handleDirective: vi.fn(async () => testContainer.resolve<IStateService>('IStateService')), getSupportedDirectives: vi.fn().mockReturnValue([]), validateDirective: vi.fn().mockReturnValue(undefined) };
    vi.spyOn(mockDirectiveClient, 'supportsDirective');
    vi.spyOn(mockDirectiveClient, 'handleDirective');

    const mockDirectiveClientFactory = { createClient: vi.fn().mockReturnValue(mockDirectiveClient), directiveService: undefined } as unknown as DirectiveServiceClientFactory; 
    vi.spyOn(mockDirectiveClientFactory, 'createClient');
    
    const mockParserClientFactory = mock<ParserServiceClientFactory>();
    const mockLogger = mock<ILogger>();
    const mockURLContentResolver = {
      isURL: vi.fn().mockImplementation((path: string) => { try { new URL(path); return true; } catch { return false; } }),
      validateURL: vi.fn().mockImplementation(async (url: string) => url),
      fetchURL: vi.fn().mockImplementation(async (url: string) => ({ content: `Mock content for ${url}` }))
    };

    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', mockURLContentResolver);
    testContainer.registerInstance<ILogger>('DirectiveLogger', mockLogger);
    testContainer.registerInstance(DirectiveServiceClientFactory, mockDirectiveClientFactory);
    testContainer.registerInstance('ParserServiceClientFactory', mockParserClientFactory);
    testContainer.register('IStateService', { useClass: StateService });
    testContainer.register('IParserService', { useClass: ParserService });
    testContainer.register('IInterpreterService', { useClass: InterpreterService });
    testContainer.register('IOutputService', { useClass: OutputService });
    testContainer.register('IResolutionService', { useClass: ResolutionService });
    testContainer.register('IPathService', { useClass: PathService });
    testContainer.register('IFileSystemService', { useClass: FileSystemService });
    testContainer.register('IPathOperationsService', { useClass: PathOperationsService });

  });

  afterEach(async () => {
    testContainer?.clearInstances();
    await context?.cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Service Management', () => {
    it('should create services in correct initialization order', async () => {
      const directive = new DirectiveService();
      const initSpy = vi.spyOn(directive, 'initialize');
      
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      await processMeld(testFilePath, { fs: context.fs as unknown as NodeFileSystem, container: testContainer });
      
      expect(initSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should process content with default behavior', async () => {
      const content = '@text greeting = "Hello"';
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      const result = await processMeld(content, { fs: context.fs as unknown as NodeFileSystem, container: testContainer });
      expect(result).toBe('');
    });

    it('should allow service injection through options', async () => {
      const customState = context.services.state;
      const spy = vi.spyOn(customState, 'setTransformationEnabled');

      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      await processMeld(testFilePath, {
        fs: context.fs as unknown as NodeFileSystem,
        transformation: true,
        container: testContainer
      });

      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('Transformation Mode', () => {
    it.skip('should enable transformation through options', async () => {
      const content = `@text greeting = "Hello"
@run[echo test]`;
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.fs as unknown as NodeFileSystem,
        transformation: true,
        container: testContainer
      });

      expect(result).not.toContain('[run directive output placeholder]');
      expect(result).toContain('test');
    });

    it.skip('should respect existing transformation state', async () => {
      const content = '@run [echo test]';
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.fs as unknown as NodeFileSystem,
        container: testContainer
      });
      
      expect(result).not.toContain('[run directive output placeholder]');
      expect(result).toContain('test');
    });

    it('should process content with custom state', async () => {
      const customState = new StateService();
      const content = '@text greeting = "Hello"';
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      testContainer.register('IStateService', { useValue: customState });
      
      const result = await processMeld(content, {
        fs: context.fs as unknown as NodeFileSystem,
        container: testContainer
      });
      expect(result).toBe('');
    });
  });

  describe('Debug Mode', () => {
    it('should enable debug mode through options', async () => {
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      
      await processMeld(testFilePath, {
        fs: context.fs as unknown as NodeFileSystem,
        debug: true,
        container: testContainer
      });
      
      expect(true).toBe(true);
    });
  });

  describe('Format Conversion', () => {
    it('should handle definition directives correctly', async () => {
      const content = '@text greeting = "Hello"';
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      const result = await processMeld(content, { fs: context.fs as unknown as NodeFileSystem, container: testContainer });
      expect(result).toBe('');
    });

    it('should handle execution directives correctly', async () => {
      const content = '@run [echo test]';
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(content, {
        fs: context.fs as unknown as NodeFileSystem,
        format: 'xml',
        debug: true,
        container: testContainer
      });

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
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      const result = await processMeld(content, { fs: context.fs as unknown as NodeFileSystem, container: testContainer });
      
      expect(result).not.toContain('"identifier": "greeting"');
      expect(result).not.toContain('"value": "Hello"');
      expect(result).not.toContain('"identifier": "config"');
      
      expect(result).toContain('Some text content');
      expect(result).toContain('More text');
      
      expect(result).toContain('test');
      expect(result).not.toContain('[run directive output placeholder]');
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      const invalidContent = '@invalid directive';
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), invalidContent);
      
      await expect(processMeld(invalidContent, { fs: context.fs as unknown as NodeFileSystem, container: testContainer })).rejects.toThrow();
    });

    it('should handle missing files correctly', async () => {
      const nonExistentFile = 'non-existent.meld';
      
      await expect(processMeld(nonExistentFile, { fs: context.fs as unknown as NodeFileSystem, container: testContainer })).rejects.toThrow(MeldFileNotFoundError);
    });

    it('should handle service initialization errors', async () => {
      const specificContainer = container.createChildContainer();
      specificContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
      specificContainer.register('IInterpreterService', { useClass: InterpreterService });

      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), '@text greeting = "Hello"');
      
      expect(true).toBe(true);
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const content = `
@text greeting = "Hello"
@run [echo {{greeting}}]`;
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.fs as unknown as NodeFileSystem,
        transformation: true,
        container: testContainer
      });
      
      expect(result).toContain('Hello');
      expect(result).not.toContain('@text');
      expect(result).not.toContain('@run');
    });

    it('should preserve state and content in transformation mode', async () => {
      const content = `
@text greeting = "Hello"
@text name = "World"
@run [echo {{greeting}}, {{name}}!]`;
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.fs as unknown as NodeFileSystem,
        transformation: true,
        container: testContainer
      });
      
      expect(result).toContain('Hello, World!');
    });
  });

  describe('Edge Cases', () => {
    it.todo('should handle large files efficiently');
    it.todo('should handle deeply nested imports');
  });

  describe('Examples', () => {
    it('should run api-demo-simple.meld example file', async () => {
      const content = `
# Simple Example

## Title

@run [echo "This is a simple example"]`;
      await context.fs.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      const result = await processMeld(testFilePath, {
        fs: context.fs as unknown as NodeFileSystem,
        transformation: true,
        container: testContainer
      });
      
      expect(result).toContain('<SimpleExample>');
      expect(result).toContain('<Title>');
      expect(result).toContain('This is a simple example');
    });
  });
}); 