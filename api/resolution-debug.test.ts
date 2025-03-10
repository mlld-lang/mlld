import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { main } from './index.js';
import type { Services, ProcessOptions } from '@core/types/index.js';

describe('Variable Resolution Debug Tests', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
    context.enableTransformation();
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.resetModules();
  });

  it('should handle simple text variables', async () => {
    const content = 
`@text greeting = "Hello"
@text subject = "World"

{{greeting}}, {{subject}}!`;
    
    await context.services.filesystem.writeFile('test.meld', content);
    
    // Add debug logging for parsed content
    const parserService = context.services.parser;
    const origParse = parserService.parse;
    parserService.parse = async (content) => {
      const result = await origParse.call(parserService, content);
      console.log('PARSER RESULT:', JSON.stringify(result, null, 2));
      return result;
    };
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    // Log the content for debugging
    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    console.log('Transformation enabled:', context.services.state.isTransformationEnabled());
    
    expect(result.trim()).toBe('Hello, World!');
  });
  
  it('should handle basic array access with dot notation', async () => {
    const content = 
`@data items = ["apple", "banana", "cherry"]

First item: {{items.0}}`;
    
    await context.services.filesystem.writeFile('test.meld', content);
    
    // Add debug logging for parsed content
    const parserService = context.services.parser;
    const origParse = parserService.parse;
    parserService.parse = async (content) => {
      const result = await origParse.call(parserService, content);
      console.log('PARSER RESULT:', JSON.stringify(result, null, 2));
      return result;
    };
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    // Log the content for debugging
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
    
    await context.services.filesystem.writeFile('test.meld', content);
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    // Log the content for debugging
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
    
    await context.services.filesystem.writeFile('test.meld', content);
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    expect(result.trim()).toBe('Name: Alice\nHobby: reading');
  });
}); 