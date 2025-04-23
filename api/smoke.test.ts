import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processMeld, ProcessOptions } from '@api/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import { logger } from '@core/utils/logger';
import type { ILogger } from '@core/utils/logger';
import { StateService } from '@services/state/StateService/StateService';
import type { IStateService } from '@services/state/StateService/IStateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory';

describe('API Smoke Tests', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    // Provide REAL ResolutionService, StateService, AND the Factory
    context = await TestContextDI.createTestHelpers().setupWithStandardMocks({
      'IResolutionService': ResolutionService,
      'IStateService': StateService,
      'VariableReferenceResolverClientFactory': VariableReferenceResolverClientFactory,
      [VariableReferenceResolverClientFactory.name]: VariableReferenceResolverClientFactory
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
@embed [[Hello {{message}}!]]`;
    
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
    // Expect the literal string, as variables in plain text are not interpolated
    expect(result?.trim()).toBe('Hello World!');
  });

  // Add more basic tests here later (e.g., simple @import, simple @run)
});