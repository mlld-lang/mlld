/**
 * Utility for mocking the file system in CLI tests
 * 
 * This utility allows testing file operations without affecting the actual file system.
 * It uses memfs to create an in-memory file system for testing.
 */

import { vi } from 'vitest';
import { vol } from 'memfs';

/**
 * Initial files structure for the mock file system
 */
interface FileSystem {
  [path: string]: string;
}

/**
 * Result of mockFileSystem call
 */
interface MockFileSystemResult {
  /** The memfs volume for direct manipulation */
  vol: typeof vol;
  /** Function to restore the original fs module */
  restore: () => void;
}

/**
 * Mock the file system for testing
 * @param initialFiles - Object mapping file paths to content
 * @returns Object containing the memfs volume and a restore function
 */
export function mockFileSystem(initialFiles: FileSystem = {}): MockFileSystemResult {
  // Save original fs implementation
  const originalFs = vi.importActual('fs') as object;
  
  // Setup mock file system
  vol.reset();
  vol.fromJSON(initialFiles);
  
  // Mock fs module
  vi.mock('fs', () => ({
    ...originalFs,
    readFileSync: vi.fn().mockImplementation((path: string) => vol.readFileSync(path)),
    writeFileSync: vi.fn().mockImplementation((path: string, data: string) => vol.writeFileSync(path, data)),
    existsSync: vi.fn().mockImplementation((path: string) => vol.existsSync(path))
  }));
  
  return {
    vol,
    restore: () => {
      vi.unmock('fs');
    }
  };
}

/**
 * Example usage:
 * 
 * ```typescript
 * it('should process template file correctly', async () => {
 *   const { vol, restore } = mockFileSystem({
 *     '/template.meld': '@text greeting = "Hello #{name}"',
 *     '/data.json': '{"name": "World"}'
 *   });
 *   
 *   try {
 *     await cli.run(['template.meld', '--data', 'data.json', '--output', 'result.txt']);
 *     expect(vol.existsSync('/result.txt')).toBe(true);
 *     expect(vol.readFileSync('/result.txt', 'utf8')).toBe('Hello World');
 *   } finally {
 *     restore();
 *   }
 * });
 * ```
 */ 