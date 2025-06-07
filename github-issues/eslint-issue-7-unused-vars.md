# Issue: ESLint Phase 7 - Unused Variables and Imports

## Summary
Clean up unused variables, imports, and function parameters across the codebase.

## Current State
- ~100 warnings for unused variables
- Some are legitimately unused (event handlers, interface compliance)
- Others can be removed
- Mix of unused imports, variables, and parameters

## Tasks
- [ ] Remove genuinely unused imports
- [ ] Prefix intentionally unused variables with _
- [ ] Remove unused function parameters where possible
- [ ] Use _ prefix for required but unused parameters
- [ ] Clean up unused destructuring assignments

## Patterns to Fix

### Unused Imports
```typescript
// Before
import { path } from 'path'; // Never used

// After
// Remove the import entirely
```

### Unused Parameters
```typescript
// Before
function handler(req, res, next) { // next is unused

// After
function handler(req, res, _next) { // Prefixed with _
```

### Unused Catch Variables
```typescript
// Before
} catch (error) { // error unused

// After  
} catch { // Omit variable if not needed (ES2019+)
```

## Common Locations
- CLI command handlers (unused options parameters)
- Error handlers (unused error variables)
- Test files (unused imports from refactoring)
- Interface implementations (required but unused params)

## Success Criteria
- No unused variable warnings
- Consistent _ prefix convention
- Cleaner imports
- No accidentally removed needed code

## Time Estimate
1-2 hours

## Why This Matters
- Cleaner code is easier to maintain
- Reduces cognitive load
- Helps identify dead code
- ~100 fewer warnings