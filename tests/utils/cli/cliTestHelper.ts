/**
 * Integrated helper for CLI testing
 * 
 * This utility combines all the individual test utilities into a single helper
 * for comprehensive CLI testing.
 */

import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MemfsTestFileSystemAdapter } from '@tests/utils/MemfsTestFileSystemAdapter.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { mockProcessExit } from './mockProcessExit.js';
import { mockConsole } from './mockConsole.js';
import { vi } from 'vitest';
import { ReturnType } from 'vitest';
import * as path from 'path';

/**
 * Options for setting up a CLI test
 */
interface CliTestOptions {
  /** Files to create in the mock file system */
  files?: Record<string, string>;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Whether to mock process.exit */
  mockProcessExit?: boolean;
  /** Whether to mock console output */
  mockConsole?: boolean;
  /** Whether to create default test file */
  createDefaultTestFile?: boolean;
  /** Project root path (defaults to /project) */
  projectRoot?: string;
  /** Enable debug mode for additional logging */
  debug?: boolean;
}

/**
 * Result of setupCliTest call
 */
interface CliTestResult {
  /** The TestContextDI instance */
  context: TestContextDI;
  /** The filesystem adapter for the test */
  fsAdapter: MemfsTestFileSystemAdapter & {
    mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
  /** The FileSystemService instance */
  fileSystemService: IFileSystemService;
  /** The PathService instance */
  pathService: IPathService;
  /** Mock function for process.exit */
  exitMock: ReturnType<typeof mockProcessExit>['mockExit'];
  /** Mock functions for console methods */
  consoleMocks: ReturnType<typeof mockConsole>['mocks'];
  /** Function to clean up all mocks */
  cleanup: () => void;
}

/**
 * Set up a CLI test environment with all necessary mocks
 * @param options - Options for setting up the test
 * @returns Object containing mock functions and a cleanup function
 */
export async function setupCliTest(options: CliTestOptions = {}): Promise<CliTestResult> {
  // Create and initialize the test context
  const context = TestContextDI.createIsolated();
  const debug = options.debug || false;
  
  if (debug) {
    console.log('[setupCliTest] Creating isolated test context');
  }
  
  try {
    // Initialize the context
    await context.initialize();
    
    if (debug) {
      console.log('[setupCliTest] Test context initialized successfully');
    }
  
    // Get the filesystem adapter from the context's filesystem
    const fsAdapter = new MemfsTestFileSystemAdapter(context.services.filesystem);
    
    // Access services through DI container
    const fileSystemService = context.services.filesystem;
    const pathService = context.services.path;
    
    if (debug) {
      console.log('[setupCliTest] Services accessed: filesystem, path');
    }
    
    // Enable test mode for the path service
    pathService.enableTestMode();
    
    const projectRoot = options.projectRoot || '/project';
    
    if (debug) {
      console.log(`[setupCliTest] Creating project directory: ${projectRoot}`);
    }
    
    // Create project directory using ensureDir
    await fileSystemService.ensureDir(projectRoot);
    
    // Set up mock file system
    const files = options.files || {};
    
    // Create default test files if needed
    if (options.createDefaultTestFile || Object.keys(files).length === 0) {
      // Create the default test file at /project/test.meld if not already specified
      const defaultTestPath = `${projectRoot}/test.meld`;
      if (!files[defaultTestPath]) {
        files[defaultTestPath] = '# Default test file';
      }
      
      // Create the test file at ./test.meld for $./test.meld path format
      if (!files['./test.meld']) {
        files['./test.meld'] = '# Default test file';
      }
    }
    
    // Create all files in the mock filesystem
    for (const [filePath, content] of Object.entries(files)) {
      try {
        // Fixed path format for CLI tests
        let testPath = filePath;
        
        // Add special path prefix if needed for absolute paths starting with /project/
        if (filePath.startsWith('/project/') && !filePath.startsWith('$')) {
          testPath = '$.' + filePath.substring('/project'.length);
          
          // Handle special case for just /project
          if (testPath === '$./') {
            testPath = '$.';
          }
        }
        
        // Resolve special paths for memfs handling
        const resolvedPath = fsAdapter.resolveSpecialPaths(filePath);
        
        // Ensure parent directory exists
        const dirPath = path.dirname(resolvedPath);
        if (dirPath && dirPath !== '.') {
          await fileSystemService.ensureDir(dirPath);
        }
        
        // Write the file
        await fileSystemService.writeFile(resolvedPath, content);
        
        if (debug) {
          console.log(`[setupCliTest] Created file: ${filePath} -> ${resolvedPath}`);
        }
      } catch (error) {
        console.warn(`Failed to write file: ${filePath}`, error);
      }
    }
    
    // Set up environment variables
    const originalEnv = { ...process.env };
    if (options.env) {
      Object.entries(options.env).forEach(([key, value]) => {
        process.env[key] = value;
      });
      
      if (debug) {
        console.log(`[setupCliTest] Set environment variables: ${JSON.stringify(options.env)}`);
      }
    }
    
    // Set up process.exit mock if requested
    const exitMockResult = options.mockProcessExit !== false ? mockProcessExit() : { mockExit: vi.fn(), restore: vi.fn() };
    
    // Set up console mocks if requested
    const consoleMockResult = options.mockConsole !== false ? mockConsole() : { mocks: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }, restore: vi.fn() };
    
    // Add necessary methods to fsAdapter for tests expecting NodeFileSystem interface
    if (typeof fsAdapter.mkdir !== 'function') {
      fsAdapter.mkdir = async (path: string, options?: { recursive?: boolean }) => {
        if (debug) {
          console.log(`[setupCliTest] mkdir called (adapter): ${path}`);
        }
        return fileSystemService.ensureDir(path);
      };
    }
    
    // Add exists method if not already present
    if (typeof fsAdapter.exists !== 'function') {
      fsAdapter.exists = async (path: string) => {
        if (debug) {
          console.log(`[setupCliTest] exists called (adapter): ${path}`);
        }
        return fileSystemService.exists(path);
      };
    }
    
    // Create a cleanup function that properly handles async operations
    const cleanup = () => {
      try {
        if (debug) {
          console.log('[setupCliTest] Running cleanup');
        }
        
        // Restore mocks
        exitMockResult.restore();
        consoleMockResult.restore();
        
        // Additional cleanup for Vitest 
        vi.clearAllMocks();
        
        // Restore environment variables
        if (options.env) {
          Object.keys(options.env).forEach((key) => {
            delete process.env[key];
          });
        }
        
        // Reset env variables to original
        process.env = originalEnv;
        
        // Async cleanup wrapped in a sync function
        // The test expects a sync function, but we'll handle the context cleanup
        // on a best-effort basis
        context.cleanup().catch(err => {
          console.error('[setupCliTest] Error during context cleanup:', err);
        });
        
        if (debug) {
          console.log('[setupCliTest] Cleanup completed');
        }
      } catch (err) {
        console.error('[setupCliTest] Error in cleanup function:', err);
      }
    };
    
    return {
      context,
      fsAdapter,
      fileSystemService,
      pathService,
      exitMock: exitMockResult.mockExit,
      consoleMocks: consoleMockResult.mocks,
      cleanup
    };
  } catch (error) {
    console.error('[setupCliTest] Error in test setup:', error);
    
    // Attempt to clean up context if initialization failed
    try {
      await context.cleanup();
    } catch (cleanupError) {
      console.error('[setupCliTest] Error during context cleanup after setup failure:', cleanupError);
    }
    
    throw error;
  }
}

