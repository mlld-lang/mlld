import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { main } from './index.js';
import type { Services, ProcessOptions } from '@core/types/index.js';

describe('Array Access Tests', () => {
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

  it('should handle direct array access with dot notation', async () => {
    const content = 
`@data items = ["apple", "banana", "cherry"]

First item: {{items.0}}
Second item: {{items.1}}
Third item: {{items.2}}`;
    
    await context.services.filesystem.writeFile('test.meld', content);
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    // Log the content for debugging
    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('First item: apple\nSecond item: banana\nThird item: cherry');
  });
}); 