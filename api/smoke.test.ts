import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processMeld, ProcessOptions } from '@api/index.js';
import { container, DependencyContainer } from 'tsyringe'; // Need this
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { logger } from '@core/utils/logger'; // Need this
import type { ILogger } from '@core/utils/logger'; // Need this
import { StateService } from '@services/state/StateService/StateService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';

describe('API Smoke Tests', () => {
  let testContainer: DependencyContainer; // Restore this
  let memFs: MemfsTestFileSystem;

  beforeEach(async () => {
    memFs = new MemfsTestFileSystem();
    testContainer = container.createChildContainer(); // Restore this

    // Register essential instances
    testContainer.registerInstance<IFileSystem>('IFileSystem', memFs); // Restore this
    testContainer.registerInstance('DependencyContainer', testContainer); // Restore this
    testContainer.registerInstance<ILogger>('MainLogger', logger); // Restore logger registration
    testContainer.register('ILogger', { useToken: 'MainLogger' }); // Restore logger registration

    // Register StateService correctly
    testContainer.registerSingleton(StateService, StateService);
    testContainer.registerSingleton('IStateService', { useToken: StateService });

    // NOTE: We might need more registrations here if processMeld requires them even for smoke tests.
  });

  afterEach(async () => {
    testContainer?.dispose(); // Restore this for proper cleanup
  });

  it('should process simple text content correctly', async () => {
    const content = `Just some plain text.`;
    const options: Partial<ProcessOptions> = {
      format: 'markdown',
      fs: memFs as any, // Pass MemFS directly if needed by processMeld internally (or mock globally)
      container: testContainer // Restore passing the container
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
      fs: memFs as any, // Pass MemFS directly if needed
      container: testContainer // Restore passing the container
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