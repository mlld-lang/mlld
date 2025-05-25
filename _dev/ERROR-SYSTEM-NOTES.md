# Meld Error System Implementation Plan

## Overview

A robust error system is crucial for good developer experience. This plan outlines the architecture for comprehensive error handling, location tracking, and helpful error messages.

## Priority

**TOP PRIORITY** after core features are stable. This is the bedrock of good DX for Meld.

## Error Hierarchy

```
MeldError (base)
├── MeldParseError (syntax errors)
│   ├── location info (line, column, file)
│   ├── expected vs found tokens
│   └── suggestion/fix hints
├── MeldInterpreterError (runtime)
│   ├── VariableResolutionError
│   ├── FileNotFoundError  
│   ├── CommandExecutionError
│   ├── CircularDependencyError
│   └── FieldAccessError
├── MeldValidationError (semantic)
│   ├── InvalidDirectiveError
│   ├── TypeMismatchError
│   └── MissingRequiredFieldError
└── MeldWarning (non-fatal issues)
    ├── DeprecationWarning
    └── PerformanceWarning
```

## Key Features

### 1. Location Tracking
- Every error must have precise location information
- Source maps to track locations through transformations
- Multi-file stack traces for imports (show the import chain)
- Preserve location info through the entire pipeline

### 2. Error Recovery & Severity
- **Fatal**: Stops execution immediately
- **Recoverable**: Logs error but continues processing
- **Warning**: Information only, no impact on execution
- Parser should collect multiple errors instead of fail-fast
- Interpreter should handle recoverable errors gracefully

### 3. Developer Experience
- Pretty error formatting with code frames:
  ```
  Error in example.mld:5:12
    5 | @text greeting = [[name]]
                           ^^^^
  Variable 'name' is not defined
  ```
- Helpful suggestions ("Did you mean 'userName'?")
- Links to relevant documentation
- Common mistake detection

### 4. Testing
- Create `tests/cases/invalid/` with common syntax mistakes
- Each invalid case should have:
  - Input file with intentional error
  - Expected error message
  - Expected error type and location

## Implementation Steps

1. **Phase 1**: Update parser to use MeldParseError
   - Add location tracking to all parse errors
   - Implement error recovery in parser
   - Create pretty error formatter

2. **Phase 2**: Update interpreter to use typed errors
   - Replace generic Error throws with specific types
   - Add error context (what was being evaluated)
   - Implement error recovery strategies

3. **Phase 3**: Add source map support
   - Track transformations through pipeline
   - Show original source in error messages
   - Multi-file stack traces

4. **Phase 4**: Create invalid test cases
   - Common syntax mistakes
   - Type mismatches
   - Missing variables
   - Circular dependencies

## Common Error Patterns to Handle

- Missing closing brackets: `@text foo = [[bar`
- Undefined variables: `{{unknown}}`
- Invalid directive syntax: `@invalid foo = bar`
- Circular imports: `a.mld` imports `b.mld` imports `a.mld`
- Type mismatches: Using text where path expected
- Missing required fields in directives
- Invalid interpolation syntax
- File not found errors with helpful paths tried

## Integration Points

- Parser: Collect and return errors array
- Interpreter: Handle errors based on severity
- CLI: Pretty print errors with color coding
- API: Return structured error objects

## Notes

- Keep all existing error classes even if not currently used
- SourceMapService might be outdated but keep as starting point
- Error messages should be helpful, not just descriptive
- Consider i18n for error messages in future

## References

- Current error classes in `core/errors/`
- Source map utilities in `core/utils/sourceMapUtils.ts`
- Error display in CLI at `cli/index.ts:handleError()`