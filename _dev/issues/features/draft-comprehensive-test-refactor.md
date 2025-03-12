==== FIRST ANSWER ====

# Comprehensive Solution for Test Stability

A comprehensive solution to the test stability issues would involve several layers of improvements. Let me outline what this would look like:

## 1. Test Architecture Redesign

### Separation of Concerns
The current tests mix multiple concerns - they test functionality while also collecting debug information, visualizing state, and performing complex operations. We should separate these:

```typescript
// Instead of this:
it('should handle template literals', async () => {
  const sessionId = await context.startDebugSession();
  // Test code with debug operations
  const debugResults = await context.endDebugSession(sessionId);
  console.log(JSON.stringify(debugResults, null, 2));
});

// Do this:
it('should handle template literals', async () => {
  // Just the core test with minimal operations
});

// And have separate debug-focused tests if needed:
it.skip('debug: visualize template literal processing', async () => {
  // Debug-heavy operations
});
```

### Isolated Test Fixtures
Create smaller, focused test fixtures that don't rely on the entire application stack:

```typescript
// Create targeted test helpers
const createMinimalTestContext = () => {
  // Return only the minimal services needed
};

it('should process template literals', async () => {
  const { textService } = createMinimalTestContext();
  const result = await textService.processTemplate("Hello ${value}");
  expect(result).toBe("Hello value");
});
```

## 2. Resource Management

### Memory-Conscious Testing
Implement patterns to reduce memory usage:

```typescript
// Use a shared context for related tests
describe('Template processing', () => {
  let sharedContext;
  
  beforeAll(() => {
    sharedContext = createTestContext();
  });
  
  afterAll(async () => {
    await sharedContext.cleanup();
  });
  
  // Tests use the shared context
});
```

### Explicit Cleanup
Add explicit cleanup steps for resources:

```typescript
it('should process files', async () => {
  const tempFiles = [];
  try {
    const file1 = await createTempFile('test1.meld', content);
    tempFiles.push(file1);
    // Test logic
  } finally {
    // Clean up all temp files
    await Promise.all(tempFiles.map(file => fs.unlink(file)));
  }
});
```

## 3. Safety Mechanisms

### Timeout Management
Add appropriate timeouts to all tests with consideration for what they're testing:

```typescript
// Simple tests get shorter timeouts
it('should parse basic syntax', async () => {
  // Simple test
}, 5000);

// Complex tests get longer timeouts
it('should process complex imports', async () => {
  // Complex test
}, 15000);
```

### Circuit Breakers
Add circuit breakers to prevent runaway processes:

```typescript
class SafeProcessor {
  process(data, options = {}) {
    const { maxIterations = 100, maxDepth = 10 } = options;
    let iterations = 0;
    
    const processWithLimits = (data, depth = 0) => {
      if (depth > maxDepth) throw new Error('Max depth exceeded');
      if (iterations++ > maxIterations) throw new Error('Max iterations exceeded');
      
      // Processing logic
    };
    
    return processWithLimits(data);
  }
}
```

## 4. Debugging Improvements

### Structured Logging
Replace console.log with structured logging that can be enabled/disabled:

```typescript
const logger = createLogger({
  level: process.env.TEST_LOG_LEVEL || 'error',
  format: 'json'
});

it('should process imports', async () => {
  logger.debug('Starting import test');
  // Test code
  logger.debug('Import test completed', { result });
});
```

### Diagnostic Mode
Create a diagnostic mode that can be enabled for troubleshooting:

```typescript
const runDiagnostics = process.env.RUN_DIAGNOSTICS === 'true';

if (runDiagnostics) {
  // Collect detailed metrics
  const metrics = await collectPerformanceMetrics();
  await writeMetricsToFile(metrics);
}
```

## 5. Test Data Management

### Simplified Test Data
Create simpler test data that focuses on what's being tested:

```typescript
// Instead of using complex examples:
const complexExample = textDirectiveExamples.combinations.nestedInterpolation;

// Create minimal examples inline:
const simpleExample = '@text greeting = "Hello ${name}"';
```

### Deterministic Tests
Make tests deterministic by avoiding random or time-dependent values:

```typescript
// Instead of:
const timestamp = new Date().toISOString();

// Use fixed values:
const timestamp = '2023-01-01T00:00:00Z';
```

## 6. Test Runner Configuration

### Isolation
Configure the test runner to isolate tests:

