import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { processMeld } from '@api/index.js';
import type { Services, ProcessOptions } from '@core/types/index.js';
import logger from '@core/utils/logger.js';
import { container, type DependencyContainer } from 'tsyringe';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';

describe('Variable Resolution Debug Tests', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();
    testContainer = container.createChildContainer();
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    testContainer.registerInstance('MainLogger', logger);
    testContainer.register('ILogger', { useToken: 'MainLogger' });
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