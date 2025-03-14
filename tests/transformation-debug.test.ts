import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { main } from '@sdk/index.js';
import type { Services } from '@core/types/index.js';

describe('Transformation Debug Tests', () => {
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

  it('should transform simple text variables without newlines', async () => {
    const content = 
`@text greeting = "Hello"
@text subject = "World"

{{greeting}}, {{subject}}!`;
    
    await context.services.filesystem.writeFile('test.meld', content);
    
    // Enable debug logging
    const outputService = context.services.output;
    const origNodeToMarkdown = outputService.nodeToMarkdown;
    outputService.nodeToMarkdown = async function(node, state) {
      console.log('NODE TO MARKDOWN:', {
        nodeType: node.type,
        nodeContent: JSON.stringify(node),
        transformationEnabled: state.isTransformationEnabled()
      });
      return origNodeToMarkdown.call(this, node, state);
    };
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    console.log('RESULT:', JSON.stringify(result));
    
    // Check that we don't have newlines between variables
    expect(result.trim()).toBe('Hello, World!');
  });

  it('should transform array access with dot notation', async () => {
    const content = 
`@data items = ["apple", "banana", "cherry"]

First item: {{items.0}}`;
    
    await context.services.filesystem.writeFile('test.meld', content);
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    console.log('RESULT:', JSON.stringify(result));
    
    // Check that we have the correct array element
    expect(result.trim()).toBe('First item: apple');
  });
}); 