```javascript
// vitest.config.js
export default {
  test: {
    isolate: true,
    threads: false, // For debugging
    testTimeout: 10000, // Default timeout
    hookTimeout: 10000, // For setup/teardown hooks
    teardownTimeout: 5000 // For cleanup
  }
}
```

### Resource Limits
Set resource limits for the test process:

```javascript
// In package.json scripts
{
  "test": "NODE_OPTIONS='--max-old-space-size=4096 --max-semi-space-size=512' vitest run"
}
```

## 7. Implementation Example

Here's how a refactored test might look:

```typescript
describe('Template Literals', () => {
  // Shared minimal context
  let context;
  
  beforeEach(async () => {
    // Create minimal context with only required services
    context = await createMinimalTestContext(['text', 'state']);
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should process simple template literals', async () => {
    // Arrange: Create minimal test data
    const content = '@text greeting = "Hello ${name}"';
    const testFile = await context.createTempFile('test.meld', content);
    
    try {
      // Act: Process with minimal options
      const result = await context.processFile(testFile, {
        variables: { name: 'World' }
      });
      
      // Assert: Check only what matters
      expect(result).toContain('Hello World');
    } finally {
      // Clean up
      await context.removeTempFile(testFile);
    }
  }, 5000); // Reasonable timeout
  
  // More focused tests...
});
```

This comprehensive approach addresses the root causes of test instability by:

1. Focusing tests on what they're actually testing
2. Reducing complexity and resource usage
3. Adding safety mechanisms to prevent runaway processes
4. Improving cleanup and resource management
5. Making tests more deterministic and isolated

Implementing these changes would require significant refactoring of the test suite, but would result in a much more stable and maintainable testing infrastructure.

==== SECOND ANSWER ====

# Pragmatic Test Improvements: The 80/20 Approach

You're absolutely right - we need a pragmatic approach that addresses the immediate OOM issues without derailing your DI refactoring progress. Let me focus on the highest-impact, lowest-effort changes that would give you the most benefit quickly.

## The Pragmatic 80/20 Solution

### 1. Memory Management Circuit Breakers (Highest Priority)

**What**: Add simple depth counters and circuit breakers to prevent runaway recursion in test code.

**Implementation**:
```typescript
// Add to TestDebuggerService or create a simple standalone utility
class MemoryGuard {
  private static counters = new Map<string, number>();
  private static limits = new Map<string, number>();

  static setLimit(operation: string, limit: number): void {
    this.limits.set(operation, limit);
  }

  static enter(operation: string): void {
    const current = this.counters.get(operation) || 0;
    const limit = this.limits.get(operation) || 100;
    
    if (current >= limit) {
      throw new Error(`Memory guard triggered: ${operation} exceeded limit of ${limit}`);
    }
    
    this.counters.set(operation, current + 1);
  }

  static exit(operation: string): void {
    const current = this.counters.get(operation) || 0;
    if (current > 0) {
      this.counters.set(operation, current - 1);
    }
  }

  static wrap<T>(operation: string, fn: () => T): T {
    this.enter(operation);
    try {
      return fn();
    } finally {
      this.exit(operation);
    }
  }

  static async wrapAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    this.enter(operation);
    try {
      return await fn();
    } finally {
      this.exit(operation);
    }
  }

  static reset(): void {
    this.counters.clear();
  }
}
```

**Usage**:
```typescript
// In your test setup
beforeEach(() => {
  MemoryGuard.reset();
  MemoryGuard.setLimit('debugCapture', 10);
  MemoryGuard.setLimit('stateVisualization', 5);
});

// In problematic methods
async captureState(point: string, data: any): Promise<void> {
  return MemoryGuard.wrapAsync('debugCapture', async () => {
    // Existing implementation
  });
}
```

**Benefit**: Immediately prevents infinite recursion and OOM errors with minimal code changes.

### 2. Simplified Test Data

**What**: Replace complex test data with minimal examples focused only on what's being tested.

**Implementation**:
```typescript
// Instead of using complex examples from centralized syntax
it('should handle template literals', async () => {
  // BEFORE:
  // const templateExample = textDirectiveExamples.atomic.templateLiteral;
  // const content = `${templateExample.code}\n\nTemplate result: {{template}}`;
  
  // AFTER:
  const content = `@text greeting = "Hello ${new Date().getFullYear()}"
  
Template result: {{greeting}}`;

  // Rest of test...
});
```

