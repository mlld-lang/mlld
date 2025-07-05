# Shadow Environment Architecture

Shadow environments in mlld provide a bridge between mlld's declarative syntax and imperative JavaScript/Node.js code. This document explains the internal architecture and implementation details.

## Language Support

**Currently Implemented**:
- ✅ **JavaScript** (`js`): In-process execution with function injection
- ✅ **Node.js** (`node`): VM-isolated execution with function injection

**Not Implemented**:
- ❌ **Bash** (`bash`): Only supports variable injection, no function calls
- ❌ **Python** (`python`): No shadow environment support
- ❌ **Shell** (`sh`): No shadow environment support

## Overview

Shadow environments allow mlld `/exec` functions to be called from within JavaScript or Node.js code blocks. This creates a seamless integration where mlld functions become available as regular functions in the target language.

## Architecture Comparison

### JavaScript Shadow Environment

**Location**: `interpreter/env/Environment.ts` (lines 1175-1214, 1438-1524)

**Architecture**:
- **Storage**: Uses `Map<string, Map<string, any>>` in `shadowEnvs` property
- **Execution**: In-process using `new Function()`
- **Isolation**: None - runs in the same process
- **Performance**: Fast - no overhead

**Key implementation details**:
```typescript
// Storage in Environment class
private shadowEnvs: Map<string, Map<string, any>> = new Map();

// Setting shadow environment
setShadowEnv(language: string, functions: Map<string, any>): void {
  if (language === 'node' || language === 'nodejs') {
    // Special handling for Node.js
  } else {
    this.shadowEnvs.set(language, functions);
  }
}

// Execution with shadow functions
const shadowEnv = this.getShadowEnv('js') || this.getShadowEnv('javascript');
const mergedParams = { ...Object.fromEntries(shadowEnv || []), ...params };
```

### Node.js Shadow Environment

**Location**: `interpreter/env/NodeShadowEnvironment.ts`

**Architecture**:
- **Storage**: Dedicated `NodeShadowEnvironment` class instance
- **Execution**: VM module with isolated context
- **Isolation**: Full VM context isolation
- **Performance**: Slightly slower due to VM overhead

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
```

### Environment Declaration

```mlld
>> JavaScript environment
/exe @js = { double, triple, square }

>> Node.js environment
/exe @node = { hash, readFile, fetchUrl }
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

## Future Considerations

The shadow environment architecture is designed to be extensible to other languages. The pattern of using language-specific isolation mechanisms (like Node's VM module) could be applied to Python, shell scripts, and other runtimes.

## Testing Shadow Environments

Test cases for shadow environments can be found in:
- `tests/cases/valid/exec/`: General exec and shadow environment tests
- Integration tests validate both JavaScript and Node.js shadow functionality
- `interpreter/env/NodeShadowEnvironment.test.ts`: Unit tests for Node.js shadow environment
- `tests/integration/node-shadow-cleanup.test.ts`: Integration tests for Node.js cleanup behavior
- `tests/integration/js-shadow-cleanup.test.ts`: Integration tests for JavaScript error handling

### Key Test Scenarios

1. **Basic functionality**: Function execution, parameter passing, shadow function calls
2. **Timer cleanup**: Verifies timers don't keep process alive after cleanup
3. **Error handling**: Ensures cleanup happens even when errors occur
4. **Context isolation**: Tests that VM contexts are properly isolated

## Debugging

### Common Issues

1. **Function Not Found**: Check shadow env declaration syntax
2. **Async/Sync Mismatch**: Node functions are always async
3. **Context Leaks**: VM contexts are per-file, not per-execution
4. **Parameter Conflicts**: Shadow functions take precedence over params

## Cleanup and Resource Management

### Node.js Shadow Environment Cleanup

The Node.js shadow environment requires special cleanup to prevent processes from hanging due to active timers or other asynchronous operations.

**Location**: `interpreter/env/NodeShadowEnvironment.ts` - `cleanup()` method

**Implementation**:
```typescript
cleanup(): void {
  this.isCleaningUp = true;
  
  // Clear shadow functions first
  this.shadowFunctions.clear();
  
  // Simply replace the context with an empty one to break all references
  // This is the simplest and most effective approach for cleanup
  this.context = vm.createContext({});
}
```

**Key design decisions**:
1. **Simple replacement**: Instead of trying to manipulate timers within the VM context, we replace the entire context
2. **Break all references**: This ensures timers, intervals, and other async operations lose their references
3. **No complex cleanup**: Avoids the complexity of tracking and clearing individual resources

### Environment Cleanup Flow

1. **Normal execution**: After successful mlld script execution
   ```typescript
   // In CLI (cli/index.ts)
   if (environment && 'cleanup' in environment) {
     environment.cleanup();
   }
   ```

2. **Error handling**: Cleanup is called even when errors occur
   ```typescript
   } catch (error: any) {
     // Clean up environment even on error
     if (environment && 'cleanup' in environment) {
       environment.cleanup();
     }
     // ... handle error
   }
   ```

3. **Process exit**: For `--stdout` mode, explicit exit ensures clean termination
   ```typescript
   if (stdout) {
     await new Promise(resolve => setTimeout(resolve, 10));
     process.exit(0);
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
- ❌ **BashExecutor**: No shadow environment support (only variable injection)
- ✅ **ShellCommandExecutor**: Command execution errors preserved
- ⚠️ **PythonExecutor**: Uses different pattern (delegates to shell), not affected

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
4. [ ] Add execution support in Environment.executeCode
5. [ ] Handle console/output capture appropriately
6. [ ] Add error handling and context enhancement
   - **CRITICAL**: Use `MlldCommandExecutionError` with error details in the `details` object
   - Store original error messages in `details.stderr` for proper propagation
7. [ ] Implement cleanup mechanism
   - For isolated environments: Clear VM contexts, child processes, etc.
   - For in-process environments: Clear function references
   - Ensure cleanup is called from CLI in both success and error cases
8. [ ] Write comprehensive tests including:
   - Nested function calls
   - Resource cleanup (timers, file handles, etc.)
   - **Error scenarios with cleanup - verify stderr propagation**
   - **Shadow environment error handling specifically**
9. [ ] Document usage patterns and limitations

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