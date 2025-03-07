# Error and CLI Output System Proposal

## Overview

This document outlines a vision for a comprehensive error handling and CLI output system for Meld that provides a consistent, user-friendly terminal experience. The goal is to enhance the existing `OutputService` by adding capabilities for controlled terminal output, rich error reporting, command execution feedback, and configurable verbosity levels.

## Current State

Meld currently has several output-related components:

1. **Logging**: Winston-based logger with different levels controlled by environment variables and CLI flags.
2. **Error Display**: `ErrorDisplayService` showing source location with context and highlighting.
3. **Run Command Output**: Direct stdout/stderr capture with basic animation feedback.
4. **CLI Options**: Support for `--verbose`, `--debug`, and `--stdout` flags.
5. **OutputService**: Currently focused on content transformation of Meld nodes to the final output format.

## Limitations and Issues

1. **Inconsistent Verbosity Control**: Multiple approaches to controlling verbosity spread across the codebase.
2. **Run Directive Output**: Currently shows too much detail for commands in standard mode, with animation that can clutter the terminal.
3. **Command Progress**: No standardized way to handle progress indicators from executed commands.
4. **Output Destination Confusion**: The `--stdout` flag controls file destination rather than verbosity, causing potential confusion.
5. **Output Capture**: No centralized way to capture and control all output streams (stdout, stderr, console.log, etc.).

## Vision for the New System

### 1. Enhanced Output System Architecture

Extend the existing `OutputService` with a companion `ConsoleOutputService` for terminal output control:

```
┌─────────────────────────────────────────────────────┐
│                  OutputSystem                        │
├───────────────────────────┬─────────────────────────┤
│       OutputService       │    ConsoleOutputService  │
│  (Content transformation) │   (Terminal interaction) │
└───────────────────────────┴─────────────────────────┘
                 ▲                        ▲
                 │                        │
┌────────────────┴──────────┐   ┌─────────┴────────────┐
│ Content Processing Pipeline│   │ Stream Capture Layer │
└───────────────────────────┘   └──────────────────────┘
```

The `ConsoleOutputService` wraps and intercepts all console output including:
- console.log/warn/error calls
- process.stdout/stderr writes
- Winston logger output
- Error messages

### 2. Stream Interception Layer

The core innovation of this system is a Stream Interception Layer that captures and controls all console output:

```typescript
// Stream interception implementation
class StreamCaptureLayer {
  private originalStdout: NodeJS.WriteStream;
  private originalStderr: NodeJS.WriteStream;
  private originalConsoleMethods: Record<string, Function>;
  
  constructor(private consoleOutput: ConsoleOutputService) {
    // Store original streams and methods
    this.originalStdout = process.stdout;
    this.originalStderr = process.stderr;
    this.originalConsoleMethods = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    
    // Install the intercepts
    this.interceptConsole();
    this.interceptStreams();
  }
  
  // Restore original methods when done
  dispose() {
    this.restoreConsole();
    this.restoreStreams();
  }

  private interceptConsole() {
    // Replace console methods with filtered versions
    console.log = (...args: any[]) => {
      this.consoleOutput.processOutput('log', args);
    };
    // Similar replacements for error, warn, info
  }

  private interceptStreams() {
    // Create custom write methods for stdout/stderr
    const oldStdoutWrite = process.stdout.write;
    process.stdout.write = (
      buffer: string | Uint8Array,
      ...args: any[]
    ): boolean => {
      // Process through the output service
      return this.consoleOutput.processStreamOutput(
        'stdout', 
        buffer, 
        oldStdoutWrite.bind(process.stdout),
        ...args
      );
    };
    // Similar approach for stderr
  }
}
```

### 3. Verbosity Levels

Implement a clear hierarchy of verbosity levels:

- `--silent`: No output except fatal errors
- (default): Summary output with errors and key status updates
- `--verbose`: Detailed output including all warnings and info messages
- `--debug`: Complete diagnostic information including state transformations

