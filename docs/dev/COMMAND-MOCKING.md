# Command Execution Mocking

This document explains the command execution mocking system for testing components that make external system calls.

## Overview

The command execution mocking system provides a way to simulate command execution in tests without actually running system commands. This is particularly useful for testing the `@run` directive handler and other components that rely on executing external commands.

## Key Components

### 1. MockCommandExecutor

The core class that handles command execution mocking:

- Supports exact command matching
- Supports pattern matching with RegExp
- Supports capture group substitution in responses
- Provides default responses for unmatched commands

```typescript
import { MockCommandExecutor } from '@tests/utils/fs/MockCommandExecutor';

const executor = new MockCommandExecutor();

// Add exact match response
executor.addCommandResponse('git status', {
  stdout: 'On branch main\nNothing to commit',
  stderr: '',
  exitCode: 0
});

// Add pattern match with capture groups
executor.addCommandPattern(/npm run (.*)/, {
  stdout: 'Running script $1...\nDone!',
  stderr: '',
  exitCode: 0
});

// Set default response
executor.setDefaultResponse({
  stdout: '',
  stderr: 'Command not supported',
  exitCode: 127
});

// Execute command
const result = await executor.executeCommand('npm run test');
console.log(result); // { stdout: 'Running script test...Done!', stderr: '', exitCode: 0 }
```

### 2. CommandMockableFileSystem

File system implementation that integrates with the MockCommandExecutor:

- Implements the IFileSystem interface
- Uses memfs for in-memory file operations
- Delegates command execution to MockCommandExecutor

### 3. commandMockingHelper

Helper function to simplify setup in tests:

```typescript
import { setupCommandMocking } from '@tests/utils/fs/commandMockingHelper';

// Set up mocking
const { 
  mockCommand, 
  mockCommandPattern, 
  fs, 
  restore 
} = setupCommandMocking({
  fileSystemService // Optional service to inject the mock into
});

// Configure mock responses
mockCommand('git status', {
  stdout: 'On branch main\nNothing to commit',
  stderr: '',
  exitCode: 0
});

// Clean up when done
restore();
```

## Common Use Cases

### Testing RunDirectiveHandler

The most common use case is testing the `RunDirectiveHandler`, which executes commands and stores their output in state variables.

```typescript
// Set up command mocking
const { mockCommand, restore, fs } = setupCommandMocking();

// Inject the mock file system into the FileSystemService
fileSystemService.executeCommand = fs.executeCommand.bind(fs);

// Mock a command response
mockCommand('echo Hello World', {
  stdout: 'Hello World',
  stderr: '',
  exitCode: 0
});

// Execute the handler
const result = await runDirectiveHandler.execute(runNode, context);

// Verify results
expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Hello World');
```

### Testing Variable Resolution with Command Output

Another common use case is testing variable resolution that involves command output:

```typescript
// Mock a command that will be used for variable resolution
mockCommand('git rev-parse HEAD', {
  stdout: '0123456789abcdef',
  stderr: '',
  exitCode: 0
});

// Test variable resolution
const resolved = await variableResolver.resolve('{{run:git rev-parse HEAD}}');
expect(resolved).toBe('0123456789abcdef');
```

## Common Command Patterns

Some predefined command patterns are available through `createCommonCommandMappings()`:

- Echo commands (`echo Hello` → `Hello`)
- NPM commands (`npm run test` → `Running script test...Done!`) 
- Git commands (`git status` → `Git operation: status`)
- Basic ls command simulation (`ls /path` → `file1.txt\nfile2.txt\ndirectory1\n`)

## Best Practices

1. Always restore mocks in afterEach or in try/finally blocks
2. Use pattern matching for similar commands instead of creating many exact matches
3. For complex test suites, consider creating a shared setup function
4. Include non-zero exit codes and stderr output in tests to verify error handling
5. Test both success and failure scenarios for commands

## Example Complete Test

See the example at `tests/utils/examples/RunDirectiveCommandMock.example.ts` for a complete test using command mocking.