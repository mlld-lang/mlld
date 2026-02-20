# Shadow Environment Architecture

Shadow environments in mlld provide a bridge between mlld's declarative syntax and imperative JavaScript/Node.js code. This document explains the internal architecture and implementation details.

## Language Support

**Currently Implemented**:
- ✅ **JavaScript** (`js`): In-process execution with function injection
- ✅ **Node.js** (`node`): VM-isolated execution with function injection
- ✅ **Python** (`py`/`python`): Subprocess execution with function injection

**Not Implemented**:
- ❌ **Bash** (`bash`): Only supports variable injection, no function calls
- ❌ **Shell** (`sh`): No shadow environment support

## Overview

Shadow environments allow mlld `/exec` functions to be called from within JavaScript or Node.js code blocks. This creates a seamless integration where mlld functions become available as regular functions in the target language.

## Architecture Comparison

### JavaScript Shadow Environment

**Location**: `interpreter/env/Environment.ts`

**Architecture**:
- **Storage**: Uses `Map<string, Map<string, any>>` in `shadowEnvs` property
- **Execution**: In-process using `new Function()`
- **Isolation**: None - runs in the same process
- **Performance**: Fast - no overhead

**Key implementation details**:
```typescript
// Storage in Environment class
private shadowEnvs: Map<string, Map<string, any>> = new Map();

// Setting shadow environment (simplified)
setShadowEnv(language: string, functions: Map<string, any>): void {
  this.shadowEnvs.set(language, functions);
}

// Execution with shadow functions (simplified)
const shadowEnv = this.getShadowEnv('js') || this.getShadowEnv('javascript');
const mergedParams = { ...Object.fromEntries(shadowEnv || []), ...params };
```

### Node.js Shadow Environment

**Location**: `interpreter/env/NodeShadowEnvironment.ts`, wired via `Environment` node shadow provider and used by command executors

**Architecture**:
- **Storage**: Dedicated `NodeShadowEnvironment` class instance
- **Execution**: VM module with isolated context
- **Isolation**: Full VM context isolation
- **Performance**: Slightly slower due to VM overhead

### Python Shadow Environment

**Location**: `interpreter/env/PythonShadowEnvironment.ts`, wired via `Environment` python shadow provider

**Architecture**:
- **Storage**: Dedicated `PythonShadowEnvironment` class storing function code and param names
- **Execution**: Subprocess execution with function definitions injected
- **Isolation**: Full process isolation via subprocess
- **Performance**: Slowest due to subprocess overhead, but supports streaming output

**Key implementation details**:
```typescript
export class NodeShadowEnvironment {
  private context: vm.Context;
  private shadowFunctions: Map<string, Function>;
  
  constructor(basePath: string, currentFile?: string) {
    // Create VM context with controlled globals
    this.context = vm.createContext({
      console,
      process,
      require,
      module,
      exports,
      __dirname,
      __filename,
      // ... other Node.js globals
      __mlldShadowFunctions: this.shadowFunctions
    });
  }
  
  async execute(code: string, params?: Record<string, any>): Promise<any> {
    // Execution in isolated context
    const script = new vm.Script(wrappedCode, {
      filename: this.currentFile || 'node-shadow-env'
    });
    return await script.runInContext(execContext);
  }
}
```

**Python key implementation details**:
```typescript
export class PythonShadowEnvironment {
  private shadowFunctions: Map<string, { code: string; paramNames: string[] }> = new Map();

  async addFunction(name: string, code: string, paramNames: string[] = []): Promise<void> {
    this.shadowFunctions.set(name, { code, paramNames });
  }

  generateFunctionDefinitions(): string {
    let definitions = '';
    for (const [name, { code, paramNames }] of this.shadowFunctions) {
      const paramStr = paramNames.join(', ');
      const indentedCode = code.split('\n')
        .map(line => line.trim() ? '    ' + line : '')
        .join('\n');
      definitions += `def ${name}(${paramStr}):\n${indentedCode}\n\n`;
    }
    return definitions;
  }

  async execute(code: string, params?: Record<string, any>): Promise<string> {
    // Inject function definitions + params + user code
    // Execute via subprocess: python3 tmpfile.py
  }
}
```