### 4. ConsoleOutputService

The `ConsoleOutputService` manages all terminal output:

```typescript
interface IConsoleOutputService {
  // Set verbosity level for the entire process
  setVerbosity(level: VerbosityLevel): void;
  
  // Process output from various sources
  processOutput(level: LogLevel, args: any[]): void;
  processStreamOutput(stream: 'stdout'|'stderr', data: any, original: Function, ...args: any[]): boolean;
  
  // Error handling with rich formatting
  displayError(error: MeldError, options?: ErrorDisplayOptions): void;
  
  // Command execution feedback
  startCommand(command: string): CommandRunner;
  
  // Status updates
  updateStatus(message: string, options?: StatusOptions): void;
  
  // Progress tracking
  createProgressTracker(options?: ProgressOptions): ProgressTracker;
}
```

### 5. Run Command Output Enhancement

For `@run` directives:

- **Default Mode**: Show a single-line progress indicator with command name and status
- **Completion Summary**: Show command exit code and truncated output (first/last few lines)
- **Verbose Mode**: Show real-time command output with clear separation between commands
- **Silent Mode**: Suppress all command output while still capturing for transformation

Example default output:
```
▶ Running tests... DONE ✓ (2s)
```

Example verbose output:
```
▶ Running: npm test
TAP version 13
1..5
ok 1 - test one
ok 2 - test two
...
ok 5 - test five

▶ Command completed with exit code 0 (2.4s)
```

### 6. Rich Error Visualization

Enhance the existing `ErrorDisplayService` with:

- Color-coded severity levels
- Improved source context with line numbers for surrounding lines
- Optional stacktrace visualization for debugging
- Grouping of related errors
- Smart deduplication with counts for repeated errors

Example:
```
ERROR in example.meld:25:3

  23 | @define name = "world"
  24 | 
→ 25 | @run echo Hello, ${naem}
     |                    ^^^^
  26 | 
  27 | Output of the command:

Variable not found: 'naem'. Did you mean 'name'?
```

### 7. Progress Indicators

Standardize progress reporting with:

- Activity spinners for long-running operations
- Command execution status tracking
- Overall workflow progress visualization
- Time elapsed for operations

### 8. Use of Existing Libraries

Leverage these libraries to create a cohesive UX:

