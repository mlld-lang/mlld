# mlld Stacktrace Architecture - Final Design

## Overview

The mlld stacktrace system provides optional, user-friendly error reporting that focuses on mlld-level operations rather than JavaScript implementation details. It uses smart data sampling and service composition to minimize performance impact while maximizing debugging value.

## Core Design Principles

1. **Optional by Design**: Zero overhead when disabled, minimal overhead when enabled
2. **Smart Sampling**: Capture just enough data to understand errors (200 chars, 5 items, etc.)
3. **mlld-First**: Show mlld directives and operations, not JavaScript stack traces
4. **Service Composition**: Isolated StacktraceService keeps Environment clean
5. **Actionable**: Provide clear suggestions for fixing issues
6. **Production Ready**: Circuit breakers and graceful degradation

## Configuration Model

### Global Flag System
```typescript
interface StacktraceConfig {
  enabled: boolean;              // Master switch
  maxFrameDepth: number;         // Limit stack depth (default: 20)
  maxDataSize: number;           // Limit variable snapshot size (default: 1024)
  captureVariables: boolean;     // Whether to snapshot variables
  verbosity: 'minimal' | 'standard' | 'verbose';
}

// Access via Environment or global config
class Environment {
  private stacktraceConfig: StacktraceConfig;
  
  isStacktraceEnabled(): boolean {
    return this.stacktraceConfig.enabled;
  }
}
```

### Activation Strategies (Future)
- CLI flag: `mlld --stacktrace=on|off script.mld`
- Environment variable: `MLLD_STACKTRACE=false`
- Auto-disable in production mode
- Auto-enable in development/debug mode

## Architecture Components

### 1. Conditional Execution Context Tracker

**Purpose**: Maintains execution context only when stacktraces are enabled

**Implementation Pattern**:
```typescript
// Lightweight frame creation
function createFrame(node: MlldNode, operation: string): MlldExecutionFrame | null {
  if (!env.isStacktraceEnabled()) {
    return null;
  }
  return {
    directive: node,
    operation,
    timestamp: Date.now(),
    sourceLocation: node.location
  };
}

// Zero-cost wrapper when disabled
async function trackExecution<T>(
  node: MlldNode,
  operation: string,
  env: Environment,
  fn: () => Promise<T>
): Promise<T> {
  if (!env.isStacktraceEnabled()) {
    return fn(); // Direct pass-through, no overhead
  }
  
  const frame = createFrame(node, operation);
  env.pushFrame(frame);
  try {
    return await fn();
  } catch (error) {
    throw enhanceError(error, env);
  } finally {
    env.popFrame();
  }
}
```

### 2. Smart Data Sampling

**Purpose**: Capture just enough data to debug without overwhelming display or memory

**Strategy**:
```typescript
interface SamplingConfig {
  strings: { maxLength: 200 },
  arrays: { maxItems: 5, showTotal: true },
  objects: { maxDepth: 3, maxKeysPerLevel: 10 },
  llmOutput: { strategy: 'edges', edgeSize: 100 }
}

class StacktraceService {
  sampleValue(value: unknown): SampledValue {
    if (typeof value === 'string') {
      return value.length > 200 
        ? `${value.slice(0, 200)}... (${value.length} chars total)`
        : value;
    }
    if (Array.isArray(value)) {
      return {
        type: 'array',
        length: value.length,
        sample: value.slice(0, 5).map(v => this.sampleValue(v))
      };
    }
    // ... other types
  }
}
```

### 3. Error Enhancement Pipeline

**Purpose**: Conditionally enhance errors based on configuration

```typescript
function enhanceError(error: unknown, env: Environment): Error {
  if (!env.isStacktraceEnabled()) {
    // Return original error with minimal processing
    if (error instanceof MlldError) {
      return error;
    }
    return new MlldError(String(error));
  }
  
  // Full enhancement with stacktrace
  if (error instanceof MlldError) {
    error.details = {
      ...error.details,
      executionStack: env.getExecutionStack(),
      variableState: env.captureVariableState(),
      mlldOperation: getCurrentOperation(env)
    };
  }
  return error;
}
```

### 4. Adaptive Error Display

**Purpose**: Show appropriate detail level based on configuration

```typescript
class ErrorDisplayFormatter {
  format(error: MlldError, config: StacktraceConfig): string {
    if (!config.enabled) {
      // Minimal format without mlld trace
      return this.formatMinimal(error);
    }
    
    switch (config.verbosity) {
      case 'minimal':
        return this.formatMinimal(error);
      case 'standard':
        return this.formatStandard(error);
      case 'verbose':
        return this.formatVerbose(error);
    }
  }
}
```

## Performance Optimization Strategies

### 1. Zero-Cost Abstraction When Disabled
```typescript
// Inline-friendly check
if (env.isStacktraceEnabled()) {
  // Stack tracking code
} else {
  // Direct execution path
}
```

