# TSyringe DI Implementation Clean-up Plan

This document outlines the structured approach to cleaning up the technical debt in the TSyringe dependency injection implementation. It focuses specifically on implementation details for the critical issues identified in [tsyringe-cleanup.md](./tsyringe-cleanup.md).

## Phase 1: Removing Dual-Mode Pattern

The dual-mode pattern (supporting both DI and non-DI modes simultaneously) creates significant complexity throughout the codebase. Our approach to removing it will be:

### Step 1: Environment Configuration

1. Remove the `USE_DI` environment variable check:
   - Locate and remove all occurrences of `shouldUseDI()` function
   - Remove any conditional branches that check for DI mode
   - The system will now always use DI

### Step 2: Constructor Simplification

For each service class:
1. Update constructor parameters to be required (not optional) where appropriate
2. Remove conditional logic that branches based on whether a dependency exists
3. Remove legacy initialization paths
4. Ensure correct `@injectable()` decorator is present
5. Fix return types for all methods that may have been affected

Example transformation for StateService:

```typescript
// BEFORE:
constructor(
  @inject(StateFactory) stateFactory?: StateFactory,
  @inject('IStateEventService') eventService?: IStateEventService,
  @inject('IStateTrackingService') trackingService?: IStateTrackingService,
  parentState?: IStateService
) {
  // Handle constructor for both DI and non-DI modes
  if (stateFactory) {
    // DI mode or manual initialization with factory
    this.stateFactory = stateFactory;
    this.eventService = eventService;
    this.trackingService = trackingService;
    
    // Initialize new state
    this.initializeState(parentState);
  } else {
    // Legacy mode - initialize with basic factory
    this.stateFactory = new StateFactory();
    
    // Legacy constructor overloading - handle various parameters
    if (eventService && !trackingService && !parentState) {
      // Handle StateService(eventService) legacy signature
      this.eventService = eventService as IStateEventService;
      this.initializeState();
    } else if (eventService && !trackingService && parentState) {
      // Handle StateService(parentState) legacy signature
      // In this case eventService is actually the parentState
      this.initializeState(eventService as unknown as IStateService);
    } else {
      // Default case or explicit initialize() call later
      this.initializeState(parentState as IStateService);
    }
  }
}

// AFTER:
@injectable()
constructor(
  @inject(StateFactory) private stateFactory: StateFactory,
  @inject('IStateEventService') private eventService?: IStateEventService,
  @inject('IStateTrackingService') private trackingService?: IStateTrackingService,
  parentState?: IStateService
) {
  // Initialize new state
  this.initializeState(parentState);
}
```

### Step 3: Fix initialize() Methods

1. Simplify or remove `initialize()` methods that were designed for legacy non-DI mode
2. Replace with proper factory methods for any special initialization cases
3. Ensure services are fully initialized after constructor completes

## Phase 2: Path Normalization

The path normalization approach is currently brittle and relies on pattern detection to identify test suites. We'll implement a more robust solution.

### Step 1: Unified Path Format

1. Create a centralized path normalization utility
2. Define a consistent path format convention for the entire codebase
3. Document the path format expectations

```typescript
/**
 * Normalize a file path to the standard format used throughout the codebase.
 * This ensures consistent handling of paths across different platforms and contexts.
 * 
 * Standard format:
 * - Always use forward slashes, never backslashes
 * - Paths are always absolute (start with '/')
 * - No trailing slashes except for root ('/')
 */
export function normalizePath(path: string): string {
  // Replace backslashes with forward slashes
  let normalized = path.replace(/\\/g, '/');
  
  // Ensure path starts with a slash
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  
  // Remove trailing slash unless it's the root path
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}
```

### Step 2: Update TestSnapshot

1. Update the TestSnapshot class to use the centralized path normalization
2. Remove test suite detection logic and special case handling

```typescript
/**
 * Compare two snapshots and return the differences
 */
compare(before: Map<string, string>, after: Map<string, string>): SnapshotDiff {
  // Normalize paths for consistent comparison
  const normalizedBefore = this.normalizePaths(before);
  const normalizedAfter = this.normalizePaths(after);
  
  // Get paths from normalized maps
  const beforePaths = Array.from(normalizedBefore.keys());
  const afterPaths = Array.from(normalizedAfter.keys());
  
  // Calculate differences
  const added = afterPaths.filter(path => !normalizedBefore.has(path));
  const removed = beforePaths.filter(path => !normalizedAfter.has(path));
  const modified = beforePaths.filter(path => 
    normalizedAfter.has(path) && 
    normalizedBefore.get(path) !== normalizedAfter.get(path)
  );
  
  // Build modified contents map
  const modifiedContents = new Map<string, string>();
  for (const path of modified) {
    const content = normalizedAfter.get(path);
    if (content !== undefined) {
      modifiedContents.set(path, content);
    }
  }
  
  return {
    added,
    removed,
    modified,
    modifiedContents
  };
}

/**
 * Normalize paths in a snapshot to ensure consistent comparison
 * across different test environments
 */
private normalizePaths(snapshot: Map<string, string>): Map<string, string> {
  const normalized = new Map<string, string>();
  
  for (const [path, content] of snapshot.entries()) {
    normalized.set(normalizePath(path), content);
  }
  
  return normalized;
}
```

### Step 3: Update Test Files

1. Update FileSystemService.test.ts to use the normalized paths
2. Remove special case handling in test files that was added to work around path format issues
3. Update all tests to have consistent path format expectations

## Phase 3: Documentation

Create comprehensive documentation for the DI system:

1. **Developer Guide** - How to create DI-compatible services
2. **Testing with DI** - Patterns for testing services with dependencies
3. **Architecture Documentation** - Update to include DI concepts and patterns
4. **Migration Guide** - Instructions for converting any remaining legacy services to DI

## Testing Strategy

For each phase:

1. Start with unit tests to verify individual service updates
2. Run integration tests to ensure services work together correctly
3. Run the full test suite to ensure no regressions

## Rollout Plan

1. Implement changes on a feature branch (e.g., `feature/tsyringe-cleanup`)
2. Create a PR with early feedback from the team
3. Implement the changes in small, focused commits
4. Merge to main once all tests pass

## Success Criteria

1. All dual-mode conditional logic is removed
2. Path normalization is consistent and robust
3. All tests pass
4. Code is more maintainable and easier to understand