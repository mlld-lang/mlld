# Middleware Pattern Opportunities in mlld

## Overview
The mlld codebase has several cross-cutting concerns that are currently handled with scattered implementations. A middleware pattern could centralize these concerns, making the code cleaner and more maintainable.

## What is Middleware?
Middleware is a pattern where you wrap function execution with additional behavior (logging, security, caching, etc.) without modifying the function itself. It's like aspect-oriented programming but simpler.

```typescript
// Instead of scattered try/catch/finally
async function evaluate(node, env) {
  env.pushFrame();
  try {
    // logic
  } catch (error) {
    enhanceError(error);
    throw error;
  } finally {
    env.popFrame();
  }
}

// Middleware approach
async function evaluate(node, env) {
  return middleware.wrap('evaluate', async () => {
    // just the logic
  });
}
```

## Identified Opportunities

### 1. Security Checks
**Current State**: Security validation mixed throughout execution code
**Location**: `interpreter/eval/run.ts` lines 70-126

**Problem**:
- Security logic intertwined with business logic
- Duplicated checks across different execution paths
- Hard to audit security coverage

**Middleware Solution**:
```typescript
class SecurityMiddleware {
  async process(operation: string, context: any, next: Function) {
    if (operation === 'executeCommand') {
      const command = context.command;
      const analysis = await this.analyzer.analyze(command);
      
      if (analysis.blocked) {
        throw new SecurityError(analysis.reason);
      }
    }
    
    return next();
  }
}
```

### 2. Performance Monitoring
**Current State**: No systematic performance tracking
**Need**: Understanding bottlenecks in complex scripts

**Middleware Solution**:
```typescript
class PerformanceMiddleware {
  async process(operation: string, context: any, next: Function) {
    const start = performance.now();
    const memBefore = process.memoryUsage();
    
    try {
      return await next();
    } finally {
      const duration = performance.now() - start;
      const memAfter = process.memoryUsage();
      
      if (duration > this.slowThreshold) {
        console.warn(`Slow operation: ${operation} took ${duration}ms`);
      }
      
      this.metrics.record(operation, duration, memAfter.heapUsed - memBefore.heapUsed);
    }
  }
}
```

### 3. Import Cycle Detection
**Current State**: Manual tracking in import resolvers
**Location**: Various resolver implementations

**Problem**:
- Each resolver reimplements cycle detection
- Easy to forget in new resolvers
- Inconsistent error messages

**Middleware Solution**:
```typescript
class ImportCycleMiddleware {
  private importStack: string[] = [];
  
  async process(operation: string, context: any, next: Function) {
    if (operation === 'import') {
      const path = context.path;
      
      if (this.importStack.includes(path)) {
        const cycle = [...this.importStack, path].join(' → ');
        throw new ImportCycleError(`Circular import detected: ${cycle}`);
      }
      
      this.importStack.push(path);
      try {
        return await next();
      } finally {
        this.importStack.pop();
      }
    }
    
    return next();
  }
}
```

### 4. Caching Layer
**Current State**: Limited caching, reimplemented in different places
**Need**: Cache expensive operations (module resolution, file reads)

**Middleware Solution**:
```typescript
class CacheMiddleware {
  private cache = new Map<string, CacheEntry>();
  
  async process(operation: string, context: any, next: Function) {
    if (!this.isCacheable(operation)) {
      return next();
    }
    
    const key = this.getCacheKey(operation, context);
    const cached = this.cache.get(key);
    
    if (cached && !this.isExpired(cached)) {
      return cached.value;
    }
    
    const result = await next();
    this.cache.set(key, {
      value: result,
      timestamp: Date.now()
    });
    
    return result;
  }
}
```

### 5. Debug Logging
**Current State**: Console.log statements scattered or missing
**Need**: Configurable logging for debugging complex scripts