**Python execution with streaming**:
```typescript
// In PythonExecutor - streaming output support
const child = spawn('python3', [tmpFile], {
  cwd: workingDirectory,
  env: { ...process.env },
  stdio: ['pipe', 'pipe', 'pipe']
});

child.stdout.on('data', (data: Buffer) => {
  const text = stdoutDecoder.write(data);
  stdoutBuffer += text;
  emitChunk(text, 'stdout');  // Emit to StreamBus
});
```

## Implementation Flow

### 1. Shadow Environment Creation (`exec.ts`)

When `/exec @lang = { func1, func2 }` is evaluated:

```typescript
// In evaluateExec function
if (directive.subtype === 'environment') {
  const shadowFunctions = new Map<string, any>();
  
  for (const ref of envRefs) {
    const funcName = ref.identifier;
    const funcVar = env.getVariable(funcName);
    
    // Create wrapper function
    const wrapper = createExecWrapper(funcName, funcVar, env);
    shadowFunctions.set(funcName, wrapper);
  }
  
  // Store in environment
  env.setShadowEnv(language, shadowFunctions);
}
```

### 2. Function Wrapping

The wrapping strategy differs between JavaScript and Node.js shadow environments:

#### JavaScript Sync Wrapper (`createSyncJsWrapper`)

For JavaScript shadow functions, we create synchronous wrappers that include ALL shadow functions in their scope:

```typescript
function createSyncJsWrapper(
  funcName: string,
  definition: CodeExecutable,
  env: Environment
): Function {
  return function(...args: any[]) {
    // Get ALL shadow functions from the environment
    const shadowEnv = env.getShadowEnv('js') || env.getShadowEnv('javascript');
    const shadowNames: string[] = [];
    const shadowValues: any[] = [];
    
    if (shadowEnv) {
      for (const [name, func] of shadowEnv) {
        shadowNames.push(name);
        shadowValues.push(func);
      }
    }
    
    // Create function with params AND all shadow functions
    const allParamNames = [...paramNames, ...shadowNames];
    const allParamValues = [...paramValues, ...shadowValues];
    
    const fn = new Function(...allParamNames, functionBody);
    return fn(...allParamValues);
  };
}
```

**Key architectural decision**: Each shadow function wrapper includes references to ALL other shadow functions in its scope. This enables any shadow function to call any other shadow function without async/await.

#### Trade-offs of This Approach

**Pros:**
- ✅ Enables nested function calls (e.g., `calculate` calling `add` and `multiply`)
- ✅ No async/await required - crucial for web compatibility
- ✅ Simple implementation that "just works"
- ✅ Functions behave like regular JavaScript functions

**Cons:**
- ❌ Each function carries references to all shadow functions (even unused ones)
- ❌ Potential for circular reference issues if not careful
- ❌ Slightly more memory usage per function
- ❌ Functions must be defined before the shadow environment that contains them

**Alternative approaches considered:**
1. **Static analysis**: Analyze which functions each shadow function calls and only include those
   - Too complex and would require parsing the function body
2. **Lazy loading**: Load shadow functions on demand
   - Would require proxy objects and complicate the mental model
3. **Single shared context**: Create one function with all shadow functions
   - Would lose individual function identity and parameter handling

### 3. Code Execution (`Environment.executeCode`)

#### JavaScript Execution:
```typescript
// Console capture
let output = '';
const originalLog = console.log;
console.log = (...args: any[]) => {
  output += args.map(arg => String(arg)).join(' ') + '\n';
};

// Merge shadow functions with parameters
const shadowEnv = this.getShadowEnv('js');
const mergedParams = { ...Object.fromEntries(shadowEnv), ...params };

// Create and execute function
const func = new Function(...Object.keys(mergedParams), code);
const result = await func(...Object.values(mergedParams));

// Restore console and return
console.log = originalLog;
```

#### Node.js Execution:
```typescript
const nodeShadowEnv = this.getNodeShadowEnv();

if (nodeShadowEnv) {
  // Use VM-based execution
  const result = await nodeShadowEnv.execute(code, params);
  // Format result (JSON stringify objects)
  return formatResult(result);
} else {
  // Fall back to subprocess execution
  return this.executeNodeSubprocess(code, params);
}
```

## Key Design Decisions

