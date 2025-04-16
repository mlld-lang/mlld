import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processMeld, ProcessOptions } from '@api/index.js';
import { container, DependencyContainer } from 'tsyringe';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';

describe('Array Access Tests', () => {
  let memfs: MemfsTestFileSystem;
  let testContainer: DependencyContainer;

  beforeEach(() => {
    memfs = new MemfsTestFileSystem();
    memfs.initialize();

    testContainer = container.createChildContainer();
    testContainer.registerInstance<IFileSystem>('IFileSystem', memfs);
  });

  afterEach(async () => {
    await memfs?.cleanup();

    testContainer?.dispose();

    vi.resetModules();
  });

  it('should handle direct array access with dot notation', async () => {
    const content = 
`@data items = ["apple", "banana", "cherry"]

First item: {{items.0}}
Second item: {{items.1}}
Third item: {{items.2}}`;
    
    const options: Partial<ProcessOptions> = {
      format: 'markdown',
      container: testContainer
    };

    const result = await processMeld(content, options);

    console.log('CONTENT:', content);
    console.log('RESULT:', result);
    
    expect(result.trim()).toBe('First item: apple\nSecond item: banana\nThird item: cherry');
  });
}); 