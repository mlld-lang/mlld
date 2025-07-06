# Guide for Fixing Unsafe Assignment Issues in mlld

## Overview
This guide is for fixing TypeScript unsafe assignment issues in the mlld codebase. These are primarily `@typescript-eslint/no-unsafe-assignment` errors.

## Current Status
- **Total unsafe assignments**: ~534 issues (as of 2025-07-05, after Phase 4 fixes)
- **Completed**: Fixed high-priority interpreter files, API entry point, core files, and registry files
- **Main error types**:
  - `Unsafe assignment of an 'any' value` (majority)
  - `Unsafe assignment of an error typed value` (~90)
  - Related: `Unsafe member access` (~90)

## CRITICAL DISCOVERY - Concentration of Issues
The unsafe assignments are NOT evenly distributed! The top offenders are:
- `interpreter/env/Environment.ts` - **73 issues** (13.7% of all issues!)
- `interpreter/eval/pipeline.ts` - **49 issues** (9.2%)
- `interpreter/eval/data-value-evaluator.ts` - **35 issues** (6.5%)
- `interpreter/eval/exec-invocation.ts` - **33 issues** (6.2%)
- `interpreter/eval/output.ts` - **25 issues** (4.7%)

These 5 files alone account for **215 issues (40.3%)**! We've been fixing files with 1-5 issues while ignoring these massive concentrations.

## What NOT to Fix
These areas have been intentionally configured to allow unsafe operations:

1. **Parser boundaries** - Files already excluded:
   - `interpreter/index.ts` - Main parse() call
   - `interpreter/eval/import.ts` - Parses imported files
   - `cli/commands/error-test.ts`
   - `cli/commands/add-needs.ts`
   - `cli/commands/language-server-impl.ts`
   - `cli/commands/publish.ts`

2. **Error classes** - Set to warning, not error:
   - `core/errors/**/*.ts`
   - `core/registry/**/*.ts`
   - `core/services/**/*.ts`

3. **Ignored directories**:
   - `grammar/**`
   - `tests/**`

## Completed Fixes (2025-07-05)

### ✅ Phase 1 - High-priority interpreter files:
1. `interpreter/eval/var.ts` - Fixed type annotations for `VariableNodeArray`
2. `interpreter/eval/run.ts` - No unsafe assignments found
3. `interpreter/eval/show.ts` - No unsafe assignments found
4. `interpreter/eval/when.ts` - No unsafe assignments found
5. `interpreter/utils/ast-evaluation.ts` - Fixed by using `unknown` instead of `any`
6. `core/utils/smartPathResolver.ts` - Fixed `process.cwd()` type assertions
7. `security/SecurityManager.ts` - No unsafe assignments found
8. `security/registry/*.ts` - Fixed JSON parsing and process stream types

### ✅ Phase 2 - API and remaining interpreter files:
1. `api/index.ts` - Fixed `process.cwd()` type assertion
2. `interpreter/eval/code-execution.ts` - Fixed AsyncFunction constructor and error handling
3. `interpreter/eval/exec-invocation.ts` - Fixed command name assignments with type assertions
4. `interpreter/eval/path.ts` - Fixed identifier assignment with type assertion
5. `interpreter/eval/dependencies.ts` - Fixed JSON.parse results with proper type annotations
6. `core/errors/MlldParseError.ts` - Fixed location.filePath and details spreading

### ✅ Phase 3 - Core utilities and registry:
1. `core/errors/capture.ts` - Fixed error property access with `as unknown`
2. `core/registry/Cache.ts` - Fixed JSON.parse for CacheMetadata
3. `core/utils/gitStatus.ts` - Fixed process.cwd() calls with proper type casting
4. `core/resolvers/LocalResolver.ts` - Fixed fuzzyConfig type assertion

### ✅ Phase 4 - Additional registry and security files:
1. `core/registry/StatsCollector.ts` - Fixed JSON.parse for StatsEvent and require() typing
2. `security/registry/RegistryClient.ts` - Fixed JSON.parse for LockFileData
3. `security/registry/adapters/RepositoryAdapter.ts` - Fixed GitHub API response typing
4. `core/registry/ModuleCache.ts` - Fixed multiple JSON.parse calls for ModuleCacheMetadata