### Why Two Different Architectures?

1. **JavaScript**: Optimized for speed and simplicity
   - No isolation needed for simple calculations
   - Synchronous execution is often sufficient
   - Lower overhead for frequent calls

2. **Node.js**: Optimized for isolation and full API access
   - VM provides security boundaries
   - Full Node.js API access (fs, http, etc.)
   - Better error handling and stack traces

### Why VM for Node.js?

1. **Module Isolation**: Each mlld file gets its own module context
2. **Resource Control**: Can limit what globals are available
3. **Error Boundaries**: Better error containment
4. **Consistency**: Matches Node.js's own module system

### Why Not VM for JavaScript?

1. **Performance**: `new Function()` is significantly faster
2. **Simplicity**: No need for complex context management
3. **Use Case**: JavaScript shadow env is for simple computations
4. **Browser Compatibility**: Future browser support would use similar approach

## Usage Patterns

### Basic Shadow Function Creation

```mlld
>> Simple JavaScript function
/exe @double(x) = /run js {return x * 2}

>> Node.js function with modules
/exe @hash(text) = /run node {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

>> Python function
/exe @add(a, b) = py {
return int(a) + int(b)
}
```

### Environment Declaration

```mlld
>> JavaScript environment
/exe @js = { double, triple, square }

>> Node.js environment
/exe @node = { hash, readFile, fetchUrl }

>> Python environment
/exe @py = { add, multiply, calculate }
```

### Cross-Function Calls

Shadow functions can call each other within the same environment:

```mlld
/exe @add(a, b) = js {a + b}
/exe @multiply(x, y) = js {x * y}

>> First shadow env declaration (needed for calculate to access add/multiply)
/exe @js = { add, multiply }

/exe @calculate(n) = js {
  // calculate can now call add and multiply
  const sum = add(n, 10);
  const product = multiply(sum, 2);
  return product;
}

>> Update shadow env to include calculate
/exe @js = { add, multiply, calculate }

/run js {
  // All functions available here
  console.log(add(5, 3));        // outputs: 8
  console.log(calculate(5));     // outputs: 30 ((5+10)*2)
}
```

**Important**: The shadow environment must be declared before functions that use other shadow functions. This is why we declare `/exec @js = { add, multiply }` before defining `calculate`.

## Performance Considerations

### JavaScript Shadow Environment
- **Function Creation**: Minimal overhead, but each wrapper includes all shadow functions
- **Execution**: Direct function calls via `new Function()`
- **Memory**: Each function wrapper holds references to all shadow functions in the environment
- **Trade-off**: Memory for simplicity - acceptable for typical use cases with <100 functions

### Node.js Shadow Environment
- **VM Context Creation**: One-time cost per mlld file
- **Execution**: VM script execution overhead
- **Memory**: Full VM context maintained per file
- **Isolation**: Complete separation from main process

## Security Considerations

### JavaScript
- **Access**: Full access to Node.js process
- **Isolation**: None - relies on mlld's trust model
- **Risk**: Low for typical use cases

### Node.js
- **Access**: Controlled via VM context
- **Isolation**: Separate context per mlld file
- **Risk**: Mitigated by VM boundaries


## Shadow Environment Imports and Lexical Scoping

### The Problem

Prior to rc20, shadow environments were dynamically scoped - they were only available in the environment where they were defined. This caused issues when importing modules:

```mlld
# github.mld - Module with shadow functions
/exe @github_request(@method, @endpoint) = js {
  // Make API request...
  return data;
}

/exe @js = { github_request }

/exe @pr_view(@number) = js {
  // This works in github.mld
  return github_request('GET', `/pulls/${number}`);
}

/var @github = { pr: { view: @pr_view } }
```

```mlld
# app.mld - Importing the module
/import { github } from "./github.mld"

# This would fail with "github_request is not defined"
/var @pr = @github.pr.view(123)
```

### The Solution: Lexical Scoping

As of rc20, shadow environments are captured at function definition time and preserved through imports. This implements lexical scoping - functions retain access to their original shadow environment context.

### Implementation Architecture

