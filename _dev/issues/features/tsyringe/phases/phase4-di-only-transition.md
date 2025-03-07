# Phase 4: DI-Only Mode Transition

This phase focuses on methodically transitioning the codebase to DI-only mode without breaking existing functionality. It introduces an opt-in approach for tests to make the transition manageable.

## Objectives

1. Create an opt-in mechanism for DI-only mode in tests
2. Update tests in batches to use DI-only mode
3. Track migration progress
4. Create automated verification tools

## Tasks

### 1. DI-Only Mode Opt-In Mechanism

**Objective**: Create a way for tests to opt into DI-only mode without affecting other tests.

**Implementation**:
- [ ] Create a `MIGRATE_TO_DI_ONLY` flag that tests can set
- [ ] Modify TestContextDI to support this flag
- [ ] Update the `shouldUseDI()` function to check for this flag
- [ ] Add documentation for using this flag

**Example Implementation**:
```typescript
// In TestContextDI.ts
interface TestContextDIOptions {
  useDI?: boolean;
  diOnlyMode?: boolean; // New option
}

class TestContextDI {
  public readonly useDI: boolean;
  public readonly diOnlyMode: boolean;
  
  static create(options: TestContextDIOptions = {}): TestContextDI {
    const context = new TestContextDI();
    context.useDI = options.useDI ?? shouldUseDI();
    context.diOnlyMode = options.diOnlyMode ?? false;
    
    // Set the environment flag for tests that opt-in to DI-only mode
    if (context.diOnlyMode) {
      process.env.MIGRATE_TO_DI_ONLY = 'true';
    }
    
    return context;
  }
  
  // Clean up method should reset the environment
  async cleanup(): Promise<void> {
    if (this.diOnlyMode) {
      delete process.env.MIGRATE_TO_DI_ONLY;
    }
    // Other cleanup...
  }
}

// In ServiceProvider.ts
export const shouldUseDI = (): boolean => {
  // Check for the migration flag first
  if (process.env.MIGRATE_TO_DI_ONLY === 'true') {
    return true;
  }
  // Otherwise use the existing logic
  return process.env.USE_DI === 'true';
};
```

**Success Criteria**:
- Tests can opt into DI-only mode without affecting other tests
- The existing test suite still passes
- The mechanism is well-documented

### 2. Test Migration in Batches

**Objective**: Methodically update tests to use DI-only mode in manageable batches.

**Implementation**:
- [ ] Identify groups of related tests for batch migration
- [ ] Start with tests for foundation services
- [ ] Progress to tests for intermediate services
- [ ] Finally update tests for complex services
- [ ] Document any test-specific patterns or exceptions

**Example Implementation**:
```typescript
describe('PathOperationsService', () => {
  let context: TestContextDI;
  let service: IPathOperationsService;

  beforeEach(() => {
    // Opt-in to DI-only mode
    context = TestContextDI.create({ diOnlyMode: true });
    
    // Get service from container
    service = context.container.resolve<IPathOperationsService>('IPathOperationsService');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  // Tests...
});
```

**Success Criteria**:
- Tests successfully run in DI-only mode
- No failures or regressions
- Clear patterns established for test migration

### 3. Migration Progress Tracking

**Objective**: Track the progress of test migration to DI-only mode.

**Implementation**:
- [ ] Create a tracking document for test migration status
- [ ] Record any issues encountered during migration
- [ ] Document test-specific patterns or exceptions
- [ ] Update the main README with progress regularly

**Success Criteria**:
- Clear visibility into test migration progress
- Documentation of challenges and solutions
- Regular updates to the README

### 4. Automated Verification

**Objective**: Create tools to verify DI compatibility and identify remaining issues.

**Implementation**:
- [ ] Create a script to run tests with `MIGRATE_TO_DI_ONLY=true`
- [ ] Add verification to CI pipeline to ensure DI compatibility
- [ ] Create a utility to identify services that still depend on non-DI mode
- [ ] Add warnings for deprecated non-DI patterns

**Example Implementation**:
```typescript
// Script to verify DI-only mode compatibility
import { execSync } from 'child_process';

// Run tests with DI-only mode
process.env.MIGRATE_TO_DI_ONLY = 'true';
try {
  execSync('npm test', { stdio: 'inherit' });
  console.log('All tests pass in DI-only mode!');
} catch (error) {
  console.error('Some tests fail in DI-only mode:', error);
  process.exit(1);
}
```

**Success Criteria**:
- Automated verification tools work correctly
- CI pipeline includes DI compatibility checks
- Clear reporting of DI compatibility status

## Current Status

- Dual-mode support is still required for many tests
- No opt-in mechanism for DI-only mode exists
- No formal tracking of test migration status
- No automated verification tools

## Next Steps

1. Create the DI-only mode opt-in mechanism
2. Begin migrating tests in manageable batches
3. Implement tracking for migration progress
4. Create automated verification tools

## Related Documents

- [DI Documentation](../reference/di-documentation.md)
- [Service Initialization Patterns](../reference/service-initialization-patterns.md) 