# mlld Error Bootstrap System

## Purpose

A lightweight system for capturing and improving parser errors during development. This is a bootstrap tool to help us identify and fix the most confusing errors, not a permanent architecture.

## Philosophy

- **Pragmatic over perfect** - Quick fixes now, polish later
- **Data gathering** - Learn what errors are actually problematic
- **Low friction** - Capture and fix errors in minutes
- **Temporary scaffolding** - Will evolve into built-in errors

## Error Enhancement Hierarchy

```typescript
// 1. Built-in polished errors (future)
//    - Implemented directly in parser/interpreter
//    - Optimal performance
//    - Currently empty, falls through to patterns

// 2. Pattern-based extended errors (current focus)
//    - Quick fixes in errors/cases/
//    - Good enough error messages
//    - Easy to add/modify

// 3. Fallback parser errors (default)
//    - Raw Peggy output
//    - "Expected X, Y, Z but found W"
```

## User Flow

### 1. Encounter Confusing Error

```bash
$ mlld script.mld
Parse error: Expected "/exe", "/import", "/output", "/path", "/run", "/show", "/when", "<<", ">>", "@", "```", "{{", Backtick Sequence, Special reserved variable, [ \t], end of input, or var directive but "/" found. at line 7, column 1
```

### 2. Capture It

```bash
$ mlld script.mld --capture-errors
Error captured to: errors/captured/001/
  - input.mld (your original file)
  - context.json (error details)
  - pattern.ts (template to fill in)
```

### 3. Create Pattern

Edit `errors/captured/001/pattern.ts`:

```typescript
export const pattern = {
  name: 'directive-typo',
  
  test(error, ctx) {
    // Quick and dirty - just match this specific case
    return error.found === '/' && 
           ctx.line.startsWith('/vra');  // typo of /var
  },
  
  enhance(error, ctx) {
    return new MlldParseError(
      `Unknown directive. Did you mean /var?`,
      error.location
    );
  }
};
```

### 4. Test It

```bash
$ mlld error-test errors/captured/001
✓ Pattern matches!
Enhanced: Unknown directive. Did you mean /var?
```

### 5. Install It

```bash
# Just copy it to the cases directory
$ cp -r errors/captured/001 errors/cases/parse/directive-typo

# Rebuild to include new pattern
$ npm run build
```

## Directory Structure

```
errors/
├── cases/
│   └── parse/
│       └── directive-typo/
│           ├── example.mld    # Minimal reproduction
│           └── pattern.ts      # Detection & enhancement
├── captured/                   # Temp directory (gitignored)
└── README.md                   # Basic notes
```

## Implementation

### Pattern Interface (Minimal)

```typescript
interface ErrorPattern {
  name: string;
  test(error: PeggyError, ctx: { line: string, source: string }): boolean;
  enhance(error: PeggyError, ctx: { line: string, source: string }): MlldParseError;
}
```

### Pattern Loader

```typescript
// Load all patterns at startup (simple glob)
const patterns = await glob('errors/cases/**/pattern.ts')
  .then(files => Promise.all(files.map(f => import(f))))
  .then(modules => modules.map(m => m.pattern));
```

### Error Enhancer

```typescript
function enhancePeggyError(peggyError: any, source: string): MlldParseError {
  const ctx = {
    line: getLineContent(source, peggyError.location),
    source
  };
  
  // Try patterns
  for (const pattern of patterns) {
    if (pattern.test(peggyError, ctx)) {
      return pattern.enhance(peggyError, ctx);
    }
  }
  
  // Fallback
  return simplifyPeggyError(peggyError);
}
```

## Commands

### `mlld --capture-errors`
- Captures error context to `errors/captured/NNN/`
- Includes original file, error details, pattern template
- Auto-increments capture number

### `mlld error-test <path>`
- Runs the example through parser
- Verifies pattern matches
- Shows enhanced error

## Non-Goals

- **Not** a permanent error system
- **Not** for end users to contribute
- **Not** optimized for performance
- **Not** documented publicly
- **Not** quality controlled

## Success Metrics

1. **Capture 20-30 most annoying errors**
2. **Each pattern takes <5 minutes to create**
3. **Learn which errors need built-in fixes**
4. **Build corpus of error test cases**

## Evolution Plan

```
Phase 1 (Now): Bootstrap
- Capture errors as patterns
- Fix the most annoying ones
- Learn what's needed

Phase 2 (Later): Optimize
- Move common patterns to built-in errors
- Implement directly in parser/interpreter
- Keep pattern system for edge cases

Phase 3 (Future): Polish
- Comprehensive built-in error messages
- Remove bootstrap patterns
- Ship great errors by default
```

## Example Patterns to Start

1. `/import { * }` → "Wildcard imports need an alias"
2. Unknown directive → "Unknown directive /foo. Available: /var, /show..."
3. Multiline arrays → "Arrays can't span lines without [[ ]]"
4. Missing closing quote → "Unterminated string starting at line X"
5. Variable typos → "Unknown variable @foo. Did you mean @bar?"

## Notes

- Patterns can be hacky - we'll refactor later
- Don't worry about overlapping patterns
- Focus on errors you actually encounter
- Ship improvements immediately