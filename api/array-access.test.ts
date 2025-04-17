import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processMeld, ProcessOptions } from '@api/index.js';
import { container, DependencyContainer } from 'tsyringe';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
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
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { ILogger } from '@core/utils/logger.js';

describe('Array Access Tests', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();
    testContainer = container.createChildContainer();

    // Mocks
    const mockDirectiveClient: IDirectiveServiceClient = { \n      supportsDirective: vi.fn().mockReturnValue(true), \n      handleDirective: vi.fn().mockImplementation(async () => { \n        return testContainer.resolve<IStateService>('IStateService');\n      }),\n      getSupportedDirectives: vi.fn().mockReturnValue([]), \n      validateDirective: vi.fn().mockReturnValue(undefined) \n    };\n    vi.spyOn(mockDirectiveClient, 'supportsDirective'); \n    vi.spyOn(mockDirectiveClient, 'handleDirective');\n    \n    const mockDirectiveClientFactory = { \n      createClient: vi.fn().mockReturnValue(mockDirectiveClient), \n      directiveService: undefined \n    } as unknown as DirectiveServiceClientFactory; \n    vi.spyOn(mockDirectiveClientFactory, 'createClient');\n
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
  });

  afterEach(async () => {
    testContainer?.clearInstances();
    await context?.cleanup();
  });

  it('should handle direct array access with dot notation', async () => {
    const content = 
`@data items = ["apple", "banana", "cherry"]

First item: {{items.0}}
Second item: {{items.1}}
Third item: {{items.2}}`;
    
    const options: Partial<ProcessOptions> = {
      format: 'markdown',
      container: testContainer
    };

    const result = await processMeld(content, options);

    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('First item: apple\nSecond item: banana\nThird item: cherry');
  });
}); 