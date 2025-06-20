# Node.js Shadow Environment Implementation Plan

## Overview
Implement a Node.js shadow environment using VM module with module-level isolation, providing feature parity with the existing JavaScript shadow environment.

## 1. Create NodeShadowEnvironment Class
**File**: `interpreter/env/NodeShadowEnvironment.ts`

```typescript
import * as vm from 'vm';
import * as path from 'path';

export class NodeShadowEnvironment {
  private context: vm.Context;
  private shadowFunctions: Map<string, Function>;
  private basePath: string;
  private currentFile?: string;
  
  constructor(basePath: string, currentFile?: string) {
    this.basePath = basePath;
    this.currentFile = currentFile;
    this.shadowFunctions = new Map();
    
    // Create base context with Node.js globals
    this.context = vm.createContext({
      // Console and basic I/O
      console,
      process,
      
      // Module system
      require,
      module,
      exports,
      
      // Path information
      __dirname: currentFile ? path.dirname(currentFile) : basePath,
      __filename: currentFile || '',
      
      // Timers
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
      
      // Node.js globals
      Buffer,
      global,
      URL,
      URLSearchParams,
      
      // Promise/async support
      Promise,
      queueMicrotask,
      
      // Keep reference to shadow functions map for inter-function calls
      __mlldShadowFunctions: this.shadowFunctions
    });
  }
  
  addFunction(name: string, func: Function): void {
    this.shadowFunctions.set(name, func);
    // Make function available in context
    this.context[name] = func;
  }
  
  async execute(code: string, params?: Record<string, any>): Promise<any> {
    // Create execution-specific context with params
    const execContext = { ...this.context };
    
    if (params) {
      Object.assign(execContext, params);
    }
    
    // Wrap code to handle async and return values
    const wrappedCode = `
      (async () => {
        ${code}
      })()
    `;
    
    try {
      const script = new vm.Script(wrappedCode, {
        filename: this.currentFile || 'node-shadow-env',
        lineOffset: 0,
        columnOffset: 0
      });
      
      const result = await script.runInContext(execContext);
      return result;
    } catch (error) {
      // Enhance error with context information
      if (error instanceof Error) {
        error.message = `Node shadow environment error: ${error.message}`;
      }
      throw error;
    }
  }
  
  getContext(): any {
    return { ...this.context };
  }
}
```

## 2. Modify Environment.ts
**Changes to**: `interpreter/env/Environment.ts`

### Add NodeShadowEnvironment management:
```typescript
import { NodeShadowEnvironment } from './NodeShadowEnvironment';

export class Environment {
  // ... existing properties ...
  
  // Add Node shadow environment
  private nodeShadowEnv?: NodeShadowEnvironment;
  
  // Modify setShadowEnv to handle 'node' specially
  setShadowEnv(language: string, functions: Map<string, any>): void {
    if (language === 'node' || language === 'nodejs') {
      // Create or get Node shadow environment
      if (!this.nodeShadowEnv) {
        this.nodeShadowEnv = new NodeShadowEnvironment(
          this.basePath,
          this.currentFilePath
        );
      }
      
      // Add functions to Node shadow environment
      for (const [name, func] of functions) {
        this.nodeShadowEnv.addFunction(name, func);
      }
    } else {
      // Use existing implementation for other languages
      this.shadowEnvs.set(language, functions);
    }
  }
  
  // Modify getShadowEnv to return Node shadow env when appropriate
  getShadowEnv(language: string): Map<string, any> | undefined {
    if (language === 'node' || language === 'nodejs') {
      return this.nodeShadowEnv ? 
        new Map(Object.entries(this.nodeShadowEnv.getContext())
          .filter(([key]) => !key.startsWith('__'))) : 
        undefined;
    }
    return this.shadowEnvs.get(language) || this.parent?.getShadowEnv(language);
  }
  
  // Add getter for Node shadow environment
  getNodeShadowEnv(): NodeShadowEnvironment | undefined {
    return this.nodeShadowEnv || this.parent?.getNodeShadowEnv();
  }
}
```