**New Components**:
- `ShadowEnvironmentCapture` interface - stores captured shadow environments
- `shadowEnvResolver.ts` - resolves shadow environments with lexical/dynamic fallback
- Metadata preservation through import/export system
- `VariableImporter.processModuleExports` serializes captured shadow environments alongside exported executables so imported functions retain access to their original helpers.

**Key Changes**:
1. **Capture at Definition**: When an executable is created, shadow environments are captured
2. **Metadata Storage**: Captured environments stored in executable metadata
3. **Resolution Priority**: Captured (lexical) environments take precedence over current (dynamic)
4. **Import Preservation**: Metadata including captured environments preserved through imports

### How It Works

1. **Function Definition** (in module):
   ```typescript
   // When /exe @pr_view(...) is evaluated
   const variable = createExecutableVariable(
     identifier,
     executableDef.type,
     // ... other params
     {
       definedAt: location,
       executableDef,
       // Capture current shadow environments
       capturedShadowEnvs: env.captureAllShadowEnvs()
     }
   );
   ```

2. **Import Processing**:
   - Variable metadata including `capturedShadowEnvs` is serialized
   - Maps are converted to objects for JSON compatibility
   - On import, objects are deserialized back to Maps

3. **Execution** (after import):
   ```typescript
   // Shadow environment resolution with fallback
   const shadowEnv = resolveShadowEnvironment(
     language,
     capturedEnvs,  // From metadata (lexical)
     currentEnv      // Current environment (dynamic)
   );
   ```

### Usage Example

```mlld
# math-utils.mld - Module with helper functions
/exe @double(x) = js { return x * 2; }
/exe @triple(x) = js { return x * 3; }

# Shadow environment must be declared BEFORE functions that use it
/exe @js = { double, triple }

/exe @calculate(@n) = js {
  // These shadow functions are now captured
  return double(n) + triple(n);
}

/var @math = { calculate: @calculate }
```

```mlld
# app.mld - Import and use
/import { math } from "./math-utils.mld"

# This now works! calculate retains access to double/triple
/var @result = @math.calculate(10)  # Returns 50 (20 + 30)
```

### Technical Details

**Map Serialization**: Shadow environments use Maps internally but must be serialized to JSON for import/export:
```typescript
// Serialization (Map → Object)
private serializeShadowEnvs(envs: ShadowEnvironmentCapture): any {
  const result: any = {};
  for (const [lang, shadowMap] of Object.entries(envs)) {
    if (shadowMap instanceof Map && shadowMap.size > 0) {
      const obj: Record<string, any> = {};
      for (const [name, func] of shadowMap) {
        obj[name] = func;
      }
      result[lang] = obj;
    }
  }
  return result;
}
```

**Node.js Integration**: The `NodeShadowEnvironment` class includes a `mergeCapturedFunctions` method to apply captured shadow functions to the VM context during execution.

## Testing Shadow Environments

Test cases for shadow environments can be found in:
- `tests/cases/valid/exec/`: General exec and shadow environment tests
- `tests/cases/valid/exec-shadow-env-import/`: Shadow environment import fixtures
- Integration tests validate both JavaScript and Node.js shadow functionality
- `interpreter/env/NodeShadowEnvironment.test.ts`: Unit tests for Node.js shadow environment
- `tests/integration/node-shadow-cleanup.test.ts`: Integration tests for Node.js cleanup behavior
- `tests/integration/js-shadow-cleanup.test.ts`: Integration tests for JavaScript error handling
- `tests/integration/shadow-env-basic-import.test.ts`: Integration tests for shadow environment imports

### Key Test Scenarios

1. **Basic functionality**: Function execution, parameter passing, shadow function calls
2. **Timer cleanup**: Verifies timers don't keep process alive after cleanup
3. **Error handling**: Ensures cleanup happens even when errors occur
4. **Context isolation**: Tests that VM contexts are properly isolated
5. **Import preservation**: Shadow environments work correctly after import
6. **Multi-level imports**: Functions passed through multiple import levels
7. **Error propagation**: Missing shadow functions fail gracefully

### Shadow Environment Resolution Priority

When a function executes, shadow environments are resolved in this order:

1. **Captured (Lexical) Environment** - Shadow functions captured at definition time
2. **Current (Dynamic) Environment** - Shadow functions in the current execution context

This means:
- Imported functions use their original shadow environment first
- The importing file's shadow environment acts as a fallback
- Parameter names always take precedence over shadow functions

