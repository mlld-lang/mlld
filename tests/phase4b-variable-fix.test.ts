import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { Services } from '@core/types/index.js';
import * as fs from 'fs';
import type { DirectiveNode } from 'meld-spec';
import { outputLogger as logger } from '@core/utils/logger.js';

describe('Phase 4B: Variable-based Embed Transform Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should correctly handle variable-based embed directives in transformation mode', async () => {
    const content = `@data role = { "architect": "Senior architect" }\n@embed {{role.architect}}`;
    await context.services.filesystem.writeFile('simple-embed-test.meld', content);
    
    // Create an entirely new test file for this specific issue
    const result = await main('simple-embed-test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });
    
    // Test only that the result contains the expected resolved value
    expect(result).toContain('Senior architect');
  });
});