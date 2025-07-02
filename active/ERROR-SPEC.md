# mlld Error Enhancement System Specification

## Overview

The mlld Error Enhancement System transforms cryptic parser errors into helpful, actionable messages. It uses a pattern-based approach where each error pattern is a self-contained TypeScript module that detects and enhances specific error cases.

## Goals

1. **Transform unhelpful errors** - Convert "Expected X, Y, Z but found W" into "Arrays cannot span multiple lines without [[ ]] wrapper"
2. **Enable community contributions** - Make it easy for users to improve error messages they encounter
3. **Maintain quality** - Ensure error patterns are tested and focused
4. **Scale gracefully** - Support hundreds of patterns without performance degradation

## User Experience

### 1. Encountering an Error

```bash
$ mlld script.mld
Parse error: Expected "/exe", "/import", "/output", "/path", "/run", "/show", "/when", "<<", ">>", "@", "```", "{{", Backtick Sequence, Special reserved variable, [ \t], end of input, or var directive but "/" found. at line 7, column 1
```

### 2. Capturing the Error

```bash
$ mlld script.mld --capture-errors
Parse error: Expected ... but "/" found at line 7

Error captured to: errors/captured/2024-01-15-parse-error-001/
To contribute a fix:
  1. Minimize the reproduction in errors/captured/2024-01-15-parse-error-001/example.mld
  2. Create pattern.ts with detection and enhancement logic
  3. Run: mlld error-test errors/captured/2024-01-15-parse-error-001
  4. Run: mlld error-pr errors/captured/2024-01-15-parse-error-001
```

### 3. Creating an Error Pattern

User edits the captured files:

**example.mld** (minimized from original):
```mlld
/var @items = [
  {"name": "apple"},
  {"name": "banana"}
]
```

**pattern.ts**:
```typescript
import { ErrorPattern, ErrorContext } from '@core/errors/patterns';

export const pattern: ErrorPattern = {
  name: 'array-multiline-syntax',
  
  test(error: PeggyError, context: ErrorContext): boolean {
    return error.found === '\n' && 
           context.line.includes('= [') &&
           !context.line.includes('[[');
  },
  
  enhance(error: PeggyError, context: ErrorContext): MlldParseError {
    return new MlldParseError(
      `Arrays cannot span multiple lines without [[ ]] wrapper. Either put the array on one line or use [[ ... ]] for multiline arrays.`,
      error.location,
      {
        code: 'ARRAY_MULTILINE_SYNTAX',
        suggestion: 'Use [[ at the start of multiline arrays'
      }
    );
  }
};
```

### 4. Testing the Pattern

```bash
$ mlld error-test errors/captured/2024-01-15-parse-error-001
✓ example.mld triggers expected parse error
✓ pattern.ts matches the error
✓ Pattern ready to submit!

Enhanced error:
  Arrays cannot span multiple lines without [[ ]] wrapper. Either put the array on one line or use [[ ... ]] for multiline arrays.
```

### 5. Submitting the Pattern

```bash
$ mlld error-pr errors/captured/2024-01-15-parse-error-001
✓ Pattern test passes
✓ Moving to: errors/cases/parse/array-multiline-syntax/
✓ Creating branch: error-pattern-array-multiline-syntax
✓ Committing: Add error pattern for array-multiline-syntax
✓ Pushing to origin

Create PR at: https://github.com/mlld-lang/mlld/compare/error-pattern-array-multiline-syntax
```

## Architecture

### Directory Structure

```
errors/
├── cases/                    # Committed error patterns
│   ├── parse/               # Parse-time errors
│   │   ├── directive-unknown/
│   │   │   ├── example.mld
│   │   │   ├── pattern.ts
│   │   │   └── expected-error.txt
│   │   └── ...
│   └── runtime/             # Runtime errors
│       └── ...
├── captured/                # Temporary captured errors (gitignored)
│   └── 2024-01-15-parse-error-001/
│       ├── input.mld        # Original file
│       ├── example.mld      # User-edited minimal version
│       ├── context.json     # Full error context
│       ├── raw-error.txt    # Original error message
│       └── pattern.ts       # User-created pattern
└── CONTRIBUTING.md          # Guidelines for error patterns
```

### Pattern Loading

At startup, the interpreter loads all patterns from `errors/cases/*/pattern.ts`:

```typescript
// Core pattern loader
export async function loadErrorPatterns(): Promise<ErrorPattern[]> {
  const patternFiles = await glob('errors/cases/**/pattern.ts');
  const patterns: ErrorPattern[] = [];
  
  for (const file of patternFiles) {
    const module = await import(file);
    patterns.push(module.pattern);
  }
  
  return patterns;
}
```

### Error Enhancement Flow

```typescript
// In interpreter/index.ts
function enhancePeggyError(peggyError: any, source: string): MlldParseError {
  const context = createErrorContext(peggyError, source);
  
  // Try each pattern until one matches
  for (const pattern of errorPatterns) {
    if (pattern.test(peggyError, context)) {
      return pattern.enhance(peggyError, context);
    }
  }
  
  // No pattern matched - return simplified generic error
  return createGenericParseError(peggyError);
}
```

### Pattern Interface

```typescript
export interface ErrorPattern {
  name: string;                                    // Unique identifier
  test(error: PeggyError, context: ErrorContext): boolean;  // Detection
  enhance(error: PeggyError, context: ErrorContext): MlldParseError; // Enhancement
}

export interface ErrorContext {
  line: string;          // The line that caused the error
  previousLine?: string; // Line before (if available)
  nextLine?: string;     // Line after (if available)
  source: string;        // Full source code
  filePath?: string;     // File path if known
}
```

## Implementation Requirements

### CLI Commands

1. **`mlld <file> --capture-errors`** - Captures errors to `errors/captured/`
2. **`mlld error-test <path>`** - Tests a pattern against its example
3. **`mlld error-pr <path>`** - Moves pattern to proper location and creates PR

### Build Integration

- Pattern loading happens once at interpreter startup
- Patterns are standard TypeScript modules, compiled with the rest of the codebase
- No special build step required

### Testing

Each pattern is tested by:
1. Running `example.mld` through the parser
2. Verifying it produces an error
3. Checking the pattern matches
4. Confirming the enhanced error is produced

## Success Criteria

1. **User can go from confusing error to PR in < 10 minutes**
2. **Error patterns are focused on single error types**
3. **Enhanced errors provide clear guidance**
4. **System handles 100+ patterns without performance impact**
5. **Pattern contribution process is well-documented**