**Middleware Solution**:
```typescript
class DebugMiddleware {
  async process(operation: string, context: any, next: Function) {
    if (!this.shouldLog(operation)) {
      return next();
    }
    
    console.log(`→ ${operation}`, this.summarize(context));
    const start = Date.now();
    
    try {
      const result = await next();
      console.log(`← ${operation} (${Date.now() - start}ms)`, this.summarize(result));
      return result;
    } catch (error) {
      console.log(`✗ ${operation} (${Date.now() - start}ms)`, error.message);
      throw error;
    }
  }
}
```

### 6. Transaction/Rollback Support
**Current State**: No transaction support
**Need**: Rollback file changes on error

**Middleware Solution**:
```typescript
class TransactionMiddleware {
  private changes: Change[] = [];
  
  async process(operation: string, context: any, next: Function) {
    if (operation === 'writeFile') {
      // Backup original
      const backup = await this.backup(context.path);
      this.changes.push({ type: 'file', path: context.path, backup });
    }
    
    try {
      return await next();
    } catch (error) {
      // Rollback all changes
      for (const change of this.changes.reverse()) {
        await this.rollback(change);
      }
      throw error;
    }
  }
}
```

## Implementation Approach

### Simple Middleware Stack
```typescript
class MiddlewareStack {
  private middlewares: Middleware[] = [];
  
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }
  
  async execute(operation: string, context: any, fn: Function): Promise<any> {
    const chain = this.middlewares.reduceRight(
      (next, middleware) => () => middleware.process(operation, context, next),
      fn
    );
    
    return chain();
  }
}

// Usage in Environment
class Environment {
  private middleware = new MiddlewareStack();
  
  constructor(config: EnvironmentConfig) {
    // Conditionally add middleware based on config
    if (config.trace) this.middleware.use(new TraceMiddleware());
    if (config.security) this.middleware.use(new SecurityMiddleware());
    if (config.cache) this.middleware.use(new CacheMiddleware());
    if (config.debug) this.middleware.use(new DebugMiddleware());
  }
  
  // Wrap operations
  async evaluate(node: MlldNode): Promise<Result> {
    return this.middleware.execute('evaluate', { node }, async () => {
      // Actual evaluation logic
    });
  }
}
```

## Benefits

1. **Separation of Concerns**: Business logic separate from cross-cutting concerns
2. **Configurability**: Enable/disable features via configuration
3. **Testability**: Test middleware in isolation
4. **Consistency**: Same pattern for all cross-cutting concerns
5. **Extensibility**: Easy to add new middleware

## Risks

1. **Performance**: Extra function calls (minimal with modern JS engines)
2. **Debugging**: Stack traces become deeper
3. **Learning Curve**: Team needs to understand the pattern
4. **Over-abstraction**: Not everything needs to be middleware

## Recommendation

Start with the most painful cross-cutting concerns:
1. **Stacktrace** (already planned)
2. **Security** (currently scattered)
3. **Debug Logging** (desperately needed)

Don't convert everything at once. Introduce the pattern gradually and see if it improves code quality.

## Example: Converting Security Checks

### Before (mixed concerns):
```typescript
async function evaluateRun(directive, env) {
  const command = interpolate(directive.command);
  
  // Security mixed with logic
  const security = env.getSecurityManager();
  if (security) {
    const analysis = await security.analyze(command);
    if (analysis.blocked) {
      throw new Error(`Blocked: ${analysis.reason}`);
    }
  }
  
  return env.executeCommand(command);
}
```

### After (clean separation):
```typescript
async function evaluateRun(directive, env) {
  const command = interpolate(directive.command);
  
  // Just the business logic
  return env.executeCommand(command);
}

// Security handled by middleware
class SecurityMiddleware {
  async process(op, ctx, next) {
    if (op === 'executeCommand' && this.shouldCheck(ctx.command)) {
      await this.validateCommand(ctx.command);
    }
    return next();
  }
}
```

The code becomes simpler, and security can be audited in one place.