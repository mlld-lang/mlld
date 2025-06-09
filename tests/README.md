# Security Testing Framework

This directory contains a comprehensive testing infrastructure for mlld's security features. The framework provides reliable, verifiable testing of security integration, TTL/trust enforcement, and lock file operations.

## Architecture

### Core Components

- **`EnvironmentFactory`**: Creates consistent, configurable test environments
- **`TestEnvironment`**: Enhanced Environment with verification capabilities  
- **`MockSecurityManager`**: Comprehensive mock with call tracking
- **`MockURLCache`**: TTL-aware cache mock with operation verification
- **`MockLockFile`**: Lock file mock with persistence simulation
- **`TTLTestFramework`**: Specialized testing for TTL/trust enforcement
- **`TestSetup`**: Centralized setup/teardown with proper isolation

### Directory Structure

```
tests/
├── setup/                   # Test setup and configuration
│   ├── TestSetup.ts        # Main setup framework
│   └── vitest-security-setup.ts  # Vitest integration
├── utils/                   # Test utilities
│   ├── EnvironmentFactory.ts     # Environment creation
│   ├── TestEnvironment.ts        # Enhanced test environment
│   └── TTLTestFramework.ts       # TTL/trust testing
├── mocks/                   # Mock implementations
│   ├── MockSecurityManager.ts    # Security mock with tracking
│   ├── MockURLCache.ts           # Cache mock with TTL
│   └── MockLockFile.ts           # Lock file mock
├── integration/             # Integration tests
├── unit/                    # Unit tests with mocks
├── e2e/                     # End-to-end tests
└── migration/               # Migration examples
```

## Quick Start

### Basic Security Test

```typescript
import { TestSetup, TestEnvironment } from '../setup/vitest-security-setup';

describe('My Security Feature', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await TestSetup.createSecurityUnitTestEnv();
  });

  afterEach(async () => {
    await TestSetup.afterEach();
  });

  it('should check command security', async () => {
    await env.executeCommand('echo test');
    
    // Verify security was checked
    expect(env.wasCommandChecked('echo test')).toBe(true);
    
    // Get detailed verification
    const verification = await env.verifySecurityCalls();
    expect(verification.commandChecks).toHaveLength(1);
  });
});
```

### TTL/Trust Testing

```typescript
import { TTLTestFramework } from '../utils/TTLTestFramework';

describe('TTL Enforcement', () => {
  let env: TestEnvironment;
  let ttlFramework: TTLTestFramework;

  beforeEach(async () => {
    env = await TestSetup.createTTLTestEnv();
    ttlFramework = new TTLTestFramework(env);
  });

  it('should enforce static TTL', async () => {
    const result = await ttlFramework.testTTLEnforcement(
      'https://test.com/data',
      { type: 'static' }
    );
    
    expect(result.behaviorCorrect).toBe(true);
    expect(result.fetches[1].fromCache).toBe(true);
  });
});
```

### Lock File Testing

```typescript
describe('Lock File Operations', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await TestSetup.createLockFileTestEnv();
  });

  it('should track lock file operations', async () => {
    const lockFile = env.getLockFile();
    
    await lockFile.addImport('https://example.com', {
      resolved: 'https://example.com',
      integrity: 'sha256-abc',
      approvedAt: new Date().toISOString(),
      approvedBy: 'test-user',
      trust: 'always'
    });
    
    const verification = await env.verifyLockFileOperations();
    expect(verification.writes).toBeGreaterThan(0);
  });
});
```

## Environment Types

### Security Unit Tests
- **Use**: Testing security logic with mocks
- **Setup**: `TestSetup.createSecurityUnitTestEnv()`
- **Features**: MockSecurityManager, isolated environment
- **Performance**: Fast execution, reliable mocking

### Security Integration Tests  
- **Use**: Testing security component integration
- **Setup**: `TestSetup.createSecurityIntegrationTestEnv()`
- **Features**: Real SecurityManager, actual policy evaluation
- **Performance**: Slower but more realistic

### TTL Tests
- **Use**: Testing TTL/trust enforcement
- **Setup**: `TestSetup.createTTLTestEnv()`
- **Features**: TTL-aware cache, strict enforcement
- **Performance**: Medium speed, time-sensitive tests

