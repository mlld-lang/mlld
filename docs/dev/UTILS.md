# Meld Utility Infrastructure

This document provides an overview of the utility infrastructure available in the Meld codebase for both production and testing environments.

## Production Utilities

### Core Utilities

#### Logger (`core/utils/logger.ts`)
- Provides structured logging throughout the application
- Supports different log levels (debug, info, warn, error)
- Service-specific loggers (stateLogger, parserLogger, etc.)
- Can be configured for different environments

#### Service Validation (`core/utils/serviceValidation.ts`)
- Validates service dependency graph
- Ensures services are initialized in the correct order
- Prevents circular dependencies
- Throws `ServiceInitializationError` for invalid configurations

### Error Handling

#### MeldError (`core/errors/MeldError.ts`)
- Base error class for all Meld-specific errors
- Supports error codes and severity levels
- Structured error information for better debugging

#### Specialized Errors
- `MeldDirectiveError`: For directive-specific errors
- `MeldParseError`: For parsing errors
- `MeldInterpreterError`: For interpretation errors
- `MeldResolutionError`: For variable resolution errors
- `PathValidationError`: For path validation errors
- `ServiceInitializationError`: For service initialization errors

### Path Handling

#### PathService (`services/fs/PathService/PathService.ts`)
- Validates and normalizes paths
- Handles special path variables ($HOMEPATH/$~, $PROJECTPATH/$.)
- Handles user-defined path variables ($path) created by @path directives
- Resolves path variables in different contexts (directives, imports, etc.)
- Supports test mode for path operations
- Enforces path security constraints
- Validates path structure and segments
- Prevents path traversal attacks

#### PathOperationsService (`services/fs/FileSystemService/PathOperationsService.ts`)
- Handles path joining and manipulation
- Normalizes paths across platforms
- Provides utility functions for path operations

## Testing Infrastructure

### Test Context

#### TestContext (`tests/utils/TestContext.ts`)
- Central test harness that provides access to all services
- Creates an isolated test environment for each test
- Provides methods for:
  - File operations (`writeFile`, `readFile`, etc.)
  - Path resolution (`resolveSpecialPath`)
  - Service management (`enableTransformation`, `disableTransformation`, etc.)
  - Environment variable management (`withEnvironment`)
  - CLI testing (`setupCliTest`)
  - Debug session management (`startDebugSession`, `endDebugSession`)
  - State visualization (`visualizeState`)

### File System Mocking

#### MemfsTestFileSystem (`tests/utils/MemfsTestFileSystem.ts`)
- In-memory file system for testing
- Implements the `IFileSystem` interface
- Provides methods for file operations (read, write, mkdir, etc.)
- Supports watching for file changes
- Initializes with a standard directory structure

#### MemfsTestFileSystemAdapter (`tests/utils/MemfsTestFileSystemAdapter.ts`)
- Adapts `MemfsTestFileSystem` for use with CLI tests
- Provides a consistent interface for file operations
- Handles path resolution for CLI contexts

### CLI Testing

#### cliTestHelper (`tests/utils/cli/cliTestHelper.ts`)
- Sets up a complete CLI test environment
- Provides methods for:
  - Creating test files
  - Setting environment variables
  - Mocking process.exit
  - Mocking console output
  - Verifying CLI behavior

#### mockProcessExit (`tests/utils/cli/mockProcessExit.ts`)
- Mocks `process.exit` for testing CLI exit behavior
- Captures exit codes for verification
- Prevents tests from actually exiting

#### mockConsole (`tests/utils/cli/mockConsole.ts`)
- Mocks console methods (log, error, warn, info)
- Captures console output for verification
- Supports testing CLI output formatting

### Test Data Management

#### ProjectBuilder (`tests/utils/ProjectBuilder.ts`)
- Creates mock "projects" in the in-memory file system
- Supports creating complex directory structures
- Useful for testing imports and path resolution

#### TestSnapshot (`tests/utils/TestSnapshot.ts`)
- Takes "snapshots" of the in-memory file system
- Compares snapshots to detect changes
- Useful for verifying file operations

#### FixtureManager (`tests/utils/FixtureManager.ts`)
- Loads test fixtures from JSON files
- Provides access to test data
- Supports creating complex test scenarios