Example:
```mlld
# module.mld
/exe @helper() = js { return "module helper"; }
/exe @js = { helper }
/exe @useHelper() = js { return helper(); }

# app.mld
/import { useHelper } from "./module.mld"
/exe @helper() = js { return "app helper"; }
/exe @js = { helper }

# useHelper() returns "module helper" (lexical), not "app helper"
/var @result = @useHelper()
```

## Debugging

### Common Issues

1. **Function Not Found**: Check shadow env declaration syntax
2. **Async/Sync Mismatch**: Node functions are always async
3. **Context Leaks**: VM contexts are per-file, not per-execution
4. **Parameter Conflicts**: Shadow functions take precedence over params
5. **Process Hanging**: Timers not being cleaned up properly
6. **Missing Error Messages**: Error details not propagating to stderr
7. **Import Issues**: Shadow functions not available after import
   - Ensure shadow environment is declared before functions that use it
   - Check that metadata is preserved through import chain
   - Verify Map serialization/deserialization is working
8. **Resolution Conflicts**: Wrong shadow function being called
   - Use `MLLD_DEBUG=true` to see shadow environment conflicts
   - Check resolution priority (lexical before dynamic)

### Troubleshooting Process Hanging

**Symptoms**: Tests timeout, CLI processes don't exit after completion

**Common Causes**:
1. **Timers keeping event loop alive**: `setTimeout`, `setInterval` in Node.js shadow functions
2. **Improper cleanup flow**: Cleanup not being called or failing silently
3. **Missing process.exit()**: Success cases don't force exit after cleanup

**Debugging Steps**:
1. **Check timer tracking**: Verify wrapped timers are being tracked in NodeShadowEnvironment
2. **Verify cleanup flow**: Add debug logging to track cleanup calls
3. **Test exit behavior**: Run with manual timeout to confirm hanging

**Example Debug Session**:
```typescript
// Add to NodeShadowEnvironment.cleanup()
console.error(`[DEBUG] Cleanup called - ${this.activeTimers.size} timers, ${this.activeIntervals.size} intervals`);

// Add to Environment.cleanup()
console.error('[DEBUG] Environment cleanup called');
if (this.nodeShadowEnv) {
  console.error('[DEBUG] Calling NodeShadowEnvironment cleanup');
} else {
  console.error('[DEBUG] No NodeShadowEnvironment found');
}
```

### Troubleshooting Missing Error Messages

**Symptoms**: Tests expect error messages in stderr but get empty strings

**Common Causes**:
1. **Early process.exit()**: CLI exits before ErrorHandler runs
2. **Error bypassing**: Errors caught and handled before reaching ErrorHandler
3. **Details not preserved**: Error re-wrapping loses original message

**Debugging Steps**:
1. **Check error flow**: Verify errors reach CLIOrchestrator.main() catch block
2. **Verify ErrorHandler**: Confirm ErrorHandler.handleError() is called
3. **Test details preservation**: Check BaseCommandExecutor.createCommandExecutionError()

**Key Implementation Points**:
- Remove early `process.exit()` calls from FileProcessor
- Let errors propagate to ErrorHandler naturally
- Ensure MlldCommandExecutionError puts details in `details.stderr`
- ErrorHandler writes `error.details.stderr` to process.stderr

## Cleanup and Resource Management

### Node.js Shadow Environment Cleanup

The Node.js shadow environment requires special cleanup to prevent processes from hanging due to active timers or other asynchronous operations.

**Location**: `interpreter/env/NodeShadowEnvironment.ts` - `cleanup()` method

