# Test Context API Cleanup

## Summary
Now that we've completed the migration of all tests to use DI, we should consider simplifying the testing API to remove unnecessary complexity and duplication.

## Motivation
After successfully migrating all core services and directive handlers to use the `TestContextDI.createIsolated()` approach, we've introduced some redundancy in our testing infrastructure:

1. `TestContextDI.create({ isolatedContainer: true })` vs `TestContextDI.createIsolated()` - The former is now obsolete since all tests should use isolated containers
2. `TestContext` vs `TestContextDI` - The "DI" suffix is no longer necessary since all tests use DI

These redundancies make the codebase harder to understand for new developers and increase the maintenance burden.

## Proposed Changes

### Phase 1: Simplify TestContextDI API
1. Modify `TestContextDI.create()` to internally call `createIsolated()` and deprecate the `isolatedContainer` option
2. Add deprecation warnings to guide developers to the simplified API
3. Consider renaming `createIsolated()` back to `create()` since isolation is now the default behavior

### Phase 2: Consolidate TestContext and TestContextDI
1. Have `TestContext` extend or delegate to `TestContextDI` for backward compatibility
2. Gradually migrate all tests to use a single class (likely just `TestContext`)
3. Deprecate and eventually remove the redundant class

## Implementation Details

Before making these changes, we should:
1. Conduct a codebase-wide search for `TestContextDI.create(` to identify any remaining usages that don't specify isolation
2. Check usage patterns of `TestContext` vs `TestContextDI` to understand refactoring scope
3. Create compatibility layers to minimize disruption

Implementation options:

```typescript
// Option 1: Update create() to be an alias for createIsolated()
// In TestContextDI.ts
public static create(options?: TestContextOptions): TestContextDI {
  console.warn('TestContextDI.create() is deprecated. Use TestContextDI.createIsolated() instead.');
  return TestContextDI.createIsolated();
}

// Option 2: Merge TestContext and TestContextDI
// In TestContext.ts
export class TestContext extends TestContextDI {
  // Add any TestContext-specific functionality here
}
```

## Benefits
- Simplified API surface reduces cognitive load for developers
- Clearer documentation and less confusing naming
- Reduced maintenance burden
- Easier onboarding for new developers

## Timeline and Priority
This is a nice-to-have enhancement that should be implemented after all functional DI migration work is complete. Consider targeting this for a cleanup sprint after the main migration effort.

## Dependencies
- Complete migration of all tests to use TestContextDI.createIsolated()
- Comprehensive test coverage to ensure refactoring doesn't introduce regressions 