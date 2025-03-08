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

- Phase 3 (Service Migration) is now complete! 🎉
- All services now support TSyringe dependency injection:
  - Core services (DirectiveService, InterpreterService, etc.)
  - Utility services (SourceMapService, Loggers)
  - CLIService and all its dependencies
- ✅ All tests are now passing with our CLIService fix:
  - Modified the constructor to properly initialize the service immediately for direct instantiation
  - Kept the setTimeout approach for resolving circular dependencies
  - Fixed the root issue that delayed initialization was causing tests to fail
- The key insight was to distinguish between two initialization paths:
  1. Direct constructor instantiation in tests: requires immediate property initialization
  2. DI container instantiation: can use delayed initialization for circular dependencies
- Some test warnings still exist from StringConcatenationHandler but they are expected fallback mechanisms, not actual failures
- Dual-mode support is still required for many tests
- No opt-in mechanism for DI-only mode exists yet
- No formal tracking of test migration status
- No automated verification tools

### Handling Utility Services

Utility services like SourceMapService, Logger, and others require special consideration during the transition to DI-only mode:

1. **Maintain Backward Compatibility**: Even in DI-only mode, legacy code will still import singleton instances directly
2. **Container Registration**: All utility services must be properly registered in the DI container
3. **Service Resolution**: DI-compatible services should resolve utility services from the container
4. **Testing Strategy**: Tests should gradually transition to using container-resolved instances

During Phase 4, we'll need to:
- Ensure all utility services have interfaces and proper TSyringe decorators
- Register all utility services in the DI container
- Update dependent services to inject these utilities rather than importing them
- Extend the test helpers to properly handle utility services in DI-only mode

## Next Steps

1. ✅ Phase 3 (Service Migration) is now complete:
   - ✅ All core services migrated
   - ✅ All utility services migrated
   - ✅ CLIService migration completed
2. Start Phase 4 implementation:
   - [ ] Create the DI-only mode opt-in mechanism for tests
   - [ ] Define batches of tests for migration
   - [ ] Begin migrating tests to DI-only mode
   - [ ] Implement tracking for migration progress
   - [ ] Create automated verification tools

## Related Documents

- [DI Documentation](../reference/di-documentation.md)
- [Service Initialization Patterns](../reference/service-initialization-patterns.md)
- [Utility Services Migration](../reference/utility-services-migration.md) 