/**
 * Example usage:
 * 
 * ```typescript
 * describe('CLI', () => {
 *   it('should process template with environment variables', async () => {
 *     const { exitMock, consoleMock, context, cleanup } = await setupCliTest({
 *       files: {
 *         '/template.meld': '@text greeting = "Hello #{env.USER}"'
 *       },
 *       env: {
 *         'USER': 'TestUser'
 *       }
 *     });
 *     
 *     try {
 *       await cli.run(['template.meld', '--output', 'result.txt']);
 *       expect(exitMock).not.toHaveBeenCalled();
 *       expect(await context.services.filesystem.exists('/result.txt')).toBe(true);
 *       expect(await context.services.filesystem.readFile('/result.txt', 'utf8')).toBe('Hello TestUser');
 *     } finally {
 *       cleanup();
 *     }
 *   });
 *   
 *   it('should handle errors in strict mode', async () => {
 *     const { exitMock, consoleMock, cleanup } = await setupCliTest();
 *     
 *     try {
 *       await cli.run(['--strict', '--eval', '@text greeting = "Hello #{undefined}"']);
 *       expect(exitMock).toHaveBeenCalledWith(1);
 *       expect(consoleMock.error).toHaveBeenCalledWith(
 *         expect.stringContaining('undefined variable')
 *       );
 *     } finally {
 *       cleanup();
 *     }
 *   });
 * });
 * ```
 */