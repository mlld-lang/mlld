import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { Services } from '@core/types/index';
import * as fs from 'fs';
import type { DirectiveNode } from '@core/syntax/types';
import { outputLogger as logger } from '@core/utils/logger';

describe('Phase 4B: Variable-based Add Transform Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should correctly handle variable-based add directives in transformation mode', async () => {
    const content = `@data role = { "architect": "Senior architect" }\n@add {{role.architect}}`;
    await context.services.filesystem.writeFile('simple-add-test.meld', content);
    
    // Create an entirely new test file for this specific issue
    const result = await main('simple-add-test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });
    
    // Test only that the result contains the expected resolved value
    expect(result).toContain('Senior architect');
  });
});