### Lock File Tests
- **Use**: Testing lock file operations
- **Setup**: `TestSetup.createLockFileTestEnv()`
- **Features**: Mock lock file with persistence simulation
- **Performance**: Fast, comprehensive operation tracking

### E2E Tests
- **Use**: Full workflow testing
- **Setup**: `TestSetup.createE2ETestEnv()`
- **Features**: Real components, temporary filesystem
- **Performance**: Slowest but most comprehensive

## Test Patterns

### 1. Command Security Verification

```typescript
it('should verify command security check', async () => {
  // Configure expected behavior
  env.mockCommandApproval('risky-command', { 
    allowed: false, 
    reason: 'Too risky' 
  });
  
  // Execute and verify security check
  await expect(env.executeCommand('risky-command')).rejects.toThrow();
  expect(env.wasCommandChecked('risky-command')).toBe(true);
  
  // Get detailed results
  const verification = await env.verifySecurityCalls();
  expect(verification.commandChecks[0].result.allowed).toBe(false);
});
```

### 2. Trust Level Propagation

```typescript
it('should pass trust level to security context', async () => {
  const directive = TTLTestFramework.createDirectiveWithMetadata(
    'run',
    'echo test',
    { trust: 'verify' }
  );
  
  await env.evaluate(directive);
  
  const verification = await env.verifySecurityCalls();
  expect(verification.commandChecks[0].context?.metadata?.trust).toBe('verify');
});
```

### 3. TTL Behavior Verification

```typescript
it('should enforce duration-based TTL', async () => {
  const result = await ttlFramework.testTTLEnforcement(
    'https://test.com/data',
    { type: 'duration', value: 1000 } // 1 second
  );
  
  // Should cache initially
  expect(result.fetches[1].fromCache).toBe(true);
  
  // Should expire after timeout
  expect(result.fetches[2].fromCache).toBe(false);
});
```

### 4. Taint Tracking Verification

```typescript
it('should track taint propagation', async () => {
  const sm = env.getSecurityManager();
  sm.trackTaint('user-input', 'user_input');
  
  const verification = await env.verifySecurityCalls();
  expect(verification.taintOperations).toHaveLength(1);
  expect(verification.taintOperations[0].source).toBe('user_input');
});
```

### 5. Environment Verification

```typescript
it('should verify test environment setup', async () => {
  const verification = await TestSetup.verifyTestEnvironment(env);
  expect(verification.isValid).toBe(true);
  
  const integration = await env.verifySecurityIntegration();
  expect(integration.securityManagerAvailable).toBe(true);
});
```

## Mock Configuration

### Security Manager Mocking

```typescript
// Configure command decisions
env.mockCommandApproval('safe-command', { allowed: true });
env.mockCommandApproval('blocked-command', { allowed: false, reason: 'Blocked' });

// Configure path access
env.mockPathAccess('/safe/path', 'read', true);
env.mockPathAccess('/blocked/path', 'write', false);

// Pre-populate taint data
const sm = env.getSecurityManager() as MockSecurityManager;
sm.mockTaintData('tainted-value', TaintLevel.USER_INPUT);
```

### URL Cache Mocking

```typescript
// Pre-populate cache responses
env.mockURLResponse('https://example.com/data', 'cached content');

// Configure TTL behavior
const cache = env.getURLCache() as MockURLCache;
cache.setTTLBehavior('strict'); // or 'lenient'
cache.mockCacheExpiry('https://expired.com/data');
```

### Lock File Mocking

```typescript
// Pre-populate import entries
const lockFile = env.getLockFile() as MockLockFile;
lockFile.mockImportEntry('https://example.com', {
  trust: 'always',
  integrity: 'sha256-abc123'
});

// Pre-populate command approvals
lockFile.mockCommandApproval('npm test', {
  trust: 'pattern',
  approvedBy: 'test-user'
});
```

## Verification Methods

### Security Verification

```typescript
const verification = await env.verifySecurityCalls();

// Command checks
expect(verification.commandChecks).toHaveLength(2);
expect(verification.commandChecks[0].command).toBe('echo test');
expect(verification.commandChecks[0].result.allowed).toBe(true);

// Path checks  
expect(verification.pathChecks[0].path).toBe('/test/file');
expect(verification.pathChecks[0].operation).toBe('read');

// Taint operations
expect(verification.taintOperations[0].source).toBe('user_input');
```

