import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { processMeld } from '@api/index.js';
import type { Services, ProcessOptions } from '@core/types/index.js';
import logger from '@core/utils/logger.js';
import { container, type DependencyContainer } from 'tsyringe';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';

describe('Variable Resolution Debug Tests', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();
    testContainer = container.createChildContainer();
    
    // Register Dependencies
    // Infrastructure Mocks (FS, Logger)
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    // Register the actual main logger using correct tokens
    testContainer.registerInstance('MainLogger', logger);
    testContainer.register('ILogger', { useToken: 'MainLogger' });

    // Register Real Factories
    testContainer.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory });
    testContainer.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
    testContainer.register(FileSystemServiceClientFactory, { useClass: FileSystemServiceClientFactory });
    testContainer.register(InterpreterServiceClientFactory, { useClass: InterpreterServiceClientFactory });

    // Register Real Services (Singleton State)
    testContainer.registerSingleton('IStateService', StateService);
    testContainer.registerSingleton('IResolutionService', ResolutionService);
    testContainer.register('IParserService', { useClass: ParserService });
    testContainer.register('IInterpreterService', { useClass: InterpreterService });
    testContainer.register('IOutputService', { useClass: OutputService });
    testContainer.register('IFileSystemService', { useClass: FileSystemService });
    testContainer.register('IPathService', { useClass: PathService });
    testContainer.register('IPathOperationsService', { useClass: PathOperationsService });
    testContainer.register('ICircularityService', { useClass: CircularityService });
    testContainer.register('IDirectiveService', { useClass: DirectiveService });
    testContainer.register('IValidationService', { useClass: ValidationService });

    // Register the container itself
    testContainer.registerInstance('DependencyContainer', testContainer);
  });

  afterEach(async () => {
    testContainer?.clearInstances();
    await context?.cleanup();
    vi.resetModules();
  });

  it('should handle simple text variables', async () => {
    const content = 
`@text greeting = "Hello"
@text subject = "World"

{{greeting}}, {{subject}}!`;
    
    await context.fs.writeFile('test.meld', content);
    
    const result = await processMeld(content, {
      container: testContainer,
      transformation: true
    });
    
    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('Hello, World!');
  });
  
  it('should handle basic array access with dot notation', async () => {
    const content = 
`@data items = ["apple", "banana", "cherry"]

First item: {{items.0}}`;
    
    await context.fs.writeFile('test.meld', content);
    
    const result = await processMeld(content, {
      container: testContainer,
      transformation: true
    });
    
    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('First item: apple');
  });
  
  it('should handle object array access with dot notation', async () => {
    const content = 
`@data users = [
  { "name": "Alice", "age": 30 },
  { "name": "Bob", "age": 25 }
]

User: {{users.0.name}}, Age: {{users.0.age}}`;
    
    await context.fs.writeFile('test.meld', content);
    
    const result = await processMeld(content, {
      container: testContainer,
      transformation: true
    });
    
    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('User: Alice, Age: 30');
  });
  
  it('should handle complex nested arrays', async () => {
    const content = 
`@data nested = {
  "users": [
    { 
      "name": "Alice", 
      "hobbies": ["reading", "hiking"] 
    },
    { 
      "name": "Bob", 
      "hobbies": ["gaming", "cooking"] 
    }
  ]
}

Name: {{nested.users.0.name}}
Hobby: {{nested.users.0.hobbies.0}}`;
    
    await context.fs.writeFile('test.meld', content);
    
    const result = await processMeld(content, {
      container: testContainer,
      transformation: true
    });
    
    expect(result.trim()).toBe('Name: Alice\nHobby: reading');
  });
}); 