**Current Implementation - Timer Tracking Approach**:
```typescript
export class NodeShadowEnvironment {
  private activeTimers: Set<any> = new Set();
  private activeIntervals: Set<any> = new Set();
  
  constructor(basePath: string, currentFile?: string) {
    // Wrap timer functions to track active timers
    const wrappedSetTimeout = (callback: Function, delay?: number, ...args: any[]) => {
      const id = setTimeout(() => {
        this.activeTimers.delete(id);
        callback(...args);
      }, delay);
      this.activeTimers.add(id);
      return id;
    };
    
    const wrappedSetInterval = (callback: Function, delay?: number, ...args: any[]) => {
      const id = setInterval(callback, delay, ...args);
      this.activeIntervals.add(id);
      return id;
    };
    
    // Provide wrapped timers in VM context
    this.context = vm.createContext({
      setTimeout: wrappedSetTimeout,
      setInterval: wrappedSetInterval,
      clearTimeout: (id) => { this.activeTimers.delete(id); clearTimeout(id); },
      clearInterval: (id) => { this.activeIntervals.delete(id); clearInterval(id); },
      // ... other globals
    });
  }
  
  cleanup(): void {
    this.isCleaningUp = true;
    
    // Clear shadow functions first
    this.shadowFunctions.clear();
    
    // Clear all tracked timers and intervals
    for (const timerId of this.activeTimers) {
      try { clearTimeout(timerId); } catch (error) { /* ignore */ }
    }
    this.activeTimers.clear();
    
    for (const intervalId of this.activeIntervals) {
      try { clearInterval(intervalId); } catch (error) { /* ignore */ }
    }
    this.activeIntervals.clear();
    
    // Replace the context with an empty one to break all references
    this.context = vm.createContext({});
  }
}
```

**Key design decisions**:
1. **Active timer tracking**: Wrap setTimeout/setInterval to track all active timers
2. **Explicit cleanup**: Clear tracked timers during cleanup to prevent hanging
3. **Context replacement**: Replace VM context to break remaining references
4. **Error resilience**: Ignore errors when clearing timers (they may already be cleared)

### Environment Cleanup Flow

**Critical Path**: `FileProcessor → Environment.cleanup() → NodeShadowEnvironment.cleanup()`

1. **Normal execution**: After successful mlld script execution
   ```typescript
   // In FileProcessor.ts (success path)
   if (interpretEnvironment && 'cleanup' in interpretEnvironment) {
     cliLogger.debug('Calling environment cleanup');
     (interpretEnvironment as any).cleanup();
   }
   
   // Force exit after cleanup to prevent hanging
   await new Promise(resolve => setTimeout(resolve, 10));
   process.exit(0);
   ```

2. **Error handling**: Cleanup is called even when errors occur
   ```typescript
   } catch (error: any) {
     // Clean up environment even on error path
     if (interpretEnvironment && 'cleanup' in interpretEnvironment) {
       cliLogger.debug('Calling environment cleanup (error path)');
       (interpretEnvironment as any).cleanup();
     }
     // Let error propagate to ErrorHandler
     throw error;
   }
   ```

3. **Error propagation flow**: Errors must reach ErrorHandler for proper exit codes
   ```typescript
   // CLIOrchestrator catches errors and delegates to ErrorHandler
   } catch (error: unknown) {
     // Use the centralized error handler
     await this.errorHandler.handleError(error, cliOptions);
   }
   
   // ErrorHandler treats command execution errors as fatal in CLI context
   if (severity === ErrorSeverity.Fatal || isCommandError) {
     process.exit(1);
   }
   ```

### Why Cleanup is Important

Without proper cleanup, Node.js shadow environments can:
- Keep the process alive indefinitely due to active timers
- Consume memory with retained VM contexts
- Prevent proper process exit in CLI tools

Example of problematic code:
```mlld
/exe @createTimer() = node {
  setTimeout(() => {
    console.log('This keeps the process alive');
  }, 10000);
  return 'Timer created';
}

/exe @node = { createTimer }
/var @result = @createTimer()
```

Without cleanup, this would keep the mlld process running for 10 seconds. With cleanup, the process exits immediately after producing output.

## Implementation Details: Why This Architecture?

### The Challenge
We needed shadow functions to be able to call each other (e.g., `calculate` calling `add` and `multiply`) while maintaining:
1. Web compatibility (no Node.js-specific features)
2. Synchronous execution (no async/await in simple math functions)
3. Simple mental model for users

### The Solution
Each JavaScript shadow function wrapper receives ALL shadow functions as parameters. When `calculate` is created:

```javascript
// Conceptually, this is what happens:
function calculate_wrapper(...args) {
  const n = args[0];
  const add = shadowFunctions.get('add');
  const multiply = shadowFunctions.get('multiply');
  
  // Now execute the user's code with all functions in scope
  return new Function('n', 'add', 'multiply', `
    const sum = add(n, 10);
    const product = multiply(sum, 2);
    return product;
  `)(n, add, multiply);
}
```