### Modify executeCode for Node.js:
```typescript
async executeCode(
  code: string,
  language: string,
  params?: Record<string, any>,
  context?: CommandExecutionContext
): Promise<string> {
  const startTime = Date.now();
  
  if (language === 'javascript' || language === 'js') {
    // ... existing JS implementation ...
  } else if (language === 'node' || language === 'nodejs') {
    try {
      // Check if we have a Node shadow environment
      const nodeShadowEnv = this.getNodeShadowEnv();
      
      if (nodeShadowEnv) {
        // Use shadow environment with VM
        const result = await nodeShadowEnv.execute(code, params);
        
        // Format result (same as subprocess version)
        if (result !== undefined) {
          if (typeof result === 'object') {
            return JSON.stringify(result);
          }
          return String(result);
        }
        return '';
      } else {
        // Fall back to subprocess execution (existing implementation)
        // ... existing subprocess code ...
      }
    } catch (error) {
      // ... existing error handling ...
    }
  }
  // ... rest of languages ...
}
```

## 3. Update exec.ts
**Changes to**: `interpreter/eval/exec.ts`

### Modify the shadow environment setup for Node:
```typescript
// In evaluateExec function, environment declaration section:
if (directive.subtype === 'environment') {
  // ... existing code ...
  
  for (const ref of envRefs) {
    const funcName = ref.identifier;
    const funcVar = env.getVariable(funcName);
    
    if (!funcVar || funcVar.type !== 'executable') {
      throw new Error(`${funcName} is not a defined exec function`);
    }
    
    // Create wrapper function that calls the mlld exec
    const wrapper = createExecWrapper(funcName, funcVar, env);
    
    // For Node.js, we can use the same async wrapper
    // The VM context will handle the execution
    shadowFunctions.set(funcName, wrapper);
  }
  
  // Store in environment (existing code works)
  env.setShadowEnv(language, shadowFunctions);
}
```

## 4. Testing Strategy

### Create test file: `tests/cases/valid/exec/node-shadow-env/example.md`
```markdown
# Test Node.js Shadow Environment

@exec add(a, b) = @run node {
  return a + b;
}

@exec multiply(x, y) = @run node {
  return x * y;
}

@exec calculate(n) = @run node {
  // Can call other shadow functions
  const sum = add(n, 10);
  const product = multiply(sum, 2);
  return product;
}

@exec node = { add, multiply, calculate }

@data result = @run node {
  // Test direct calls
  const r1 = add(5, 3);
  const r2 = multiply(4, 7);
  const r3 = calculate(5); // (5+10)*2 = 30
  
  return { r1, r2, r3 };
}

@add @result
```

## 5. Implementation Order

1. **Create NodeShadowEnvironment.ts** - New isolated class
2. **Update Environment.ts** - Add Node shadow env support
3. **Test with simple functions** - Verify basic execution works
4. **Add complex test cases** - Inter-function calls, async operations
5. **Update documentation** - Add Node shadow env examples

## 6. Benefits of This Design

- **Minimal changes** - Mostly additive, preserves existing behavior
- **Performance** - No subprocess overhead for Node code with shadow functions
- **Consistency** - Similar pattern to JavaScript shadow environment
- **Isolation** - Each mlld module gets its own VM context
- **Full Node.js support** - All Node APIs available in VM context
- **Easy debugging** - Same process execution with proper stack traces

## 7. Future Enhancements

- Cache compiled VM scripts for repeated execution
- Support for TypeScript execution via ts-node
- Allow customizing the VM context globals
- Support for debugging with source maps

## 8. Key Design Decisions

### Why VM instead of IPC?
- **Simpler implementation** - No protocol design needed
- **Better performance** - No serialization overhead
- **Natural function sharing** - Functions remain as functions
- **Consistent with JS shadow env** - Same mental model

### Why module-level isolation?
- **Natural scoping** - Matches mlld's file-based model
- **Resource efficiency** - One context per file, not per execution
- **Function sharing** - Functions in same file can call each other
- **Clean lifecycle** - Context lives with Environment instance

### What about security?
- mlld already trusts the code it executes
- VM provides sufficient isolation between modules
- No additional security needed beyond current model