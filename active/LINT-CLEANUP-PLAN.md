# mlld Lint Cleanup Plan

## Current Status (as of consolidate-grammar branch)

**Total Issues**: 3,100 (2,290 errors, 810 warnings)
- Down from initial 3,631 issues (14.6% reduction)
- Grammar and test directories excluded from linting
- Parser-related type issues configured as exceptions

## Issue Breakdown

### By Type
1. **TypeScript Type Safety** (~1,500 issues)
   - 219 explicit `any` types
   - 399 unsafe assignments
   - 150+ unsafe member access
   - 150+ unsafe calls

2. **AST Type Guards** (~158 issues)
   - 44 `.subtype` access without guards
   - 42 `.identifier` access without guards
   - 72 `.content` access without guards

3. **Console Statements** (~147 warnings)
   - Legitimate user output that needs ESLint exceptions
   - Debug statements that should use logger

4. **Unused Code** (~300 warnings)
   - Unused variables
   - Unused parameters
   - Unused imports

5. **Misc Issues** (~100)
   - Case block declarations
   - Other style issues

### By Directory (Top Problem Areas)
1. `interpreter/eval` - 19 files
2. `core/types` - 17 files  
3. `core/errors` - 16 files
4. `core/resolvers` - 11 files
5. `cli/commands` - 11 files

## Cleanup Phases

### Phase 1: Type Guards in Interpreter (High Priority)
**Goal**: Add proper type guards for AST node access
**Impact**: ~158 issues
**Effort**: 2-3 hours

1. Create `interpreter/utils/type-guard-helpers.ts` with common patterns:
   ```typescript
   function getDirectiveSubtype(node: MlldNode): string | undefined {
     return isDirective(node) ? node.subtype : undefined;
   }
   ```

2. Apply systematically to `interpreter/eval/*.ts` files
3. Update code to use helper functions instead of direct access

### Phase 2: Fix Core Type Definitions (High Priority)
**Goal**: Replace `any` with proper types
**Impact**: ~220 explicit any + cascading improvements
**Effort**: 3-4 hours

1. Review `core/types/*.ts` for `any` usage
2. Replace with:
   - Specific union types where possible
   - `unknown` for truly dynamic data
   - Generic type parameters where appropriate

3. Focus areas:
   - `BaseErrorDetails[key: string]: any` → proper type
   - `definedAt?: any` → `definedAt?: SourceLocation`
   - Type guard parameters: `(value: any)` → proper types

### Phase 3: Fix Unsafe Operations (Medium Priority)
**Goal**: Add type assertions and fix unsafe assignments
**Impact**: ~450 issues
**Effort**: 4-5 hours

1. Parser boundaries - already configured to allow
2. Error context - change from error to warning
3. Dynamic module data - add proper types or assertions
4. Command execution results - type the outputs

### Phase 4: Console Cleanup (Medium Priority)
**Goal**: Properly categorize console usage
**Impact**: ~147 warnings
**Effort**: 1-2 hours

1. Add more ESLint exceptions for legitimate output:
   - Progress indicators
   - User-facing messages
   - Command output

2. Convert debug statements to use logger:
   - Import winston logger
   - Replace console.log with logger.debug

### Phase 5: Unused Code Cleanup (Low Priority)
**Goal**: Remove or prefix unused items
**Impact**: ~300 warnings
**Effort**: 1-2 hours

1. Run with `--fix` for auto-fixable issues
2. Prefix intentionally unused with `_`
3. Remove truly dead code
4. Fix import statements

### Phase 6: Final Cleanup (Low Priority)
**Goal**: Fix remaining misc issues
**Impact**: ~100 issues
**Effort**: 1-2 hours

1. Fix case block declarations (wrap in blocks)
2. Address any remaining type issues
3. Final lint pass

## Implementation Strategy

### Quick Wins First
1. Run `npm run lint -- --fix` periodically
2. Bulk find/replace for common patterns
3. Use code generation for repetitive fixes

### Tooling Improvements
1. Create codemods for type guard additions
2. Add more granular ESLint overrides as needed
3. Consider custom ESLint rules for mlld-specific patterns

### Progressive Enhancement
1. Fix errors before warnings
2. Focus on high-impact directories first
3. Test after each phase to ensure no regressions

## Success Metrics

### Target State
- **Errors**: < 100 (from 2,290)
- **Warnings**: < 200 (from 810)
- **Total**: < 300 (from 3,100)

### Acceptable Exceptions
- Parser boundaries (already configured)
- Error context requiring `any`
- Legacy code pending refactor
- Third-party integration points

## Configuration Adjustments Made

1. **Ignored Directories**:
   - `grammar/**` - Generated parser code
   - `tests/**` - Test files don't need perfect types
   - `**/*.d.ts` - Type declaration files

2. **Relaxed Rules**:
   - CLI allows `any` types (yargs compatibility)
   - Error classes allow `any` for context
   - Parser interfaces allow unsafe operations

3. **Console Exceptions**:
   - CLI commands and utilities
   - Build scripts
   - Security warnings
   - Logger implementations

## Next Steps

1. Review and approve this plan
2. Create tracking issues for each phase
3. Begin with Phase 1 (Type Guards)
4. Regular progress check-ins
5. Adjust plan based on discoveries

## Estimated Timeline

- **Phase 1-2**: 1 week (high priority)
- **Phase 3-4**: 1 week (medium priority)  
- **Phase 5-6**: As time permits (low priority)

**Total**: 2-3 weeks for full cleanup