### Why Not Just Use Closures?
We can't use JavaScript closures because the function bodies come from user-provided strings in mlld files. The `new Function()` constructor doesn't have access to the surrounding scope, so we must explicitly pass everything as parameters.

## Error Handling Architecture

### Critical Discovery: Error Details Preservation

During Environment.ts refactoring, we discovered a systematic issue in error handling that affected **all language executors**. This section documents the issue and the architectural fix.

#### The Problem

When language executors (NodeExecutor, JavaScriptExecutor, BashExecutor, etc.) threw `MlldCommandExecutionError` with error details:

```typescript
// All executors create errors like this:
throw new MlldCommandExecutionError(
  `${language} error: ${originalError}`,
  context?.sourceLocation,
  {
    command: `${language} code execution`,
    exitCode: 1,
    duration: Date.now() - startTime,
    stderr: originalError, // ✅ Correctly set in details object
    stdout: '',
    workingDirectory: this.workingDirectory,
    // ... other details
  }
);
```

The `BaseCommandExecutor.createCommandExecutionError()` method was re-wrapping these errors but only looked for error details as **direct properties** (`error.stderr`), not in the **details object** (`error.details.stderr`):

```typescript
// ❌ Original implementation - only checked direct properties
if ('stderr' in error) errorDetails.stderr = String(error.stderr);
```

This meant that when errors were caught and re-wrapped by BaseCommandExecutor, the original error messages were lost, resulting in empty `stderr` fields in the final error output.

#### The Fix

We updated `BaseCommandExecutor.createCommandExecutionError()` to also check for error details in the `details` object:

```typescript
// ✅ Fixed implementation - checks both direct properties and details object
if (error && typeof error === 'object') {
  // Check for direct properties first
  if ('stdout' in error) errorDetails.stdout = String(error.stdout);
  if ('stderr' in error) errorDetails.stderr = String(error.stderr);
  
  // Check for properties in details object (for MlldCommandExecutionError)
  if ('details' in error && error.details && typeof error.details === 'object') {
    if ('stdout' in error.details) errorDetails.stdout = String(error.details.stdout);
    if ('stderr' in error.details) errorDetails.stderr = String(error.details.stderr);
    if ('exitCode' in error.details && typeof error.details.exitCode === 'number') {
      errorDetails.status = error.details.exitCode;
    }
  }
  
  // ... rest of status handling
}
```

#### Impact

This fix affects **language executors with shadow environment support**:
- ✅ **NodeExecutor**: Error messages now properly captured in subprocess stderr
- ✅ **JavaScriptExecutor**: Stack traces preserved in error details
- ✅ **PythonExecutor**: Shadow environment support with streaming output
- ❌ **BashExecutor**: No shadow environment support (only variable injection)
- ✅ **ShellCommandExecutor**: Command execution errors preserved

#### Testing

The fix was validated with:
1. **Node.js shadow environment test**: `tests/integration/node-shadow-cleanup.test.ts` now passes
2. **JavaScript shadow environment test**: `tests/integration/js-shadow-cleanup.test.ts` now passes  
3. **All existing tests**: No regressions in 742+ core tests

### Error Propagation Flow

The complete error propagation flow for language executors:

```
1. User code throws error (e.g., `throw new Error('message')`)
   ↓
2. Language executor catches error and creates MlldCommandExecutionError
   - Error message stored in details.stderr
   ↓  
3. BaseCommandExecutor.executeWithCommonHandling() catches the error
   ↓
4. BaseCommandExecutor.createCommandExecutionError() re-wraps the error
   - NOW CORRECTLY preserves details.stderr → new error's details.stderr
   ↓
5. CLI error handler displays the error
   - Writes details.stderr to process.stderr for subprocess capture
   ↓
6. Calling process/test captures the original error message
```

## Implementation Checklist

When adding a new language shadow environment:

1. [ ] Decide on execution model (in-process vs isolated)
2. [ ] Implement storage mechanism in Environment class
3. [ ] Create wrapper function generator in exec.ts
   - For sync languages: Consider the shadow function scope problem
   - For async languages: Can use environment lookups at runtime