### Node Factories

#### nodeFactories (`tests/utils/nodeFactories.ts`)
- Creates AST nodes for testing
- Supports creating directive, text, and code fence nodes
- Provides location information for source mapping

#### testFactories (`tests/utils/testFactories.ts`)
- Creates test data for various services
- Supports creating complex test scenarios
- Provides factory functions for common test patterns

### Debug Utilities

#### StateDebuggerService (`tests/utils/debug/StateDebuggerService/StateDebuggerService.ts`)
- Provides debug session management
- Captures state operations and transformations
- Generates debug reports
- Supports visualization of state changes

#### StateTrackingService (`tests/utils/debug/StateTrackingService/StateTrackingService.ts`)
- Tracks state relationships and dependencies
- Records metadata about state changes
- Helps debug scope and inheritance issues

#### StateVisualizationService (`tests/utils/debug/StateVisualizationService/StateVisualizationService.ts`)
- Generates visual representations of state
- Creates Mermaid/DOT graphs of state relationships
- Visualizes state metrics and transformations

#### StateHistoryService (`tests/utils/debug/StateHistoryService/StateHistoryService.ts`)
- Records chronological state changes
- Maintains operation history
- Enables state change replay and analysis

### Error Testing

#### ErrorTestUtils (`tests/utils/ErrorTestUtils.ts`)
- Provides utilities for testing error handling
- Supports verifying error types and messages
- Helps test error recovery scenarios

## Integration Points

### API Integration

The API (`api/index.ts`) integrates these utilities through:
- Service initialization via `createDefaultServices()`
- Service validation via `validateServicePipeline()`
- Error handling with proper type preservation
- Debug mode support

### Test Integration

Tests integrate these utilities through:
- `TestContext` for test setup and service access
- `MemfsTestFileSystem` for file operations
- Debug services for state visualization and tracking
- Error utilities for verifying error handling

## Usage Examples

### Setting Up a Basic Test

```typescript
import { TestContext } from '@tests/utils/TestContext';

describe('My Test', () => {
  let context: TestContext;
  
  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should process a file', async () => {
    // Write a test file
    await context.writeFile('/test.mld', '@text greeting = "Hello"');
    
    // Process the file
    const result = await context.services.interpreter.interpret(
      context.services.parser.parse('@text greeting = "Hello"')
    );
    
    // Verify the result
    expect(context.services.state.getTextVar('greeting')).toBe('Hello');
  });
});
```

### Setting Up a CLI Test

```typescript
import { TestContext } from '@tests/utils/TestContext';

describe('CLI Test', () => {
  let context: TestContext;
  
  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should handle CLI arguments', async () => {
    // Set up CLI test environment
    const { exitMock, consoleMocks } = await context.setupCliTest({
      files: {
        '/project/test.mld': '@text greeting = "Hello"'
      },
      env: {
        NODE_ENV: 'test'
      },
      mockExit: true,
      mockConsoleOutput: true
    });
    
    // Run CLI command
    process.argv = ['node', 'meld', '$./test.mld', '--stdout'];
    await cli.main();
    
    // Verify results
    expect(exitMock).not.toHaveBeenCalled();
    expect(consoleMocks.log).toHaveBeenCalledWith('Hello');
  });
});
```

### Using Debug Services

```typescript
import { TestContext } from '@tests/utils/TestContext';

describe('Debug Test', () => {
  let context: TestContext;
  let debugSessionId: string;
  
  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    
    // Start debug session
    debugSessionId = await context.startDebugSession({
      captureConfig: {
        capturePoints: ['pre-transform', 'post-transform'],
        includeFields: ['nodes', 'variables']
      }
    });
  });
  
  afterEach(async () => {
    // End debug session and get results
    const debugResult = await context.endDebugSession(debugSessionId);
    console.log('Debug operations:', debugResult.operations);
    
    await context.cleanup();
  });
  
  it('should track state changes', async () => {
    // Write and process a test file
    await context.writeFile('/test.mld', '@text greeting = "Hello"');
    await context.services.interpreter.interpret(
      context.services.parser.parse('@text greeting = "Hello"')
    );
    
    // Visualize state
    const visualization = await context.visualizeState();
    console.log('State visualization:', visualization);
  });
});
```
