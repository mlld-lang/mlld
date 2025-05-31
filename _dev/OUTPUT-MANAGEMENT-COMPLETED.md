# Output Management Implementation - COMPLETED

This document tracks the implementation of enhanced output management for mlld command execution.

## Overview

Implemented a comprehensive output management system with the following features:
- Progress indicators for command execution
- Output truncation for long command outputs
- Error collection and rich error display
- Configuration support
- CLI options
- Source location tracking for errors

## Implementation Details

### 1. MlldCommandExecutionError Class ✅
- Created `core/errors/MlldCommandExecutionError.ts`
- Extends `MlldInterpreterError` with command-specific details
- Includes source location, exit code, duration, stdout/stderr
- Static factory method for easy creation

### 2. Enhanced Environment.executeCommand ✅
- Added `CommandExecutionOptions` interface for runtime control
- Added `CommandExecutionContext` for source tracking
- Progress display with emoji indicators
- Output truncation with line counting
- Error collection for batch display
- Rich error creation with source context

### 3. Error Collection Infrastructure ✅
- `CollectedError` type for tracking errors
- `collectError()` method for accumulating errors
- `displayCollectedErrors()` with rich formatting
- Integration with ErrorFormatSelector for consistent display

### 4. Run Evaluator Updates ✅
- Updated `interpreter/eval/run.ts` to pass execution context
- Source location tracking for all command types
- Context includes directive type and file path

### 5. CLI Options ✅
Added new CLI flags:
- `--max-output-lines <n>` - Limit output lines (default: 50)
- `--show-progress` / `--no-progress` - Toggle progress display
- `--error-behavior <halt|continue>` - Error handling mode
- `--collect-errors` - Batch error display
- `--show-command-context` - Enhanced error context

### 6. Configuration Support ✅
Added to `core/config/types.ts`:
```typescript
export interface OutputConfig {
  showProgress?: boolean;
  maxOutputLines?: number;
  errorBehavior?: 'halt' | 'continue';
  collectErrors?: boolean;
  progressStyle?: 'emoji' | 'text';
  preserveFullOutput?: boolean;
  logOutputToFile?: boolean;
  showCommandContext?: boolean;
  errorFormatting?: {
    useColors?: boolean;
    useSourceContext?: boolean;
    contextLines?: number;
    showCommandDetails?: boolean;
  };
}
```

### 7. Config Loader Updates ✅
- Added `mergeOutputConfig()` method
- Added `resolveOutputConfig()` method
- Proper precedence: CLI > Project > Global

### 8. Interpreter Integration ✅
- Added `outputOptions` to `InterpretOptions`
- Pass options to Environment
- Display collected errors after evaluation

### 9. Tests ✅
- Unit tests for MlldCommandExecutionError
- Integration tests for output management
- Tests cover all major features

## Usage Examples

### CLI Usage
```bash
# Limit output and collect errors
mlld --max-output-lines 20 --collect-errors --error-behavior continue input.mld

# Disable progress, show full command context on errors
mlld --no-progress --show-command-context input.mld

# Halt on first error with verbose context
mlld --error-behavior halt --verbose input.mld
```

### Configuration File
```json
{
  "output": {
    "showProgress": false,
    "maxOutputLines": 100,
    "errorBehavior": "continue",
    "collectErrors": true,
    "showCommandContext": true,
    "errorFormatting": {
      "contextLines": 3,
      "useColors": true
    }
  }
}
```

### Error Output Example
```
❌ Command execution failed: npm test
   
   Location: /project/example.mld:15:1
   
   15 | @run [npm test]
      | ^^^^^^^^^^^^^^^
   
   Exit code: 1
   Duration: 2.3s
   Working directory: /project
   
   Details:
   ├─ stdout: Running tests...
   │          FAIL: Test suite failed
   └─ stderr: Error: Test assertion failed
   
   💡 Use --verbose to see full command output
```

## Future Enhancements

1. **Streaming Output**: Display command output in real-time
2. **Output Logging**: Save full output to log files
3. **Custom Progress Styles**: Support for different progress indicators
4. **Output Filters**: Regex-based output filtering
5. **Error Summaries**: Grouped error display by type
6. **Performance Metrics**: Track and display command execution times

## Migration Guide

For users upgrading:
1. Default behavior remains the same (progress shown, 50 line limit)
2. Use `--no-progress` to disable progress indicators
3. Use `--max-output-lines 0` for unlimited output
4. Configure defaults in `mlld.config.json`