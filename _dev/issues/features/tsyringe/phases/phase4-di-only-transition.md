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
- [x] Create a `MIGRATE_TO_DI_ONLY` flag that tests can set
- [x] Modify TestContextDI to support this flag
- [x] Update the `shouldUseDI()` function to check for this flag
- [x] Add documentation for using this flag

**Implementation Details**:
```typescript
// In TestContextDI.ts
interface TestContextDIOptions {
  useDI?: boolean;
  diOnlyMode?: boolean; // New option
}

class TestContextDI {
  public readonly useDI: boolean;
  public readonly diOnlyMode: boolean;
  
  constructor(options: TestContextDIOptions = {}) {
    // Set DI-only mode if specified
    this.diOnlyMode = options.diOnlyMode ?? false;

    // Set environment variables for DI modes
    if (this.diOnlyMode) {
      // DI-only mode forces DI regardless of other settings
      process.env.MIGRATE_TO_DI_ONLY = 'true';
      process.env.USE_DI = 'true';
    }
    
    // Set useDI property for easy access
    this.useDI = this.diOnlyMode || shouldUseDI();
  }
  
  // Clean up method should reset the environment
  async cleanup(): Promise<void> {
    // Reset environment variables if we set them
    if (this.diOnlyMode) {
      delete process.env.MIGRATE_TO_DI_ONLY;
    }
    // Other cleanup...
  }
  
  // Helper method for easy adoption
  static withDIOnlyMode(options: Partial<Omit<TestContextDIOptions, 'diOnlyMode' | 'useDI'>> = {}): TestContextDI {
    return new TestContextDI({
      ...options,
      diOnlyMode: true
    });
  }
}

// In ServiceProvider.ts
export const shouldUseDI = (): boolean => {
  // Check for the migration flag first (highest priority)
  if (process.env.MIGRATE_TO_DI_ONLY === 'true') {
    return true;
  }
  // Then check the standard flag
  return process.env.USE_DI === 'true';
};
```

**Success Criteria**:
- ✅ Tests can opt into DI-only mode without affecting other tests
- ✅ The existing test suite still passes
- ✅ The mechanism is well-documented
- ✅ TestContextDI.withDIOnlyMode() helper method is available

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
- ✅ DI-only mode opt-in mechanism is now implemented:
  - Added `diOnlyMode` option to TestContextDI
  - Updated shouldUseDI() to check for MIGRATE_TO_DI_ONLY environment variable
  - Added TestContextDI.withDIOnlyMode() helper method
  - Added proper environment variable cleanup
- ✅ Migration tracking system implemented:
  - Created verification script to test files in DI-only mode
  - Set up tracking directory and migration plan
  - Implemented automated compatibility summary generation
- ✅ Initial test migrations successful:
  - FileSystemService tests (3 files) fully migrated
  - PathService tests fixed to work in DI-only mode
  - Current progress: 50% of foundation services (4/8), 7.7% overall (4/52)
- Some test warnings still exist from StringConcatenationHandler but they are expected fallback mechanisms, not actual failures
- Dual-mode support is still required for many tests

### Example Test Migration

Here's an example of how to migrate a test to use DI-only mode:

**Before:**
```typescript
describe('SomeService', () => {
  let context: TestContext;
  let service: SomeService;

  beforeEach(() => {
    context = new TestContext();
    service = new SomeService(
      context.services.dependency1, 
      context.services.dependency2
    );
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should do something', () => {
    // Test code
  });
});
```

**After (with DI-only mode):**
```typescript
describe('SomeService', () => {
  let context: TestContextDI;
  let service: ISomeService;

  beforeEach(() => {
    // Use withDIOnlyMode to opt into DI-only mode
    context = TestContextDI.withDIOnlyMode();
    
    // Resolve the service from the container using the interface token
    service = context.resolve<ISomeService>('ISomeService');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should do something', () => {
    // Test code remains the same
  });
});
```

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

## Updated Strategic Approach for Phase 4

Based on our recent experiences with circular dependencies and test timeouts, we've developed a more comprehensive strategy to address these issues systematically.

### Service Mediator Pattern

Rather than fixing circular dependencies with one-off setter methods, we'll implement a Service Mediator pattern:

```typescript
@singleton()
export class ServiceMediator {
  private parserService?: IParserService;
  private resolutionService?: IResolutionService;
  private fileSystemService?: IFileSystemService;
  private pathService?: IPathService;

  // Setters for each service
  setParserService(service: IParserService): void {
    this.parserService = service;
  }
  
  setResolutionService(service: IResolutionService): void {
    this.resolutionService = service;
  }
  
  // Mediated methods for parser ↔ resolution interaction
  async resolveVariableForParser(variable: string, context: any): Promise<string> {
    if (!this.resolutionService) {
      throw new Error('ResolutionService not initialized in mediator');
    }
    return this.resolutionService.resolveInContext(variable, context);
  }

  async parseForResolution(content: string): Promise<any[]> {
    if (!this.parserService) {
      throw new Error('ParserService not initialized in mediator');
    }
    return this.parserService.parse(content);
  }
}
```

For complete details on this approach, see [circular-dependency-strategic-plan.md](../reference/circular-dependency-strategic-plan.md).

## Next Steps

