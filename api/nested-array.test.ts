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
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { ILogger } from '@core/utils/logger.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import logger from '@core/utils/logger.js';

describe('Nested Array Access Tests', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();
    testContainer = container.createChildContainer();

    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    testContainer.registerInstance('MainLogger', logger);
    testContainer.register('ILogger', { useToken: 'MainLogger' });

    testContainer.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory });
    testContainer.register('IResolutionService', { useClass: ResolutionService });
    testContainer.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
    testContainer.register('IPathService', { useClass: PathService });
    
    testContainer.registerSingleton('IStateService', StateService);
    
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