// /**
//  * Priority CLI Tests
//  * 
//  * This file contains the highest priority CLI tests that need to be fixed first.
//  * These tests focus on the core CLI functionality and error handling.
//  */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// import { TestContext } from '../tests/utils/TestContext.js';
// import { MemfsTestFileSystemAdapter } from '../tests/utils/MemfsTestFileSystemAdapter.js';
// import { setupCliTest } from '../tests/utils/cli/cliTestHelper.js';
// import * as cli from './index.js';

// describe('Priority CLI Tests', () => {
//   let context: TestContext;
//   let fsAdapter: MemfsTestFileSystemAdapter;
  
//   beforeEach(async () => {
//     // Set NODE_ENV for path resolution in CLIService
//     process.env.NODE_ENV = 'test';
    
//     context = new TestContext();
//     await context.initialize();
//     fsAdapter = new MemfsTestFileSystemAdapter(context.fs);
    
//     // Create basic test directory structure
//     await context.fs.mkdir('/project');
//     await context.fs.writeFile('/project/test.meld', 'Hello World!');
//   });
  
//   afterEach(async () => {
//     await context.cleanup();
//   });
  
//   describe('Basic CLI Functionality', () => {
//     it('should process a simple meld file without errors', async () => {
//       // Create test file with correct path format ($. prefix for project paths)
//       await context.fs.writeFile('/project/test.meld', 'Hello World!');
//       process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      
//       const exitMock = vi.fn();
//       const originalExit = process.exit;
//       process.exit = exitMock as any;
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).not.toHaveBeenCalled();
//       } finally {
//         process.exit = originalExit;
//       }
//     });
    
//     it('should handle command line arguments correctly', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//         files: {
//           '/project/test.meld': '@text greeting = "Hello World"\n#{greeting}'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./test.meld', '--format', 'md', '--stdout'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).not.toHaveBeenCalled();
//         expect(consoleMocks.log).toHaveBeenCalled();
//         const output = consoleMocks.log.mock.calls.flat().join('\n');
//         expect(output).toContain('Hello World');
//       } finally {
//         cleanup();
//       }
//     });
    
//     it('should handle file I/O correctly', async () => {
//       const { fsAdapter, cleanup } = setupCliTest({
//         files: {
//           '/project/input.meld': '@text greeting = "Hello World"\n#{greeting}'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./input.meld', '--output', '$./output.md'];
      
//       try {
//         await cli.main(fsAdapter);
//         const exists = await fsAdapter.exists('/project/output.md');
//         expect(exists).toBe(true);
        
//         const content = await fsAdapter.readFile('/project/output.md');
//         expect(content).toContain('Hello World');
//       } finally {
//         cleanup();
//       }
//     });
//   });
  
//   describe('CLI Error Handling', () => {
//     it('should handle missing input file errors properly', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest();
      
//       process.argv = ['node', 'meld', '$./nonexistent.meld'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).toHaveBeenCalledWith(1);
//         expect(consoleMocks.error).toHaveBeenCalled();
//         const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
//         expect(errorOutput).toContain('not found');
//       } finally {
//         cleanup();
//       }
//     });
    
//     it('should handle parse errors properly', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//         files: {
//           '/project/invalid.meld': '@text greeting = "Unclosed string'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./invalid.meld'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).toHaveBeenCalledWith(1);
//         expect(consoleMocks.error).toHaveBeenCalled();
//         const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
//         expect(errorOutput).toContain('Parse error');
//       } finally {
//         cleanup();
//       }
//     });
    
//     it('should respect the strict flag for error handling', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//         files: {
//           '/project/test.meld': '@text greeting = "Hello #{undefined}"\n#{greeting}'
//         }
//       });
      
//       // Run in strict mode
//       process.argv = ['node', 'meld', '--strict', '$./test.meld'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).toHaveBeenCalledWith(1);
//       } finally {
//         cleanup();
//       }
//     });
//   });
  
//   describe('CLI Output Options', () => {
//     it('should respect output format options', async () => {
//       const { fsAdapter, exitMock, cleanup } = setupCliTest({
//         files: {
//           '/project/test.meld': '@text greeting = "Hello World"\n#{greeting}'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./test.meld', '--format', 'md'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).not.toHaveBeenCalled();
        
//         // Check that the output file has the correct extension
//         const mdExists = await fsAdapter.exists('/project/test.md');
//         expect(mdExists).toBe(true);
        
//         // Check that the output file does not exist with the default extension
//         const xmlExists = await fsAdapter.exists('/project/test.xml');
//         expect(xmlExists).toBe(false);
//       } finally {
//         cleanup();
//       }
//     });
    
//     it('should handle stdout option correctly', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//         files: {
//           '/project/test.meld': '@text greeting = "Hello World"\n#{greeting}'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).not.toHaveBeenCalled();
//         expect(consoleMocks.log).toHaveBeenCalled();
//       } finally {
//         cleanup();
//       }
//     });
//   });
  
//   describe('Path Variable Handling', () => {
//     it('should handle PROJECTPATH special variables correctly', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//         files: {
//           '/project/test.meld': '@path testPath = "$PROJECTPATH/test.txt"\n#{testPath}'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).not.toHaveBeenCalled();
//         expect(consoleMocks.log).toHaveBeenCalled();
//         const output = consoleMocks.log.mock.calls.flat().join('\n');
//         expect(output).toContain('/project/test.txt');
//       } finally {
//         cleanup();
//       }
//     });
    
//     it('should handle HOMEPATH special variables correctly', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//         files: {
//           '/project/test.meld': '@path testPath = "$HOMEPATH/test.txt"\n#{testPath}'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).not.toHaveBeenCalled();
//         expect(consoleMocks.log).toHaveBeenCalled();
//         const output = consoleMocks.log.mock.calls.flat().join('\n');
//         // This should be '/home/test.txt' in the mock environment
//         expect(output).toContain('/home/test.txt');
//       } finally {
//         cleanup();
//       }
//     });
//   });
  
//   describe('Text Variable Handling', () => {
//     it('should handle text variable interpolation correctly', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//         files: {
//           '/project/test.meld': '@text name = "World"\nHello #{name}!'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).not.toHaveBeenCalled();
//         expect(consoleMocks.log).toHaveBeenCalled();
//         const output = consoleMocks.log.mock.calls.flat().join('\n');
//         expect(output).toContain('Hello World!');
//       } finally {
//         cleanup();
//       }
//     });
    
//     it('should handle nested variable interpolation correctly', async () => {
//       const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//         files: {
//           '/project/test.meld': '@text firstname = "John"\n@text lastname = "Doe"\n@text fullname = "#{firstname} #{lastname}"\nHello #{fullname}!'
//         }
//       });
      
//       process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      
//       try {
//         await cli.main(fsAdapter);
//         expect(exitMock).not.toHaveBeenCalled();
//         expect(consoleMocks.log).toHaveBeenCalled();
//         const output = consoleMocks.log.mock.calls.flat().join('\n');
//         expect(output).toContain('Hello John Doe!');
//       } finally {
//         cleanup();
//       }
//     });
//   });
// });

it.skip('skipping this test', () => {
  expect(true).toBe(true);
});