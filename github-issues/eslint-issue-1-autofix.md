# Issue: ESLint Phase 1 - Auto-fixes and Generated Code

## Summary
Run ESLint auto-fix and fix generated fixture files with invalid JavaScript identifiers.

## Current State
- 729 issues can be auto-fixed by ESLint
- Generated fixture index files contain invalid identifiers like `complexTest-1NestedImports`
- TypeScript compilation fails due to these syntax errors

## Tasks
- [ ] Run `npm run lint -- --fix` to automatically fix formatting issues
- [ ] Update fixture generation script to convert kebab-case filenames to valid camelCase identifiers
- [ ] Regenerate all fixture index files with valid identifiers
- [ ] Verify TypeScript compilation works after fixes

## Affected Files
- All `tests/fixtures/**/index.ts` files
- Build script that generates these index files

## Success Criteria
- Auto-fixable ESLint issues reduced to 0
- All fixture index files have valid JavaScript identifiers
- `npx tsc --noEmit` runs without syntax errors in fixture files

## Time Estimate
1-2 hours

## Why This Matters
- Blocking TypeScript compilation
- Quick win to reduce error count by ~700
- Foundation for further cleanup work