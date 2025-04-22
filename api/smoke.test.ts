import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processMeld, ProcessOptions } from '@api/index.js';
// import { container, DependencyContainer } from 'tsyringe'; // No longer needed here
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
// import type { ILogger } from '@core/utils/logger.js'; // No longer needed here
// import logger from '@core/utils/logger.js'; // No longer needed here
import { StateService } from '@services/state/StateService.js';
import type { IStateService } from '@services/state/IStateService.js';

describe('API Smoke Tests', () => {
  // let testContainer: DependencyContainer; // No longer needed here
  let memFs: MemfsTestFileSystem;

  beforeEach(async () => {
    // Only need MemFS for setup now
    memFs = new MemfsTestFileSystem(); 
    // testContainer = container.createChildContainer(); // Removed
    // // Register ONLY essential instances needed for basic operation
    // testContainer.registerInstance<IFileSystem>('IFileSystem', memFs); // Removed
    // testContainer.registerInstance('DependencyContainer', testContainer); // Removed
    // // Register Logger (often required early by many services)
    // testContainer.registerInstance('MainLogger', logger); // Removed
    // testContainer.register('ILogger', { useToken: 'MainLogger' }); // Removed
    testContainer.registerSingleton(StateService, StateService);
    testContainer.registerSingleton('IStateService', { useToken: StateService });
    testContainer.registerInstance<IStateService | null>('ParentStateServiceForChild', null); // Fix DI error

    // Register other services or factories
  });

  afterEach(async () => {
    // testContainer?.dispose(); // Removed
    // No cleanup needed here anymore for the container
  });

  it('should process simple text content correctly', async () => {
    const content = `Just some plain text.`;
    const options: Partial<ProcessOptions> = {
      format: 'markdown',
      fs: memFs as any // Pass MemFS directly if needed by processMeld internally (or mock globally)
      // container: testContainer // REMOVED
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
      fs: memFs as any // Pass MemFS directly if needed
      // container: testContainer // REMOVED
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