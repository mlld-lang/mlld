# TSyringe DI Implementation Clean-up Tasks (Revised Approach)

This document outlines cleanup tasks for the TSyringe dependency injection implementation, focusing on what can be improved **without breaking existing tests**. These tasks should be completed before attempting to switch to DI-only mode.

## Methodical Approach Overview

See `tsyringe-cleanup-approach.md` for our complete methodical migration strategy. The key principle is to clean up implementation details first, while preserving both DI and non-DI functionality until tests can be updated.

## Phase 1: Cleanup Tasks (Current Focus)

These tasks can be implemented without disrupting the dual-mode system:

### 1. Path Normalization Improvement

**Issue**: Path handling is inconsistent and brittle across the codebase.

**Approach**:
- Create a standardized `normalizeMeldPath` utility in PathOperationsService
- Implement it with consistent rules (forward slashes, absolute paths, no trailing slashes)
- Add it to TestSnapshot and other key services
- **Important**: Don't force its use everywhere yet - maintain backward compatibility

**Example**:
```typescript
export function normalizeMeldPath(path: string): string {
  if (!path) return '/';
  
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

### 2. Constructor Simplification

**Issue**: Service constructors have complex conditional logic to support both DI and non-DI modes.

**Approach**:
- Refactor constructors to be more readable
- Preserve dual-mode functionality for now
- Extract complex initialization logic to helper methods
- Improve property naming and organization

**Example** (StateService):
```typescript
// Before
constructor(
  @inject(StateFactory) stateFactory?: StateFactory,
  @inject('IStateEventService') eventService?: IStateEventService,
  @inject('IStateTrackingService') trackingService?: IStateTrackingService,
  parentState?: IStateService
) {
  if (stateFactory) {
    // DI mode - complex logic...
  } else {
    // Non-DI mode - even more complex logic...
  }
}

// After
constructor(
  @inject(StateFactory) stateFactory?: StateFactory,
  @inject('IStateEventService') eventService?: IStateEventService,
  @inject('IStateTrackingService') trackingService?: IStateTrackingService,
  parentState?: IStateService
) {
  this.initializeFromParams(stateFactory, eventService, trackingService, parentState);
}

private initializeFromParams(
  stateFactory?: StateFactory,
  eventService?: IStateEventService,
  trackingService?: IStateTrackingService,
  parentState?: IStateService
): void {
  if (stateFactory) {
    this.initializeDIMode(stateFactory, eventService, trackingService, parentState);
  } else {
    this.initializeLegacyMode(eventService, trackingService, parentState);
  }
}
```

### 3. Documentation

**Issue**: DI implementation details and migration strategy are not well documented.

**Approach**:
- Create comprehensive DI documentation at `docs/dev/DI.md`
- Document dual-mode patterns currently in use
- Add migration guidance for future work
- Document path normalization standards

### 4. Test Helpers Improvement

**Issue**: Test utilities don't fully support both modes consistently.

**Approach**:
- Enhance TestContextDI to better handle both modes
- Add utilities for normalizing paths in tests
- Improve error messages for common test setup issues
- **Maintain backward compatibility**

## Phase 2: Next Steps (Future Work)

After cleanup is complete, we can begin the incremental migration:

1. Update test utilities to prepare for DI-only mode
2. Begin migrating individual services one at a time
3. Update tests to work with DI-only services
4. Create opt-in flag for DI-only mode in tests

## Implementation Strategy

For each cleanup task:

1. Focus on one service at a time
2. Make minimal changes needed for improvement
3. Run tests after each change to ensure nothing breaks
4. Use verbose commit messages to document your approach
5. Request focused code reviews