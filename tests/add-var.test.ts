import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { Services } from '@core/types/index';

describe('Add Var Test', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should handle simple text variable embedding', async () => {
    // Create file with text variable and add
    await context.services.filesystem.writeFile('test.meld', '@text greeting = "Hello World"\n@add {{greeting}}');

    // Initialize state
    const state = context.services.state;
    state.setTextVar('greeting', 'Hello World');
    console.log('Initial state greeting:', state.getTextVar('greeting'));

    // Test add replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });

    console.log('Result:', result);
    console.log('Result length:', result.length);
    
    // Expected behavior: add directive should be replaced with variable content
    expect(result.trim()).toBe('Hello World');
  });
});