### Cache Verification

```typescript
const cacheVerification = await env.verifyCacheOperations();

expect(cacheVerification.cacheHits).toBe(1);
expect(cacheVerification.cacheMisses).toBe(1);
expect(cacheVerification.cacheOperations[0].operation).toBe('get');
```

### Lock File Verification

```typescript
const lockVerification = await env.verifyLockFileOperations();

expect(lockVerification.reads).toBeGreaterThan(0);
expect(lockVerification.writes).toBeGreaterThan(0);
expect(lockVerification.operations[0].operation).toBe('addImport');
```

## Common Patterns

### Setup Common Mocks

```typescript
beforeEach(async () => {
  env = await TestSetup.createSecurityUnitTestEnv();
  TestSetup.setupCommonMocks(env); // Adds standard safe/dangerous commands
});
```

### Debugging Failed Tests

```typescript
it('should debug test failures', async () => {
  await env.executeCommand('echo test');
  
  // Get comprehensive test state for debugging
  const verification = await env.verifySecurityCalls();
  const duration = env.getTestDuration();
  const securityIntegration = await env.verifySecurityIntegration();
  
  if (verification.commandChecks.length === 0) {
    console.error('No security checks - SecurityManager not initialized?');
  }
  
  if (!securityIntegration.securityManagerAvailable) {
    console.error('SecurityManager not available in test environment');
  }
});
```

### Test Isolation Verification

```typescript
it('should isolate test state', async () => {
  env.mockCommandApproval('test1', { allowed: true });
  await env.executeCommand('test1');
  
  const count1 = env.getSecurityCheckCount();
  expect(count1).toBe(1);
  
  // Reset for next test phase
  env.resetMocks();
  
  const count2 = env.getSecurityCheckCount();
  expect(count2).toBe(0);
});
```

## Migration Guide

To migrate existing tests to the new framework:

1. **Replace environment setup**:
   ```typescript
   // OLD
   const env = new Environment({ ... });
   
   // NEW  
   const env = await TestSetup.createSecurityUnitTestEnv();
   ```

2. **Add security verification**:
   ```typescript
   // OLD
   await env.executeCommand('test');
   
   // NEW
   await env.executeCommand('test');
   expect(env.wasCommandChecked('test')).toBe(true);
   ```

3. **Use TTL testing framework**:
   ```typescript
   // OLD
   // Manual TTL testing (unreliable)
   
   // NEW
   const ttlFramework = new TTLTestFramework(env);
   const result = await ttlFramework.testTTLEnforcement(url, ttl);
   expect(result.behaviorCorrect).toBe(true);
   ```

4. **Add cleanup**:
   ```typescript
   afterEach(async () => {
     await TestSetup.afterEach();
   });
   ```

## Running Tests

```bash
# Run all security tests
npm run test:security

# Run specific test files
npm run test:security -- security-integration

# Run with coverage
npm run test:security -- --coverage

# Run in watch mode
npm run test:security -- --watch
```

## Performance Guidelines

- **Unit tests**: Should run in < 100ms each
- **Integration tests**: Should run in < 1000ms each  
- **TTL tests**: May take 2-5 seconds due to timing requirements
- **E2E tests**: May take 5-10 seconds each

## Troubleshooting

### SecurityManager Not Available
- Ensure using `TestSetup.createSecurityUnitTestEnv()` or similar
- Check if security is enabled in environment config
- Verify no silent initialization failures

### Lock File Operations Failing  
- Use `TestSetup.createLockFileTestEnv()` for lock file tests
- Ensure lock file is configured as `enabled: true`
- Check for read-only environment issues

### TTL Tests Inconsistent
- Use `TestSetup.createTTLTestEnv()` with strict TTL behavior
- Ensure sufficient time delays for duration-based TTL
- Mock time if needed for deterministic tests

### Test Isolation Issues
- Always call `TestSetup.afterEach()` in cleanup
- Use `env.resetMocks()` to clear mock state
- Avoid sharing state between test cases