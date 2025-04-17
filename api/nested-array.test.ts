import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { processMeld } from '@api/index.js';
import type { Services, ProcessOptions } from '@core/types/index.js';
import { unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { container, type DependencyContainer } from 'tsyringe';
import { mock } from 'vitest-mock-extended';
import { URL } from 'node:url';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import type { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { ILogger } from '@core/utils/logger.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';

describe('Nested Array Access Tests', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();
    testContainer = container.createChildContainer();

    const mockDirectiveClient = { supportsDirective: vi.fn().mockReturnValue(true), handleDirective: vi.fn(async () => testContainer.resolve<IStateService>('IStateService')), getSupportedDirectives: vi.fn().mockReturnValue([]), validateDirective: vi.fn().mockReturnValue(undefined) } as IDirectiveServiceClient;
    vi.spyOn(mockDirectiveClient, 'supportsDirective'); vi.spyOn(mockDirectiveClient, 'handleDirective');
    const mockDirectiveClientFactory = { createClient: vi.fn().mockReturnValue(mockDirectiveClient), directiveService: undefined } as unknown as DirectiveServiceClientFactory;
    vi.spyOn(mockDirectiveClientFactory, 'createClient');
    const mockResolutionService = mock<IResolutionService>();
    const mockParserClientFactory = mock<ParserServiceClientFactory>();
    const mockPathService = mock<IPathService>();
    const mockLogger = mock<ILogger>();
    const mockURLContentResolver = { isURL: vi.fn().mockImplementation((path: string) => { try { new URL(path); return true; } catch { return false; } }), validateURL: vi.fn().mockImplementation(async (url: string) => url), fetchURL: vi.fn().mockImplementation(async (url: string) => ({ content: `Mock content for ${url}`})) };

    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', mockURLContentResolver);
    testContainer.registerInstance<ILogger>('DirectiveLogger', mockLogger);
    testContainer.registerInstance(DirectiveServiceClientFactory, mockDirectiveClientFactory);
    testContainer.registerInstance('IResolutionService', mockResolutionService);
    testContainer.registerInstance('ParserServiceClientFactory', mockParserClientFactory);
    testContainer.registerInstance('IPathService', mockPathService);
    testContainer.register('IStateService', { useClass: StateService });
    testContainer.register('IParserService', { useClass: ParserService });
    testContainer.register('IInterpreterService', { useClass: InterpreterService });
    testContainer.register('IOutputService', { useClass: OutputService });
  });

  afterEach(async () => {
    testContainer?.clearInstances();
    await context?.cleanup();
  });

  it('should handle nested array access with dot notation', async () => {
    const content = 
`@data nestedArray = [
  ["a", "b", "c"],
  ["d", "e", "f"],
  ["g", "h", "i"]
]

First item of first array: {{nestedArray.0.0}}
Second item of second array: {{nestedArray.1.1}}
Third item of third array: {{nestedArray.2.2}}`;
    
    await context.fs.writeFile('test.meld', content);
    
    const result = await processMeld(content, {
      fs: context.fs as any,
      transformation: true,
      container: testContainer
    });
    
    // Log the content for debugging
    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('First item of first array: a\nSecond item of second array: e\nThird item of third array: i');
  });
}); 