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
}

/**
 * Result of setupCliTest call
 */
interface CliTestResult {
  /** The TestContextDI instance */
  context: TestContextDI;
  /** The filesystem adapter for the test */
  fsAdapter: MemfsTestFileSystemAdapter;
  /** The FileSystemService instance */
  fileSystemService: IFileSystemService;
  /** The PathService instance */
  pathService: IPathService;
  /** Mock function for process.exit */
  exitMock?: ReturnType<typeof mockProcessExit>['mockExit'];
  /** Mock functions for console methods */
  consoleMocks?: ReturnType<typeof mockConsole>['mocks'];
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
  await context.initialize();
  
  // Get the filesystem adapter from the context's filesystem
  const fsAdapter = new MemfsTestFileSystemAdapter(context.services.filesystem);
  
  // Access services through DI container
  const fileSystemService = context.services.filesystem;
  const pathService = context.services.path;
  
  // Enable test mode for the path service
  pathService.enableTestMode();
  
  const projectRoot = options.projectRoot || '/project';
  
  // Create project directory
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
      
      console.log(`Setting up test file: ${testPath} (original: ${filePath})`);
      
      // Resolve special paths for memfs handling
      const resolvedPath = fsAdapter.resolveSpecialPaths(filePath);
      
      // Ensure parent directory exists
      const dirPath = path.dirname(resolvedPath);
      if (dirPath && dirPath !== '.') {
        console.log(`Creating parent directory: ${dirPath}`);
        await fileSystemService.ensureDir(dirPath);
      }
      
      // Write the file
      await fileSystemService.writeFile(resolvedPath, content);
      console.log(`Created test file: ${resolvedPath} (from: ${filePath}, test path: ${testPath})`);
    } catch (error) {
      console.warn(`Failed to write file: ${filePath}`, error);
    }
  }
  
  // Set up environment variables
  if (options.env) {
    const originalEnv = { ...process.env };
    Object.entries(options.env).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }
  
  // Set up process.exit mock if requested
  const exitMock = options.mockProcessExit !== false ? mockProcessExit() : null;
  
  // Set up console mocks if requested
  const consoleMocks = options.mockConsole !== false ? mockConsole() : null;
  
  const cleanup = async () => {
    // Restore mocks
    exitMock?.restore();
    consoleMocks?.restore();
    
    // Additional cleanup for Vitest 
    vi.clearAllMocks();
    
    // Restore environment variables
    if (options.env) {
      Object.keys(options.env).forEach((key) => {
        delete process.env[key];
      });
    }
    
    // Cleanup the context
    await context.cleanup();
  };
  
  return {
    context,
    fsAdapter,
    fileSystemService,
    pathService,
    exitMock: exitMock?.mockExit || vi.fn(),
    consoleMocks: consoleMocks?.mocks,
    cleanup
  };
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
 *       await cleanup();
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
 *       await cleanup();
 *     }
 *   });
 * });
 * ```
 */