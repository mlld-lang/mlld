---
updated: 2025-01-30
tags: #errors, #dx, #patterns, #testing
related-docs: docs/dev/TESTS.md, docs/dev/ERROR-HANDLING-ANALYSIS.md
related-code: core/errors/*.ts, errors/parse/*/pattern.js, interpreter/index.ts, interpreter/interpreter.fixture.test.ts
related-types: core/errors { MlldError, ErrorSeverity, BaseErrorDetails }
---

# Error System

## tldr

mlld has a compiled error pattern system that transforms Peggy parse errors into user-friendly messages. Patterns are pure functions that extract variables, templates use `${VARIABLE}` placeholders, and everything compiles into a single generated file at build time. Add new patterns by creating `pattern.js` and `error.md` files - the build process handles the rest.

## How It Works

### 1. Files Created

- **`tests/cases/invalid/*/example.md`** - Input files that trigger parse errors
- **`errors/parse/*/pattern.js`** - Pure functions that match errors and extract variables (no imports!)
- **`errors/parse/*/error.md`** - Templates with `${VARIABLE}` placeholders for error messages

### 2. Build Process

The build script (`scripts/build-parse-errors.js`) compiles patterns:
- Reads all `errors/parse/*/pattern.js` and matching `error.md` files
- Generates `core/errors/patterns/parse-errors.generated.js` with:
  - All patterns compiled into a single array
  - Template interpolation logic
  - Error enhancement function
- No runtime imports or file I/O needed

### 3. Test Fixtures

The fixture generator (`scripts/build-fixtures.mjs`):
- Reads `errors/parse/*/error.md` as the expected error template
- Stores template in fixture for test validation
- Does NOT run patterns during fixture generation (templates are the source of truth)

### 4. Runtime & Testing

- **Runtime**: Parse errors are enhanced using compiled patterns, variables interpolated into templates
- **Testing**: Tests validate that enhanced errors match the template patterns

## Principles

- Error messages are part of the specification (tested like features)
- Patterns are pure functions with no dependencies
- Templates define the user-facing messages
- Everything compiles at build time for performance
- Convention-over-configuration for auto-registration
- Add patterns on-demand based on user feedback (YAGNI approach)

## Architecture

```
Build Time:
errors/parse/*/{pattern.js, error.md} → build-parse-errors.js → parse-errors.generated.js

Runtime:
Parse Error → Enhanced Error (using compiled patterns) → User

Test Time:
example.md → Parse Error → Enhanced Error → Match against error.md template
```

### System Components

1. **Core Error Classes** (`core/errors/`)
   - Hierarchical error types extending MlldError
   - Location tracking, severity levels, structured details
   - Used throughout interpreter for runtime errors

2. **Pattern Files** (`errors/parse/*/pattern.js`)
   - Pure functions (no imports!)
   - `test(error, ctx)` - Returns true if pattern matches
   - `enhance(error, ctx)` - Returns variables for template interpolation

3. **Template Files** (`errors/parse/*/error.md`)
   - User-facing error messages
   - Use `${VARIABLE}` placeholders
   - Single source of truth for error text

4. **Generated File** (`core/errors/patterns/parse-errors.generated.js`)
   - Contains all compiled patterns
   - Includes template interpolation logic
   - Exports single `enhanceParseError` function
   - Regenerated on each build

## Creating Error Patterns

### 1. Create pattern directory
```
errors/parse/my-error/
├── pattern.js    # Pure function for error detection
├── error.md      # Template with ${VARIABLES}
└── example.md    # Documentation example
```

### 2. Write pattern.js (pure function, no imports!)
```javascript
export const pattern = {
  name: 'my-error',
  
  test(error, ctx) {
    // Return true if this pattern matches
    return error.found === '@' && ctx.line.includes('confusing');
  },
  
  enhance(error, ctx) {
    // Extract variables for template interpolation
    const varName = ctx.line.match(/@(\w+)/)?.[1] || 'unknown';
    
    // Return object with template variables
    return {
      varName: varName
    };
  }
};
```

### 3. Write error.md template
```
Variables must start with @. Found invalid syntax for '${varName}'
```

### 4. Create test case
```
tests/cases/invalid/my-error/
└── example.md    # Code that triggers the error
```

### 5. Build and test
```bash
npm run build:errors    # Compiles patterns into generated file
npm run build:fixtures  # Updates test fixtures
npm test                # Validates everything works
```

## Build Process Details

The build process is triggered by `npm run build:errors` which:

1. **Scans** `errors/parse/*/` directories for pattern.js and error.md pairs
2. **Parses** pattern.js files to extract the pattern object
3. **Reads** error.md templates
4. **Generates** `core/errors/patterns/parse-errors.generated.js` containing:
   - All patterns in a single array
   - Template strings with proper escaping
   - `interpolateTemplate()` function for variable substitution
   - `enhanceParseError()` function that applies patterns
   - Fallback logic for unmatched errors

The generated file structure:
```javascript
// Auto-generated header with metadata
const patterns = [
  {
    name: 'pattern-name',
    template: `Error template with \${variables}`,
    test(error, ctx) { /* test logic */ },
    enhance(error, ctx) { /* returns variables */ }
  },
  // ... more patterns
];

function interpolateTemplate(template, variables) { /* ... */ }
function enhanceParseError(error, source, filePath) { /* ... */ }
```

## Key Implementation Details

### Pattern Context

Each pattern receives:
- `error` - The Peggy parse error object with:
  - `message` - Original error message
  - `expected` - Array of expected tokens
  - `found` - What was actually found
  - `location` - Position information
- `ctx` - Context object with:
  - `line` - The line where error occurred
  - `lines` - All lines in the source
  - `lineNumber` - Line number (1-based)
  - `source` - Full source text

### Variable Naming Convention

Template variables should be UPPERCASE to stand out:
- `${DIRECTIVE}` - The directive name
- `${VARNAME}` - Variable name
- `${COMMAND}` - Command text

### Pattern Matching Tips

- Test the most specific conditions first
- Use `error.found` to check what token triggered the error
- Use `ctx.line` to examine the full line context
- Return early from `test()` for performance

## System Files

- `scripts/build-parse-errors.js` - Main build script that generates the compiled file
- `scripts/build-fixtures.mjs` - Reads error.md templates for test fixtures
- `core/errors/patterns/parse-errors.generated.js` - The compiled patterns (gitignored)
- `core/errors/patterns/init.ts` - Thin wrapper that imports the generated file
- `interpreter/index.ts` - Applies error enhancement during parsing
- `interpreter/interpreter.fixture.test.ts` - Validates errors match templates

## Gotchas

- Pattern files must be pure functions (no imports!)
- Pattern names must match directory names
- Templates in error.md are the single source of truth
- Variables returned by `enhance()` must match template placeholders
- The generated file is overwritten on each build
- Parse errors occur before AST creation - work with raw text
- Test runner uses non-greedy regex for template matching