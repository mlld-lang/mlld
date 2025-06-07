# ESLint Cleanup Plan

## Current State (After fix/eslint-exemptions-and-ci merge)
- Total: ~3,200 problems (2,093 errors, 1,112 warnings)
- Auto-fixable: 729 issues
- Already addressed: False positive AST string manipulation exemptions

## Phase 1: Auto-fixes and Generated Code (Issue #1)
**Time: 1-2 hours**
- Run `npm run lint -- --fix` to auto-fix 729 issues
- Fix generated fixture index files with invalid identifiers
- Update fixture generation script to create valid JS identifiers
- Files: `tests/fixtures/**/index.ts`

## Phase 2: CLI Console Output (Issue #2)
**Time: 1-2 hours**
- Add ESLint override for CLI commands to allow console.log
- ~300 warnings in cli/commands/*.ts files
- CLI tools legitimately need console output for user interaction
- Add to eslint.config.mjs:
  ```javascript
  {
    files: ['cli/commands/**/*.ts'],
    rules: {
      'no-console': 'off',
    }
  }
  ```

## Phase 3: TypeScript Type Safety - API & Config (Issue #3)
**Time: 2-3 hours**
- Fix unsafe any assignments in critical files:
  - `api/index.ts` - API error handling
  - `tsup.config.ts` - esbuild configuration
  - Type the esbuild config object properly
- ~50 errors in these files

## Phase 4: TypeScript Type Safety - Security/Registry (Issue #4)
**Time: 2-3 hours**
- Fix unsafe any assignments in security modules:
  - `security/registry/RegistryClient.ts`
  - `security/registry/AdvisoryChecker.ts`
  - `security/taint/TaintTracker.ts`
- Add proper types for API responses
- ~50 errors in these files

## Phase 5: Test File Cleanup (Issue #5)
**Time: 1-2 hours**
- Fix test utility warnings:
  - Unused variables in test files
  - Mock console warnings in test utilities
  - Add appropriate exemptions for test files
- Update eslint.config.mjs test file rules

## Phase 6: Custom AST Rule Refinement (Issue #6)
**Time: 3-4 hours**
- Review remaining AST rule violations after exemptions
- Focus on interpreter/eval/* files
- Remove unnecessary eslint-disable comments
- Refactor legitimate violations to use proper AST methods
- Document patterns for future reference

## Phase 7: Unused Variables and Imports (Issue #7)
**Time: 1-2 hours**
- Clean up unused variables following pattern `_varName`
- Remove unused imports
- Fix unused function parameters
- ~100 warnings across the codebase

## Phase 8: Final Polish and CI Integration (Issue #8)
**Time: 1 hour**
- Ensure all ESLint checks pass in CI
- Update lint.yml workflow if needed
- Document any permanent exemptions
- Create ESLint best practices guide

## Success Metrics
- [ ] `npm run lint` shows 0 errors
- [ ] `npx tsc --noEmit` compiles without errors
- [ ] CI lint checks pass
- [ ] No unnecessary eslint-disable comments
- [ ] Clear documentation for exemptions