### 2. Lazy Evaluation
- Don't create frames until needed
- Don't snapshot variables until error occurs
- Don't format strings until display time

### 3. Bounded Resource Usage
- Limit stack depth to prevent memory bloat
- Truncate large data structures
- Use weak references where appropriate

### 4. Fast Path Optimization
```typescript
// Common case: stacktrace disabled
async function evaluate(node: MlldNode, env: Environment): Promise<EvalResult> {
  // Fast path - no stacktrace
  if (!env.isStacktraceEnabled()) {
    return evaluateCore(node, env);
  }
  
  // Slow path - with tracking
  return trackExecution(node, 'evaluate', env, () => evaluateCore(node, env));
}
```

## Implementation Architecture

### Service Composition Pattern
```typescript
class Environment {
  private stacktrace?: StacktraceService;
  
  constructor(...existing, config?: EnvironmentConfig) {
    // Existing setup...
    if (config?.stacktrace?.enabled) {
      this.stacktrace = new StacktraceService(config.stacktrace);
    }
  }
  
  // Delegate methods - no-op when service not present
  pushFrame(operation: string, node: MlldNode): void {
    this.stacktrace?.pushFrame({ operation, node });
  }
  
  popFrame(): void {
    this.stacktrace?.popFrame();
  }
  
  captureErrorContext(): ErrorContext | null {
    return this.stacktrace?.captureContext();
  }
}
```

### Integration Points
1. **evaluate()** - Main recursion point
2. **evaluateDirective()** - Directive dispatch
3. **Error construction** - Capture context
4. **Error display** - Format stacktraces

### Circuit Breakers
```typescript
interface CircuitBreakers {
  maxFrameDepth: 100,      // Prevent infinite recursion
  maxSampleSize: 5000,     // Per variable limit
  maxTotalMemory: 1048576, // 1MB total for all samples
  autoDisableAfter: {
    consecutiveErrors: 10,  // Too many errors = disable
    slowFrameMs: 50        // Frame taking too long = disable
  }
}
```

## Example Usage Patterns

### Development Mode (Stacktrace On)
```bash
mlld --stacktrace=on script.mld
# or
MLLD_DEVELOPMENT=true mlld script.mld
```

Full error output with execution trace, variable state, and suggestions.

### Production Mode (Stacktrace Off)
```bash
mlld --stacktrace=off script.mld
# or
MLLD_PRODUCTION=true mlld script.mld
```

Minimal error output, maximum performance.

### Conditional in Script
```mlld
@pragma stacktrace off  # Future feature

@text largeData = run [cat huge-file.json]
@data processed = foreach @transform(@largeData)
```

## Memory Management

### Frame Pooling
```typescript
class FramePool {
  private pool: MlldExecutionFrame[] = [];
  
  acquire(): MlldExecutionFrame {
    return this.pool.pop() || {} as MlldExecutionFrame;
  }
  
  release(frame: MlldExecutionFrame): void {
    // Clear frame data
    frame.directive = null;
    frame.variables?.clear();
    this.pool.push(frame);
  }
}
```

### Bounded Collections
- Limit execution stack to N frames
- Use circular buffer for old frames
- Truncate variable snapshots

## Error Display Examples

### With Stacktrace (Standard)
```
FieldAccessError: Cannot access field "questions" on object

📍 Location: test.mld:15:35
→  15 | @add foreach @getQuestions(@reply.questions)
                                          ^^^^^^^^^

🔍 Data Context:
   Variable: @reply
   Type: object  
   Available fields: above, below

🔄 Execution Trace:
   1. @data reply = run [(claude -p "@prompt")] (line 9)
   2. @add foreach @getQuestions(@reply.questions) (line 15)

💡 Try: @reply.below
```

### Without Stacktrace (Minimal)
```
FieldAccessError: Cannot access field "questions" on object at test.mld:15:35
Field not found. Available: above, below
```

## Implementation Priorities

1. **Must Have**
   - Toggle mechanism (global flag)
   - Zero overhead when disabled
   - Basic frame tracking when enabled
   - Error enhancement pipeline

2. **Should Have**
   - Variable state capture
   - Execution trace display
   - Performance profiling
   - Configuration options

3. **Nice to Have**
   - Per-script pragmas
   - Auto-disable heuristics
   - Frame pooling
   - Weak reference optimization

## Key Design Decisions

1. **Smart Sampling**: Sample data instead of capturing everything
   - 200 chars for strings
   - 5 items for arrays
   - Shallow object structure
   - Edge sampling for LLM output

2. **Service Composition**: Isolated StacktraceService
   - Clean separation from Environment
   - Easy to test and modify
   - No architectural changes

3. **Circuit Breakers**: Automatic protection
   - Frame depth limits
   - Memory usage caps
   - Performance monitoring
   - Auto-disable on issues

4. **No AOP**: Direct integration
   - Simpler implementation
   - Clearer code flow
   - Lower overhead
