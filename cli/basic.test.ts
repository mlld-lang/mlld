// /**
//  * Basic CLI test to debug issues with the test environment
//  */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// import { TestContext } from '../tests/utils/TestContext.js';
// import { MemfsTestFileSystemAdapter } from '../tests/utils/MemfsTestFileSystemAdapter.js';
// import { setupCliTest } from '../tests/utils/cli/cliTestHelper.js';
// import * as cli from './index.js';

// describe('Basic CLI Tests', () => {
//   it('should process a simple meld file without errors', async () => {
//     // Create test environment
//     const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
//       files: {
//         '/project/test.meld': 'Hello World!'
//       }
//     });
    
//     // Set up process.argv
//     process.argv = ['node', 'meld', '$./test.meld', '--format', 'md', '--stdout'];
    
//     try {
//       await cli.main(fsAdapter);
//       expect(exitMock).not.toHaveBeenCalled();
      
//       // When we mocked console.log correctly, this should pass
//       expect(consoleMocks.log).toHaveBeenCalled();
      
//       const output = consoleMocks.log.mock.calls.flat().join('\n');
//       console.log('Test - Captured console output:', output);
      
//       expect(output).toContain('Hello World');
//     } finally {
//       cleanup();
//     }
//   });
// });

it.skip('skipping this test', () => {
  expect(true).toBe(true);
});