1. **[chalk](https://www.npmjs.com/package/chalk)**: Already used for colorization
2. **[ora](https://www.npmjs.com/package/ora)**: Elegant terminal spinners
3. **[cli-table3](https://www.npmjs.com/package/cli-table3)**: Formatted data output
4. **[boxen](https://www.npmjs.com/package/boxen)**: Box drawing for important notices
5. **[log-update](https://www.npmjs.com/package/log-update)**: Non-flickering terminal updates

### 9. Command-Line Integration

Standardize CLI options with clear naming patterns:

```
--silent               Suppress all non-essential output
--stdout               Output final result to stdout instead of file
--stdout --silent      Output only the final result with no progress info
--verbose, -v          Show detailed output (commands, warnings, etc.)
--debug, -d            Show complete debug information
--debug-[component]    Component-specific debugging (as currently implemented)
```

## Implementation Strategy

1. **Phase 1**: Implement the `ConsoleOutputService` and stream capture layer
2. **Phase 2**: Integrate with the existing `OutputService` to maintain clean separation of concerns
3. **Phase 3**: Refactor `RunDirectiveHandler` to use the new output control system
4. **Phase 4**: Enhance the `ErrorDisplayService` with improved formatting
5. **Phase 5**: Add progress tracking and visualization components

The new system should follow Meld's dependency injection pattern:

```typescript
interface IConsoleOutputService {
  setVerbosity(level: VerbosityLevel): void;
  displayError(error: MeldError, options?: ErrorDisplayOptions): void;
  updateStatus(message: string, options?: StatusOptions): void;
  startCommand(command: string): CommandRunner;
  createProgressTracker(options?: ProgressOptions): ProgressTracker;
  // ...
}

interface CommandRunner {
  start(): void;
  update(status: string): void;
  succeed(output?: string): void;
  fail(error?: Error | string): void;
}

interface ProgressTracker {
  update(percent: number, message?: string): void;
  increment(amount?: number): void;
  succeed(message?: string): void;
  fail(message?: string): void;
}
```

## Benefits

1. **Improved User Experience**: Clear, concise output with appropriate detail based on verbosity
2. **Consistency**: Unified approach to all terminal output
3. **Developer-Friendly**: Clear status updates during complex operations
4. **Reduced Confusion**: Better separation between progress feedback and actual content
5. **Complete Control**: Intercepts and manages all output streams to ensure consistent presentation
6. **Extensibility**: New output formats can be added without changing consumers

## Backwards Compatibility

- Maintain support for existing CLI flags 
- Winston logger output gets routed through the new system without requiring changes to logging calls
- Existing error display mechanisms can be gradually migrated

## Technical Considerations

### 1. Stream Interception Safety

The stream interception approach needs careful implementation:

- Never lose output data if the system crashes
- Properly restore original streams during shutdown
- Handle asynchronous writes correctly
- Account for binary data in streams

### 2. Winston Integration 

Winston logger can be integrated with the system:

```typescript
// Create a custom transport for Winston that pipes through ConsoleOutputService
class OutputServiceTransport extends Transport {
  constructor(private consoleOutput: IConsoleOutputService) {
    super();
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Route through the output service instead of directly to console
    this.consoleOutput.processOutput(info.level, [info.message]);
    
    callback();
  }
}

// Add this transport to the existing Winston logger
logger.add(new OutputServiceTransport(consoleOutputService));
```

### 3. Test Environment Handling

The system should gracefully handle test environments:

- Detect Jest/Vitest environment and adjust behavior
- Provide mocks for testing components that use the output system
- Capture output during tests for verification without sending to terminal

## Examples

### Error with suggested fix:
```
ERROR: Cannot access 'data.items[2]' in example.meld:12:5
  
  10 | @define data = {
  11 |   items: ["first"]
→ 12 | }
     | 
  13 | 
  14 | @text value = ${data.items[2]}

Array index out of bounds: array 'data.items' has 1 element but index 2 was accessed.
Suggestion: Check your array length or use an index within bounds (0-0).
```

### Run command with progress (default mode):
```
▶ Parsing example.meld
▶ Running eslint... DONE ✓ (0.8s)
▶ Running tests... DONE ✓ (3.2s) 
▶ Building output... DONE ✓ (0.5s)
⚠ 2 warnings during processing (use --verbose to see details)
✓ Output written to example.o.md
```

### Same output in verbose mode:
```
▶ Parsing example.meld
  - Resolving imports...
  - Processing directives...
  - Validating structure...

▶ Running: eslint src/ --fix
src/components/App.js
  17:5  warning  Unexpected console statement  no-console

1 file checked, 1 warning found, 0 errors found

▶ Command completed with exit code 0 (0.8s)

▶ Running: npm test
TAP version 13
1..3
ok 1 - components/App.test.js
ok 2 - utils/format.test.js
ok 3 - utils/validate.test.js

3 tests passed (3.2s)
▶ Command completed with exit code 0

▶ Building output...
  - Resolving variables: 12 resolved
  - Applying transformations: 4 directives processed
  - Generating final output: 2.5KB

⚠ Warning at line 17: Unused variable 'count'
⚠ Warning at line 23: Command 'docker' not found, skipping

✓ Output written to example.o.md (2.5KB)
```

## Conclusion

The proposed enhanced output system will provide a cohesive, user-focused command line experience that scales appropriately from silent operation to detailed debugging. By building on Meld's existing architecture while adding a comprehensive stream capture layer, it ensures complete control over all console output. This approach provides both improved UX and maintains the separation of concerns between content processing (the existing OutputService) and terminal interaction (the new ConsoleOutputService).