# Issue: ESLint Phase 3 - TypeScript Type Safety (API & Config)

## Summary
Fix TypeScript unsafe any assignments in API and build configuration files.

## Current State
- `api/index.ts`: 3 unsafe assignment/call errors
- `tsup.config.ts`: ~20 unsafe any errors from untyped esbuild config
- These are critical files that should have proper typing

## Tasks
- [ ] Add proper error typing in api/index.ts
- [ ] Type the esbuild configuration object in tsup.config.ts
- [ ] Import or define types for esbuild Options
- [ ] Ensure all dynamic property access is type-safe

## Example Fixes

### api/index.ts
```typescript
// Before
} catch (error) {
  throw error;
}

// After
} catch (error) {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error('Unknown error occurred');
}
```

### tsup.config.ts
```typescript
import type { Options } from 'tsup';
import type { Plugin } from 'esbuild';

// Type the esbuild config properly
const esbuildOptions: Options['esbuildOptions'] = (options, context) => {
  // ... properly typed config
};
```

## Success Criteria
- No unsafe any errors in api/index.ts
- No unsafe any errors in tsup.config.ts
- Both files have explicit type annotations
- Build still works correctly

## Time Estimate
2-3 hours

## Why This Matters
- API interface should be type-safe
- Build configuration affects entire project
- Sets good example for type safety