**Benefit**: Reduces memory usage and complexity while making tests more readable and maintainable.

### 3. Debug Session Isolation

**What**: Create a lightweight debug session that doesn't capture everything.

**Implementation**:
```typescript
// Add to TestDebuggerService
async startLightSession(options: { maxDepth?: number } = {}): Promise<string> {
  const sessionId = generateId();
  this.sessions.set(sessionId, {
    id: sessionId,
    captures: [],
    operations: [],
    metrics: { startTime: Date.now() },
    options: {
      maxDepth: options.maxDepth || 3,
      lightMode: true
    }
  });
  return sessionId;
}

// Modify captureState to respect lightMode
async captureState(point: string, data: any, sessionId?: string): Promise<void> {
  const session = sessionId ? this.sessions.get(sessionId) : this.activeSession;
  if (!session) return;
  
  // Skip detailed capture in light mode
  if (session.options.lightMode) {
    // Just capture a reference to the point without deep cloning
    session.captures.push({
      point,
      timestamp: Date.now(),
      data: { message: 'Light capture mode - data reference only' }
    });
    return;
  }
  
  // Existing implementation for full capture...
}
```

**Usage**:
```typescript
// In tests that need debugging but not full state capture
const sessionId = await debugService.startLightSession({ maxDepth: 2 });
// Test operations...
const results = await debugService.endSession(sessionId);
```

**Benefit**: Allows debugging without excessive memory usage.

### 4. Test Timeout Management

**What**: Add appropriate timeouts to all tests and implement auto-abort for long-running operations.

**Implementation**:
```typescript
// Add to test utilities
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms: ${operation}`));
    }, ms);
  });
  
  return Promise.race([
    promise.then(result => {
      clearTimeout(timeoutId);
      return result;
    }),
    timeoutPromise
  ]);
}
```

**Usage**:
```typescript
it('should process complex imports', async () => {
  // Wrap potentially problematic operations
  const result = await withTimeout(
    main('test.meld', options),
    5000,
    'Processing test.meld'
  );
  
  expect(result).toContain('expected content');
}, 10000); // Set overall test timeout
```

**Benefit**: Prevents tests from hanging indefinitely and provides clear error messages.

### 5. Targeted Test Simplification

**What**: Identify and simplify the most problematic tests first.

**Implementation**:
1. Run tests with `--verbose` to identify which tests use the most memory
2. Focus on simplifying those specific tests first
3. Remove unnecessary debug sessions and state visualization

**Example**:
```typescript
// BEFORE
it('should handle circular imports', async () => {
  const sessionId = await context.startDebugSession();
  // Complex setup with debug operations
  const result = await main('test.meld', options);
  const debugResults = await context.endDebugSession(sessionId);
  console.log(JSON.stringify(debugResults, null, 2));
  // Assertions
});

// AFTER
it('should handle circular imports', async () => {
  // Simple setup
  const result = await main('test.meld', options);
  // Assertions
});
```

**Benefit**: Quickly addresses the most problematic tests without requiring a full refactor.

## Implementation Strategy

1. **Start with Circuit Breakers (1-2 days)**
   - Add the MemoryGuard utility
   - Apply to TestDebuggerService and other recursive operations
   - This gives immediate protection against OOM errors

2. **Simplify Top 5 Problematic Tests (2-3 days)**
   - Identify tests that consistently cause OOM issues
   - Apply the simplified test data approach
   - Remove unnecessary debug sessions
   - Add appropriate timeouts

3. **Add Light Debug Mode (1-2 days)**
   - Implement the lightweight debug session
   - Update tests to use it where appropriate

4. **Create Test Helper Functions (1-2 days)**
   - Add timeout wrappers
   - Create simplified setup functions for common patterns
   - Focus on reducing boilerplate in tests

This approach should take about 1-2 weeks of focused effort and would dramatically improve test stability while allowing your DI refactoring to continue.

## Measuring Success

Define success by these metrics:
1. Zero OOM errors in CI runs
2. Test suite completes in a reasonable time
3. Memory usage stays below acceptable thresholds
4. No hanging tests

==== THIRD ANSWER ====

# The Real 20/80 Solution for Test Stability

## 1. Circuit Breakers in Key Recursive Operations (Highest Impact)

The most likely cause of OOM issues is unbounded recursion in services that process complex nested structures. Adding depth limits to these key services would prevent runaway memory consumption:

```typescript
// In TestDebuggerService.ts or similar recursive services
private static MAX_DEPTH = 10;
private currentDepth = 0;

