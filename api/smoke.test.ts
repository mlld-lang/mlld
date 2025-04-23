import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processMeld, ProcessOptions } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { logger } from '@core/utils/logger';
import type { ILogger } from '@core/utils/logger';
import { StateService } from '@services/state/StateService/StateService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';

describe('API Smoke Tests', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    // Provide the REAL ResolutionService to prevent the mock from being used
    context = await TestContextDI.createTestHelpers().setupWithStandardMocks({
      'IResolutionService': ResolutionService 
    });
  });

  afterEach(async () => {
    if (context) {
      await context.cleanup();
    }
  });

  it('should process simple text content correctly', async () => {
    const content = `Just some plain text.`;
    const options: Partial<ProcessOptions> = {
      format: 'markdown',
      fs: context.fs as any,
      container: context.container.getContainer()
    };

    let result: string | undefined;
    let error: Error | undefined;

    try {
      result = await processMeld(content, options);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      console.error("Smoke test failed:", error);
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(result?.trim()).toBe('Just some plain text.');
  });

  it('should process a simple text variable substitution', async () => {
    const content = 
`@text message = "World"
Hello {{message}}!`;
    
    const options: Partial<ProcessOptions> = {
      format: 'markdown',
      fs: context.fs as any,
      container: context.container.getContainer()
    };
    
    let result: string | undefined;
    let error: Error | undefined;

    try {
      result = await processMeld(content, options);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      console.error("Smoke test failed:", error);
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(result?.trim()).toBe('Hello World!');
  });

  // Add more basic tests here later (e.g., simple @import, simple @run)
});