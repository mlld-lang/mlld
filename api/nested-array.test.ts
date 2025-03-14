import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { main } from '@api/index.js';
import type { Services, ProcessOptions } from '@core/types/index.js';

describe('Nested Array Access Tests', () => {
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
    
    await context.services.filesystem.writeFile('test.meld', content);
    
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    // Log the content for debugging
    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('First item of first array: a\nSecond item of second array: e\nThird item of third array: i');
  });
}); 