1. ✅ Phase 3 (Service Migration) is now complete:
   - ✅ All core services migrated
   - ✅ All utility services migrated
   - ✅ CLIService migration completed

2. Phase 4 Strategic Infrastructure:
   - [ ] Implement Service Mediator pattern
     - [ ] Create ServiceMediator class
     - [ ] Update di-config.ts to use the mediator
     - [ ] Refactor core services to work with the mediator
   - [ ] Enhance test framework for better memory management
     - [ ] Add improved cleanup procedures
     - [ ] Implement test-specific timeouts
     - [ ] Create lightweight mock services for transformation tests
   - [ ] Fix transformation test issues
     - [ ] Address embed-transformation-e2e.test.ts timeouts
     - [ ] Fix nested array access tests
     - [ ] Create patterns for testing transformation scenarios

3. Continue Phase 4 implementation progress:
   - ✅ Create the DI-only mode opt-in mechanism for tests
   - ✅ Define batches of tests for migration (start with foundation services)
   - ✅ Begin migrating tests to DI-only mode using the new opt-in mechanism
     - ✅ FileSystemService tests (3 files) successfully migrated
     - ✅ PathService test successfully fixed
     - [ ] Continue with ProjectPathResolver and other foundation services
   - ✅ Implement tracking for migration progress
   - ✅ Create automated verification tools for DI compatibility

4. Continue with remaining tests in Batch 1:
   - [ ] ProjectPathResolver.test.ts
   - [ ] CircularityService tests
   - [ ] ValidationService tests
   - [ ] StateEventService tests
   - [ ] StateService tests

## DI-Only Mode Verification Script

Next, we'll create a script to verify tests in DI-only mode:

```javascript
// scripts/verify-di-only-mode.js
const { execSync } = require('child_process');

// Run a specific test file with DI-only mode
function runTestWithDIOnly(testFile) {
  console.log(`Running ${testFile} with DI-only mode...`);
  
  try {
    process.env.MIGRATE_TO_DI_ONLY = 'true';
    execSync(`npm test ${testFile}`, { stdio: 'inherit' });
    console.log(`✅ ${testFile} passed in DI-only mode!`);
    return true;
  } catch (error) {
    console.error(`❌ ${testFile} failed in DI-only mode:`, error.message);
    return false;
  } finally {
    delete process.env.MIGRATE_TO_DI_ONLY;
  }
}

// Test files to verify
const testFiles = process.argv.slice(2);

if (testFiles.length === 0) {
  console.log('Usage: node scripts/verify-di-only-mode.js <test-file-paths>');
  process.exit(1);
}

// Run each test file
let passCount = 0;
let failCount = 0;

for (const file of testFiles) {
  const passed = runTestWithDIOnly(file);
  passed ? passCount++ : failCount++;
}

console.log(`\nResults: ${passCount} passed, ${failCount} failed`);
process.exit(failCount > 0 ? 1 : 0);
```

## Related Documents

- [Strategic Circular Dependency Plan](../reference/circular-dependency-strategic-plan.md) - Comprehensive approach with Service Mediator pattern
- [Circular Dependency Fix](../reference/circular-dependency-fix.md) - Current approach with setter methods
- [Test Fix Guide](../reference/test-fix-guide.md) - Patterns for fixing DI-related test issues
- [DI Documentation](../reference/di-documentation.md) - Guidelines for using DI
- [Service Initialization Patterns](../reference/service-initialization-patterns.md) - Common patterns in the codebase
- [Utility Services Migration](../reference/utility-services-migration.md) - Strategy for migrating utility services
- [Migration Plan](../tracking/migration-plan.md) - Test migration batches and plan
- [DI Compatibility Summary](../tracking/di-compatibility-summary.md) - Current status of test migration

## Implementation Summary

In this implementation, we have:

1. **Enhanced TestContextDI**:
   - Added `diOnlyMode` option to TestContextDI options interface
   - Added diOnlyMode property to TestContextDI class
   - Updated constructor to set environment variables appropriately
   - Added proper cleanup of environment variables
   - Created a withDIOnlyMode() helper method for easy adoption

2. **Updated ServiceProvider**:
   - Modified shouldUseDI() to check for MIGRATE_TO_DI_ONLY environment variable
   - Improved documentation to explain the priority order of environment variables

3. **Created Migration Tools**:
   - Implemented a verification script (scripts/verify-di-only-mode.js)
   - Set up tracking directory structure
   - Created migration plan with batches for orderly migration
   - Created tracking system for test compatibility status
   - Added example migration pattern for test authors to follow

4. **Updated Documentation**:
   - Updated README with current status
   - Updated phase documentation
   - Added detailed implementation examples

5. **Initial Test Migrations**:
   - Successfully migrated FileSystemService tests (3 test files)
   - Fixed PathService memory issues in DI-only mode by:
     - Replacing dynamic imports with static mock implementations
     - Creating simplified mock parser for better memory usage
     - Testing in three modes simultaneously (DI, no-DI, DI-only)
     - Adding proper cleanup for memory-intensive resources
     - Implementing better handling of path resolution in DI-only mode
   - Updated tracking documentation to show 50% of foundation tests now passing
   - Created patterns for other test authors to follow

The foundation is now in place, and we have demonstrated successful test migration patterns. We'll continue methodically working through the remaining tests in Batch 1, then move to subsequent batches. 