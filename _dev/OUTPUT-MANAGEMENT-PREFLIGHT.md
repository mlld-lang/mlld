# Output Management Implementation - Preflight Context

**Issue:** [#85 Enhanced Command Output Management System](https://github.com/mlld-lang/mlld/issues/85)

## Overview

This document provides the essential "current state" context that a fresh Claude would need to implement the OUTPUT-MANAGEMENT-IMPLEMENTATION-PLAN.md, beyond what's already covered in CLAUDE.md.

## Current State Reference

### 1. Current executeCommand Method (Environment.ts)

The current implementation is basic and will be enhanced with rich error handling and output management:

```typescript
async executeCommand(command: string): Promise<string> {
  try {
    // Use project path as working directory if found, otherwise fall back to basePath
    const workingDirectory = await this.getProjectPath();
    
    const output = execSync(command, {
      encoding: 'utf8',
      cwd: workingDirectory,
      env: { ...process.env }
    });
    return output.trimEnd();
  } catch (error: any) {
    // Even on error, we might have output
    if (error.stdout) {
      return error.stdout.trimEnd();
    }
    throw new Error(`Command execution failed: ${error.message}`);
  }
}
```

**Key Points:**
- Single parameter: `command: string`
- No progress tracking or output control
- Generic `Error` throwing (not rich MlldError)
- No source context or error collection
- Simple execSync with basic options

**Implementation Plan Enhancement:**
This will be enhanced to accept `CommandExecutionOptions` and `CommandExecutionContext` parameters, and throw rich `MlldCommandExecutionError` instances with source location context.

### 2. Current CLI Option Parsing Pattern

The CLI already has extensive option parsing. New output management options will follow this existing pattern:

```typescript
// Current CLIOptions interface (excerpt showing pattern)
export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'markdown' | 'md' | 'xml';
  stdout?: boolean;
  verbose?: boolean;
  debug?: boolean;
  strict?: boolean;
  homePath?: string;
  watch?: boolean;
  // ... 40+ more options following this pattern
}

// Current parseArgs function pattern (excerpt)
function parseArgs(args: string[]): CLIOptions {
  // ... initialization
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--verbose':
        options.verbose = true;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--format':
        const format = args[++i];
        if (format !== 'markdown' && format !== 'md' && format !== 'xml') {
          throw new Error('--format must be "markdown", "md", or "xml"');
        }
        options.format = format;
        break;
      // ... more cases
    }
  }
  return options;
}
```

**Key Points:**
- Options interface uses optional properties with typed unions
- parseArgs uses switch statement with validation
- Options that take values use `args[++i]` pattern
- Validation throws descriptive errors
- Boolean flags are simple property assignments

**Implementation Plan Enhancement:**
New options like `--max-output-lines`, `--show-progress`, `--error-behavior` will follow this exact pattern.

### 3. Recently Implemented Error Formatting API

The error location system was recently completed and provides the foundation for command error integration:

```typescript
// Recently implemented error formatting API (available for integration)
const { ErrorFormatSelector } = await import('@core/utils/errorFormatSelector');
const formatter = new ErrorFormatSelector(fileSystem);

const formattedError = await formatter.formatForCLI(error, {
  useColors: true,
  useSourceContext: true,
  useSmartPaths: true,
  basePath: '/project/path',
  workingDirectory: process.cwd(),
  contextLines: 2
});

// Error formatting options interface
interface ErrorFormatOptions {
  useColors?: boolean;
  useSourceContext?: boolean;
  useSmartPaths?: boolean;
  basePath?: string;
  workingDirectory?: string;
  contextLines?: number;
}
```

**Key Points:**
- `ErrorFormatSelector` provides unified formatting for CLI and API
- Rich formatting with source context, line numbers, and arrows
- Smart path resolution shows relative paths when possible
- Configurable context lines and color support
- Already integrated into CLI error handling for other error types

**Implementation Plan Integration:**
Command execution errors will use this same formatting system for consistent rich error display across all mlld error types.

### 4. Current Run Evaluator Integration Point

The run evaluator currently calls executeCommand without any context:

```typescript
// Current run evaluator implementation (excerpt from interpreter/eval/run.ts)
export async function evaluateRun(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  let output = '';
  
  if (directive.subtype === 'runCommand') {
    const commandNodes = directive.values?.identifier || directive.values?.command;
    if (!commandNodes) {
      throw new Error('Run command directive missing command');
    }
    
    const command = await interpolate(commandNodes, env);
    
    // Current call - no context passed
    output = await env.executeCommand(command);
    
  } else if (directive.subtype === 'runCode') {
    // ... similar pattern for code execution
  }
  
  return { output };
}
```

**Key Points:**
- Simple call: `env.executeCommand(command)`
- No source context passed to Environment
- Directive contains `location` property with source information
- Run evaluator has access to `DirectiveNode` with file/line context

**Implementation Plan Enhancement:**
This will be updated to pass execution context with source location:
```typescript
const executionContext = {
  sourceLocation: directive.location,
  directiveNode: directive,
  filePath: env.getCurrentFilePath(),
  directiveType: directive.directiveType || 'run'
};

output = await env.executeCommand(command, undefined, executionContext);
```

### 5. Current Error Handling Flow

Errors currently flow from Environment through the interpreter to CLI:

```typescript
// Current error handling in CLI (excerpt from cli/index.ts)
async function handleError(error: any, options: CLIOptions): Promise<void> {
  const isMlldError = error instanceof MlldError;
  const severity = isMlldError ? error.severity : ErrorSeverity.Fatal;

  if (isMlldError) {
    const fileSystem = new NodeFileSystem();
    const errorFormatter = new ErrorFormatSelector(fileSystem);
    
    try {
      const result = await errorFormatter.formatForCLI(error, {
        useColors: true,
        useSourceContext: true,
        useSmartPaths: true,
        basePath: path.resolve(path.dirname(options.input))
      });
      
      console.error('\n' + result + '\n');
    } catch (formatError) {
      // Fallback formatting...
    }
  }
  
  if (severity === ErrorSeverity.Fatal) {
    process.exit(1);
  }
}
```

**Key Points:**
- CLI already handles `MlldError` instances with rich formatting
- Uses `ErrorFormatSelector` for consistent display
- Has fallback formatting for edge cases
- Respects error severity for exit codes

**Implementation Plan Integration:**
Command execution errors will become `MlldCommandExecutionError` instances that flow through this existing error handling pipeline, receiving the same rich formatting treatment.

### 6. Current Environment Class Structure

The Environment class will be enhanced but maintains its existing responsibilities:

```typescript
// Current Environment class core structure
export class Environment {
  private variables = new Map<string, MlldVariable>();
  private nodes: MlldNode[] = [];
  private parent?: Environment;
  private urlCache: Map<string, { content: string; timestamp: number; ttl?: number }> = new Map();
  private currentFilePath?: string;
  
  constructor(
    private fileSystem: IFileSystemService,
    private pathService: IPathService,
    private basePath: string,
    parent?: Environment
  ) {
    this.parent = parent;
  }
  
  // Core methods that executeCommand enhancement will build upon
  async getProjectPath(): Promise<string> { /* ... */ }
  setCurrentFilePath(filePath: string): void { /* ... */ }
  getCurrentFilePath(): string | undefined { /* ... */ }
}
```

**Key Points:**
- Environment already tracks file context (`currentFilePath`)
- Has access to file system and path services
- Maintains parent/child relationships for nested environments
- Already has project path resolution

**Implementation Plan Enhancement:**
Will add:
- `outputOptions: CommandExecutionOptions` property
- `collectedErrors: CollectedError[]` property  
- `setOutputOptions()`, `collectError()`, `displayCollectedErrors()` methods
- Enhanced `executeCommand()` signature with options and context

## Implementation Readiness

### What's Already Available:
- ✅ **Rich error formatting system** - `ErrorFormatSelector` and `ErrorDisplayFormatter`
- ✅ **Source location types** - `SourceLocation` interface from recent type unification
- ✅ **CLI option parsing patterns** - Established patterns for validation and parsing
- ✅ **Error handling pipeline** - CLI already handles `MlldError` instances richly
- ✅ **Environment structure** - Context tracking and file system integration
- ✅ **Test infrastructure** - Fixture-based testing with markdown test definitions

### What Needs Implementation:
- 🔄 **MlldCommandExecutionError class** - New error type for command failures
- 🔄 **Enhanced executeCommand method** - Options, context, and error collection
- 🔄 **CLI integration** - New options for output management
- 🔄 **Run evaluator updates** - Pass source context to Environment
- 🔄 **Configuration support** - Output-specific config options
- 🔄 **Comprehensive testing** - Unit and integration tests for new functionality

## Key Dependencies

### Required Imports for Implementation:
```typescript
// For enhanced error handling
import { MlldCommandExecutionError } from '@core/errors';
import { ErrorFormatSelector } from '@core/utils/errorFormatSelector';
import type { SourceLocation, DirectiveNode } from '@core/types';

// For CLI integration  
import { MlldError, ErrorSeverity } from '@core/errors/MlldError';

// For configuration
import type { ResolvedOutputConfig } from '@core/config/types';
```

### Files That Will Be Modified:
- `core/errors/MlldCommandExecutionError.ts` - **NEW**
- `core/errors/index.ts` - Add export
- `interpreter/env/Environment.ts` - Enhance executeCommand
- `interpreter/eval/run.ts` - Pass context
- `cli/index.ts` - Add CLI options and error handling
- `interpreter/index.ts` - Pass options to Environment
- `core/config/types.ts` - Add output configuration
- `core/config/loader.ts` - Load output config

## Success Validation

The implementation will be successful when:

1. **Command errors show rich source context:**
   ```
   ❌ Command execution failed: npm test
   
     ./demo.mld:23:1
     22 | @text user = "Alice"  
     23 | @run [npm test]
         |      ^^^^^^^^ command failed here
     24 | @text final = "done"
   
   Details:
     exitCode: 1
     duration: 2.1s
   💡 Run with --verbose to see test details
   ```

2. **CLI options work as specified:**
   ```bash
   mlld demo.mld --error-behavior continue --collect-errors --show-command-context
   ```

3. **Configuration file integration:**
   ```json
   {
     "output": {
       "showCommandContext": true,
       "collectErrors": true,
       "errorFormatting": {
         "contextLines": 3
       }
     }
   }
   ```

4. **All existing functionality continues to work unchanged**

This preflight context provides the essential current state information needed to implement the comprehensive output management system while building on the recently completed error location system foundation.