async captureState(point: string, data: any): Promise<void> {
  if (this.currentDepth >= TestDebuggerService.MAX_DEPTH) {
    console.warn(`Maximum capture depth (${TestDebuggerService.MAX_DEPTH}) exceeded at ${point}`);
    return;
  }
  
  this.currentDepth++;
  try {
    // Existing implementation
  } finally {
    this.currentDepth--;
  }
}
```

Apply this pattern to methods like:
- `TestDebuggerService.captureState`
- `TestDebuggerService.analyzeState`
- `TestDebuggerService.visualizeState`
- Any recursive operations in `ResolutionService`
- Any recursive operations in `ImportDirectiveHandler`

## 2. Targeted Test Isolation for Problem Areas

Rather than refactoring all tests, focus on isolating the specific tests that consistently cause OOM issues:

```typescript
// For problematic test files
describe.skip('Memory-intensive tests', () => {
  // Move problematic tests here and run them in isolation
  it('should handle complex nested imports', async () => {
    // Test implementation
  });
});

// Keep the main test suite running reliably
describe('Import handling', () => {
  // Keep simpler tests here
});
```

This allows you to continue making progress on your DI refactoring while isolating problematic tests.

## 3. Automatic Debug Session Cleanup

Ensure debug sessions are always properly terminated, even if tests fail:

```typescript
// In test files using debug sessions
let sessionId: string;

beforeEach(async () => {
  // Setup
  sessionId = await context.startDebugSession();
});

afterEach(async () => {
  // Always clean up the session, even if tests fail
  if (sessionId) {
    try {
      await context.endDebugSession(sessionId);
    } catch (e) {
      console.warn('Failed to end debug session:', e);
    }
    sessionId = undefined;
  }
});
```

## 4. Selective Debug Capture

Modify the debug capture to be more selective about what it captures:

```typescript
// Add options to control capture depth and detail
async startDebugSession(options: { 
  maxDepth?: number,
  skipNodeCapture?: boolean,
  skipStateCapture?: boolean
} = {}): Promise<string> {
  const sessionId = generateId();
  this.sessions.set(sessionId, {
    id: sessionId,
    captures: [],
    operations: [],
    metrics: { startTime: Date.now() },
    options: {
      maxDepth: options.maxDepth || 10,
      skipNodeCapture: options.skipNodeCapture || false,
      skipStateCapture: options.skipStateCapture || false
    }
  });
  return sessionId;
}

// Use these options in the capture method
async captureState(point: string, data: any, sessionId?: string): Promise<void> {
  const session = sessionId ? this.sessions.get(sessionId) : this.activeSession;
  if (!session) return;
  
  // Skip based on options
  if (session.options.skipNodeCapture && data.nodes) {
    data = { ...data, nodes: '[Nodes capture skipped]' };
  }
  
  if (session.options.skipStateCapture && data.state) {
    data = { ...data, state: '[State capture skipped]' };
  }
  
  // Rest of implementation...
}
```

## 5. Test-Specific Memory Limits

Add memory limits specifically for tests:

```typescript
// In your test setup
beforeAll(() => {
  // Set lower memory limits for tests
  if (global.gc) {
    // Force garbage collection before tests
    global.gc();
  }
  
  // Set a reasonable heap limit for tests
  const testHeapLimit = 1024 * 1024 * 512; // 512MB
  if (process.memoryUsage().heapUsed > testHeapLimit) {
    console.warn('Test starting with high memory usage:', 
      Math.round(process.memoryUsage().heapUsed / (1024 * 1024)), 'MB');
  }
});

