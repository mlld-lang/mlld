# Issue: ESLint Phase 5 - Test File Cleanup

## Summary
Fix warnings in test files and test utilities, including unused variables and mock console usage.

## Current State
- Test utilities have console.log in mocks (legitimate use)
- Unused variables in test error handlers
- Mock functions with unused parameters
- ~50 warnings across test files

## Tasks
- [ ] Add test file exemptions to eslint.config.mjs
- [ ] Fix unused variables (prefix with _ or remove)
- [ ] Allow console in test mock utilities
- [ ] Clean up unused imports in test files

## Code Changes

### eslint.config.mjs
```javascript
{
  files: ['tests/utils/cli/mockConsole.ts'],
  rules: {
    'no-console': 'off', // Mock needs to use real console
  }
}
```

### Fix Unused Variables
```typescript
// Before
} catch (e) {
  // Not using e
}

// After
} catch (_e) {
  // Prefixed with _ to indicate intentionally unused
}
```

## Affected Files
- `tests/utils/cli/mockConsole.ts` (console warnings)
- `tests/utils/cli/mockProcessExit.ts`
- `cli/commands/init.test.ts` (unused variables)
- `tests/utils/FileSystemAdapter.ts`
- `tests/utils/MemoryFileSystem.ts`

## Success Criteria
- No warnings in test utility files
- Unused variables properly handled
- Test mocks work correctly
- Clear exemptions for test-specific needs

## Time Estimate
1-2 hours

## Why This Matters
- Clean test output helps identify real issues
- Test utilities have different needs than production code
- Reduces warning count by ~50