4. [ ] Add shadow environment capture support
   - Implement capture in `Environment.captureAllShadowEnvs()`
   - Update executable creation to capture environments
   - Add resolution logic to language executor
5. [ ] Add execution support in Environment.executeCode
6. [ ] Handle console/output capture appropriately
7. [ ] Add error handling and context enhancement
   - **CRITICAL**: Use `MlldCommandExecutionError` with error details in the `details` object
   - Store original error messages in `details.stderr` for proper propagation
8. [ ] Implement cleanup mechanism
   - For isolated environments: Clear VM contexts, child processes, etc.
   - For in-process environments: Clear function references
   - Ensure cleanup is called from CLI in both success and error cases
9. [ ] Support import/export preservation
   - Ensure captured shadow environments are included in metadata
   - Handle serialization for import/export (Maps → Objects → Maps)
   - Test that imported functions retain their shadow environment
10. [ ] Write comprehensive tests including:
    - Nested function calls
    - Resource cleanup (timers, file handles, etc.)
    - **Error scenarios with cleanup - verify stderr propagation**
    - **Shadow environment error handling specifically**
    - **Import scenarios - functions work after being imported**
    - **Multi-level imports - shadow environments preserved through chains**
11. [ ] Document usage patterns and limitations

### Error Handling Requirements

When implementing a new executor, ensure:

1. **Error Creation**: Use `MlldCommandExecutionError` with details object:
   ```typescript
   throw new MlldCommandExecutionError(
     `${language} error: ${originalError}`,
     context?.sourceLocation,
     {
       stderr: originalError, // Put original error in details.stderr
       // ... other details
     }
   );
   ```

2. **Error Testing**: Verify that error messages are preserved through:
   - Direct execution (`/var @result = @function()`)
   - Shadow environment execution (with environment declared)
   - Subprocess execution (CLI with --stdout mode)

3. **Integration Testing**: Test both success and error scenarios in shadow environments to ensure cleanup happens correctly even when errors occur.

## Lessons Learned from Shadow Environment Debugging

### December 2024 Debugging Session: Timer Cleanup & Error Propagation

During a comprehensive debugging session, we identified and fixed two critical issues in shadow environment handling:

#### Issue 1: Process Hanging Due to Timer Cleanup
**Problem**: Node.js shadow environment tests were timing out because timers created in VM contexts weren't being properly cleaned up.

**Root Cause**: The original cleanup approach only replaced the VM context but didn't explicitly clear active timers, leaving them to keep the event loop alive.

**Solution**: Implemented timer tracking by wrapping `setTimeout` and `setInterval` in the VM context to track active timers, then explicitly clearing them during cleanup.

**Key Insight**: VM context replacement alone isn't sufficient for cleanup - asynchronous operations need explicit termination.

#### Issue 2: Error Message Propagation in CLI Context
**Problem**: Shadow environment error tests were passing but getting empty stderr content instead of the original error messages.

**Root Cause**: The FileProcessor was calling `process.exit()` prematurely, bypassing the ErrorHandler that writes error details to stderr.

**Solution**: Removed early `process.exit()` calls and ensured errors propagate through the proper CLIOrchestrator → ErrorHandler flow.

**Key Insight**: Error handling in CLI tools requires careful orchestration - cleanup must happen without preventing proper error propagation and exit code handling.

#### Implementation Principles Reinforced

1. **Separation of Concerns**: Cleanup logic should be separate from error handling logic
2. **Explicit Resource Management**: Don't rely on implicit cleanup for asynchronous resources
3. **Error Flow Integrity**: Maintain clean error propagation paths from low-level executors to high-level CLI handlers
4. **Process Exit Management**: Use `process.exit()` strategically - after cleanup for success, after error handling for failures
5. **Integration Testing**: Test both success and error scenarios to catch issues in different execution paths

#### Testing Approach That Revealed Issues

The issues were discovered through integration tests that:
- Used subprocess execution to test actual process exit behavior
- Measured execution duration to detect hanging processes
- Captured both stdout and stderr to verify error message propagation
- Tested both successful execution with timers and error cases

This reinforced the importance of testing shadow environments in isolation from the main test process to catch real-world behavior.