afterEach(() => {
  // Check memory usage after each test
  if (global.gc) {
    global.gc();
  }
  
  const heapUsed = process.memoryUsage().heapUsed;
  if (heapUsed > 1024 * 1024 * 768) { // 768MB
    console.warn('High memory usage after test:', 
      Math.round(heapUsed / (1024 * 1024)), 'MB');
  }
});
```

## Implementation Strategy

1. **Start with Circuit Breakers (1-2 days)**
   - Identify the key recursive methods in your codebase
   - Add depth tracking and limits to these methods
   - This gives immediate protection against OOM errors

2. **Add Debug Session Controls (1-2 days)**
   - Modify TestDebuggerService to support selective capture
   - Add automatic cleanup in afterEach hooks
   - Update problematic tests to use more conservative debug options

3. **Isolate Problem Tests (1 day)**
   - Move the most problematic tests to separate describe blocks
   - Add .skip to run them only when needed
   - This keeps your CI pipeline stable

4. **Add Memory Monitoring (1 day)**
   - Implement basic memory usage tracking in tests
   - Add warnings when memory usage exceeds thresholds
   - This helps identify problematic tests

This approach:
1. Addresses the root causes of OOM issues
2. Requires minimal changes to your existing code
3. Doesn't disrupt your DI refactoring work
4. Provides immediate stability improvements
5. Respects your existing architecture decisions

The key insight is that you don't need to refactor your entire test suite - you just need targeted interventions in the specific areas causing memory problems.

==== FOURTH ANSWER ====

A more effective approach would be:

## Systematic Memory Profiling

Instead of guessing which methods are problematic, use actual profiling:

```bash
# Run tests with Node.js inspector
NODE_OPTIONS="--inspect --max-old-space-size=4096" npm test api/integration.test.ts
```

Then connect Chrome DevTools to the Node.js process and:
1. Take heap snapshots before and after problematic tests
2. Look for objects with unexpectedly high retention counts
3. Identify actual memory growth patterns

## Targeted Instrumentation

Add temporary instrumentation to suspect areas:

```typescript
// Add to suspect methods
function countObjectSize(obj: any, seen = new Set()): number {
  if (!obj || typeof obj !== 'object') return 0;
  if (seen.has(obj)) return 0;
  seen.add(obj);
  
  let size = 1; // Count this object
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      size += countObjectSize(obj[key], seen);
    }
  }
  return size;
}

// In suspect methods
captureState(point: string, data: any): void {
  const size = countObjectSize(data);
  console.log(`Capturing state at ${point}, data size: ${size} objects`);
  
  // If size is very large, log more details
  if (size > 10000) {
    console.log('Large data structure detected, keys:', Object.keys(data));
    // Maybe log specific large properties
    for (const key in data) {
      const propSize = countObjectSize(data[key], new Set());
      if (propSize > 1000) {
        console.log(`Large property: ${key}, size: ${propSize} objects`);
      }
    }
  }
  
  // Original implementation
}
```

## Leak Detection Helpers

Create helpers to detect potential memory leaks:

```typescript
// Add to test utilities
class LeakDetector {
  private static instances = new WeakMap<object, string>();
  private static counts = new Map<string, number>();
  
  static track(obj: object, type: string): void {
    this.instances.set(obj, type);
    const count = this.counts.get(type) || 0;
    this.counts.set(type, count + 1);
  }
  
  static release(obj: object): void {
    const type = this.instances.get(obj);
    if (type) {
      const count = this.counts.get(type) || 0;
      if (count > 0) {
        this.counts.set(type, count - 1);
      }
    }
  }
  
  static report(): void {
    console.log('Potential leaks:');
    for (const [type, count] of this.counts.entries()) {
      if (count > 0) {
        console.log(`- ${type}: ${count} instances`);
      }
    }
  }
}

// Use in constructors and cleanup methods
class SomeService {
  constructor() {
    LeakDetector.track(this, 'SomeService');
  }
  
  dispose(): void {
    LeakDetector.release(this);
  }
}

// Report at the end of tests
afterAll(() => {
  LeakDetector.report();
});
```

## Simplify Test Execution

Rather than trying to fix everything, focus on getting tests to run reliably:

```typescript
// In problematic test files
describe('Memory-intensive tests', () => {
  // Run tests one at a time to prevent cumulative memory issues
  it.sequential('should handle complex nested imports', async () => {
    // Test implementation
  });
  
  // Force garbage collection between tests if possible
  afterEach(() => {
    if (global.gc) {
      global.gc();
    }
  });
});
```

## The Real 20/80 Approach

The most pragmatic approach might be:

1. **Run tests in smaller batches** - Split your test suite to run in smaller chunks
2. **Increase memory limits for CI** - Sometimes the simplest solution is more resources
3. **Add timeouts to all tests** - Prevent hanging tests with reasonable timeouts
4. **Simplify the most problematic tests** - Focus on the tests that consistently fail
5. **Use actual profiling data** - Make changes based on evidence, not guesswork

This is less elegant than comprehensive fixes, but it's likely to get you unstuck faster so you can continue with your DI refactoring.