## What TO Fix Next
Remaining directories by priority:
1. **core/errors/*.ts** - Error handling patterns (remaining files)
2. **core/registry/*.ts** - Module management with JSON parsing (remaining files)
3. **core/utils/*.ts** - Utility functions (remaining files)
4. **cli/commands/*.ts** - CLI command handlers
5. **core/resolvers/*.ts** - Path and module resolvers (remaining files)
6. **core/security/*.ts** - Security-related code
7. **core/services/*.ts** - Service implementations

## Common Patterns and Fixes

### Pattern 1: Untyped Function Returns
```typescript
// BEFORE - Unsafe
const result = someFunction(); // returns any
const data = result;

// AFTER - Add type assertion or annotation
const result = someFunction() as SpecificType;
// OR
const result: SpecificType = someFunction();
```

### Pattern 2: Dynamic Object Access
```typescript
// BEFORE - Unsafe
const value = obj[key]; // obj is any or key makes value any

// AFTER - Type the object or use type assertion
const obj: Record<string, SpecificType> = {...};
const value = obj[key];
// OR
const value = obj[key] as SpecificType;
```

### Pattern 3: JSON Parse Results
```typescript
// BEFORE - Unsafe
const data = JSON.parse(jsonString);

// AFTER - Type assertion with validation
const data = JSON.parse(jsonString) as ExpectedType;
// OR better - use a validation library
const rawData = JSON.parse(jsonString) as unknown;
const data = validateData(rawData); // returns ExpectedType
```

### Pattern 4: Error Handling
```typescript
// BEFORE - Unsafe
catch (error) {
  const message = error.message; // error is unknown
}

// AFTER - Type guard
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
}
```

### Pattern 5: Module Imports
```typescript
// BEFORE - Unsafe
const module = await import(modulePath);
const fn = module.default;

// AFTER - Type the import
interface ExpectedModule {
  default: (args: ArgType) => ReturnType;
}
const module = await import(modulePath) as ExpectedModule;
const fn = module.default;
```

## Available Types to Use

The mlld codebase has comprehensive types in `@core/types`:
- `MlldNode` - Union of all AST node types
- `DirectiveNode` - Base directive type
- `Variable` - Variable types
- `VarValue` - Union of all possible var values
- `Environment` - Interpreter environment
- Type guards: `isDirective()`, `isTextNode()`, etc.

### Pattern 6: Process Globals
```typescript
// BEFORE - Unsafe
const cwd = process.cwd();
const input = process.stdin;

// AFTER - Type assertion
const cwd = process.cwd() as string;
// OR for better type safety when cwd() might be typed as error:
const cwd = (process.cwd as () => string)();
const input = process.stdin as NodeJS.ReadStream;
```

### Pattern 7: Response Parsing
```typescript
// BEFORE - Unsafe
const data = await response.json();

// AFTER - Type as unknown first
const data = await response.json() as unknown;
// Then use type guard to validate
if (isExpectedType(data)) {
  // Use data safely
}
```

### Pattern 8: Dynamic Function Construction
```typescript
// BEFORE - Unsafe
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const fn = new AsyncFunction(code);
const result = await fn();

// AFTER - Type the constructor
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor as new (...args: string[]) => Promise<unknown>;
const fn = new AsyncFunction(code);
const result = await fn() as string | undefined;
```

### Pattern 9: Spread Operations with Unknown Types
```typescript
// BEFORE - Unsafe
const details = {
  ...options.context, // context is any
  filePath: filePath
};

// AFTER - Type assertion
const details = {
  ...(options.context as Record<string, unknown>),
  filePath: filePath
} as Record<string, unknown>;
```

## Remaining Issues by Category

### Process/Node.js Globals (~50 issues)
- `process.stdin`, `process.stdout` - Need `NodeJS.ReadStream/WriteStream`
- `process.cwd()` - Returns `any`, needs `as string`
- `process.env` - Needs proper typing

### JSON/Response Parsing (~100 issues)
- `JSON.parse()` - Returns `any`
- `response.json()` - Returns `any`
- GitHub API responses - Need type definitions

### Error Handling (~100 issues)
- Custom error properties
- Error context objects
- Parse error handling

### Dynamic Imports (~20 issues)
- `require()` calls (should migrate to `import`)
- Dynamic `import()` statements

## Step-by-Step Approach

1. **Run lint on specific file**:
   ```bash
   npm run lint interpreter/eval/show.ts
   ```

2. **Identify the unsafe assignment**:
   - Look for the line number
   - Understand what type is expected
   - Check if there's an existing type to use

3. **Apply the fix**:
   - Add type annotation
   - Use type assertion if confident
   - Add runtime validation if needed

4. **Verify the fix**:
   ```bash
   npm run lint interpreter/eval/show.ts
   ```

5. **Run tests** to ensure no regressions:
   ```bash
   npm test
   ```

## Priority Order

### ✅ Completed (Phase 1):
1. **High-value interpreter files**:
   - `interpreter/eval/var.ts` ✓
   - `interpreter/eval/run.ts` ✓
   - `interpreter/eval/show.ts` ✓
   - `interpreter/eval/when.ts` ✓
   - `interpreter/utils/ast-evaluation.ts` ✓

2. **Security files**:
   - `security/SecurityManager.ts` ✓
   - `security/registry/*.ts` ✓
   - `core/utils/smartPathResolver.ts` ✓

### 🚧 Next Priority (Phase 5) - HIGH IMPACT FILES:
1. **Environment.ts mega-file** (73 issues):
   - `interpreter/env/Environment.ts` - 2814 lines!
   - Common patterns: `null as any`, error handling, dynamic assignments
   
2. **Pipeline processing** (49 issues):
   - `interpreter/eval/pipeline.ts`
   - Common patterns: command execution options, variable references

3. **Data value evaluator** (35 issues):
   - `interpreter/eval/data-value-evaluator.ts`
   - Likely JSON/data type handling

4. **Exec invocation** (33 issues):
   - `interpreter/eval/exec-invocation.ts` 
   - We partially fixed this but 33 issues remain!

5. **Output handling** (25 issues):
   - `interpreter/eval/output.ts`
   - File/stream output handling

### 📋 Future Work (Phase 6+):
1. **Utilities**:
   - `core/utils/*.ts` - Remaining helper functions
   - `core/security/*.ts` - Remaining security checks

2. **Service implementations**:
   - `core/services/*.ts` - File system, paths

3. **Additional resolvers**:
   - `core/resolvers/*.ts` - Remaining resolver implementations

## Notes
- Don't add `any` types - that just moves the problem
- Prefer `unknown` over `any` when type is truly unknown
- Use type guards for runtime type checking
- If you find missing types, check `core/types/` first
- Some `any` usage is legitimate (e.g., error context) - use judgment

## Progress Tracking

### Initial State (before fixes):
- Total unsafe assignments: ~450 issues
- High-priority interpreter files: ~20 issues
- Security files: ~10 issues

### Current State (2025-07-05):
- Total unsafe assignments: ~534 issues (reduced from 556)
- Fixed: 22 high-priority files (Phase 1 + Phase 2 + Phase 3 + Phase 4)
- Remaining: Mostly error handling, CLI files, and service implementations

### Breakdown by Type:
- ✅ AST/Interpreter core: COMPLETE
- ✅ API entry point: COMPLETE
- 🚧 Error handling: ~90 issues (10 fixed)
- 🚧 JSON/API parsing: ~85 issues (15 fixed)
- 🚧 Process globals: ~44 issues (6 fixed)
- 🚧 Dynamic imports: ~19 issues (1 fixed - require())
- 🚧 Other: ~296 issues

## Questions?
Check these resources:
- Type definitions: `/core/types/**/*.ts`
- Existing type guards: `/core/types/guards.ts`
- ESLint config: `/eslint.config.mjs`

## Appendix: Full Breakdown of Issues by File
Top 30 files with unsafe assignments (as of 2025-07-05):
```
73 interpreter/env/Environment.ts
49 interpreter/eval/pipeline.ts
35 interpreter/eval/data-value-evaluator.ts
33 interpreter/eval/exec-invocation.ts
25 interpreter/eval/output.ts
23 core/resolvers/builtin/DebugResolver.ts
21 interpreter/eval/show.ts
20 interpreter/eval/exe.ts
18 core/utils/enhancedLocationFormatter.ts
18 core/registry/auth/GitHubAuthService.ts
17 interpreter/eval/when.ts
16 interpreter/eval/var.ts
16 interpreter/core/interpreter.ts
13 interpreter/eval/foreach.ts
9 core/utils/dependency-detector.ts
9 core/resolvers/builtin/InputResolver.ts
8 core/utils/errorDisplayFormatter.ts
7 interpreter/eval/run.ts
7 interpreter/cache/URLCache.ts
7 core/types/variable-legacy.ts
6 interpreter/eval/value-evaluator.ts
6 core/utils/errorFormatSelector.ts
6 core/resolvers/ResolverManager.ts
5 interpreter/eval/lazy-eval.ts
5 interpreter/core/json-formatter.ts
5 core/utils/locationFormatter.ts
4 security/SecurityManager.ts
4 security/import/ImportApproval.ts
4 core/security/ImportApproval.ts
4 core/resolvers/RegistryResolver.ts
```

This shows we should focus on the high-count files first for maximum impact.