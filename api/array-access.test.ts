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
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import { StateServiceClientFactory } from '@services/state/StateService/factories/StateServiceClientFactory.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { ILogger } from '@core/utils/logger.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';

// Import the default logger instance
import logger from '@core/utils/logger.js';

describe('Array Access Tests', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    // await context.initialize(); // Commented out: Avoid double registration/init
    testContainer = container.createChildContainer();

    // Register instances
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    testContainer.registerInstance('DependencyContainer', testContainer); 
    testContainer.registerInstance('MainLogger', logger);
    testContainer.register('ILogger', { useToken: 'MainLogger' });

    // Register concrete classes (Transient)
    // Core Services needed by processMeld or Interpreter chain
    testContainer.register(StateEventService, StateEventService);
    testContainer.register(StateFactory, StateFactory);
    testContainer.registerSingleton(StateService, StateService);
    testContainer.registerSingleton('IStateService', { useToken: StateService });
    testContainer.register(PathOperationsService, PathOperationsService);
    testContainer.register(FileSystemService, FileSystemService);
    testContainer.register(PathService, PathService);
    testContainer.register(ParserService, ParserService);
    testContainer.register(ResolutionService, ResolutionService);
    testContainer.register(ValidationService, ValidationService);
    testContainer.register(CircularityService, CircularityService);
    testContainer.register(DirectiveService, DirectiveService);
    testContainer.register(InterpreterService, InterpreterService);
    testContainer.register(OutputService, OutputService);

    // Factories (Transient)
    testContainer.register(StateServiceClientFactory, StateServiceClientFactory);
    testContainer.register(FileSystemServiceClientFactory, FileSystemServiceClientFactory);
    testContainer.register(PathServiceClientFactory, PathServiceClientFactory);
    testContainer.register(ResolutionServiceClientFactory, ResolutionServiceClientFactory);
    testContainer.register(ParserServiceClientFactory, ParserServiceClientFactory);
    testContainer.register(InterpreterServiceClientFactory, InterpreterServiceClientFactory); 
    testContainer.register(DirectiveServiceClientFactory, DirectiveServiceClientFactory);

    testContainer.registerInstance<IStateService | null>('ParentStateServiceForChild', null); // Fix DI error
  });

  afterEach(async () => {
    testContainer?.dispose();
    // await context?.cleanup(); // Keep context cleanup commented out
  });

  it('should handle direct array access with dot notation', async () => {
    const content = 
`@data items = ["apple", "banana", "cherry"]

First item: {{items.0}}
Second item: {{items.1}}
Third item: {{items.2}}`;
    
    const options: Partial<ProcessOptions> = {
      format: 'markdown',
      container: testContainer // Pass the minimally configured container
    };

    const result = await processMeld(content, options);

    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('First item: apple\nSecond item: banana\nThird item: cherry');
  });
}); 