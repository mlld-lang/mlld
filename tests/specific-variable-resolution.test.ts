import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { main } from '@api/index.js';
import type { Services } from '@core/types/index.js';

describe('Variable Resolution Specific Tests', () => {
  let context: TestContextDI;
  
  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
    
    // Enable transformation with specific options
    context.enableTransformation({
      variables: true,
      directives: true,
      commands: true,
      imports: true
    });
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should handle nested object data structures with variable references', async () => {
    const content = `@text greeting = "Hello"
@data config = { "app": { "name": "Meld", "version": "1.0.0" }, "user": { "name": "Alice" } }

{{greeting}}, {{config.user.name}}!

App: {{config.app.name}} v{{config.app.version}}`;
    await context.services.filesystem.writeFile('test.meld', content);
    
    // Enable transformation
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    console.log('Raw result:', result);
    
    // Check that the output contains the expected transformed variable references
    expect(result).toBeDefined();
    expect(result).toContain('Hello, Alice!');
    // Account for possible line break in the output
    expect(result).toContain('App: Meld v');
    expect(result).toContain('1.0.0');
    
    // Check that the data is correctly set in the state
    expect(context.services.state.getTextVar('greeting')).toBe('Hello');
    expect(context.services.state.getDataVar('config')).toEqual({
      app: {
        name: 'Meld',
        version: '1.0.0'
      },
      user: {
        name: 'Alice'
      }
    });
  });
  
  it('should handle array access in variable references', async () => {
    const content = `@data items = ["apple", "banana", "cherry"]
@data users = [{"name": "Alice", "role": "admin"}, {"name": "Bob", "role": "user"}]

First item: {{items[0]}}
Second user: {{users[1].name}}
First user role: {{users[0].role}}`;
    await context.services.filesystem.writeFile('test.meld', content);
    
    // Enable transformation
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    console.log('Raw result:', result);
    
    // Check that the output contains the expected transformed variable references
    expect(result).toBeDefined();
    expect(result).toContain('First item: apple');
    expect(result).toContain('Second user: Bob');
    expect(result).toContain('First user role: admin');
  });

  it('should format output with variable references', async () => {
    const content = `@text greeting = "Hello"
@text subject = "World"
@text message = "{{greeting}}, {{subject}}!"

# Heading

{{message}}

- List item 1
- List item 2`;
    await context.services.filesystem.writeFile('test.meld', content);
    
    // Enable transformation with markdown format
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'markdown'
    });
    
    console.log('Raw markdown result:', result);
    
    // Check that the output contains the expected transformed content
    expect(result).toBeDefined();
    expect(result).toContain('# Heading');
    expect(result).toContain('Hello, World!');
    expect(result).toContain('- List item 1');
    expect(result).not.toContain('@text');  // Directives should be transformed away
    
    // Try with XML format
    const xmlResult = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'xml'
    });
    
    console.log('Raw XML result:', xmlResult);
    
    // Check that the XML output contains the expected transformed content
    expect(xmlResult).toBeDefined();
    expect(xmlResult).toContain('Hello, World!');
    expect(xmlResult).toContain('List item 1');
    expect(xmlResult).not.toContain('@text');  // Directives should be transformed away
  });
}); 