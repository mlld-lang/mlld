---
updated: 2025-01-30
tags: #errors, #dx, #patterns, #testing
related-docs: docs/dev/TESTS.md, docs/dev/ERROR-HANDLING-ANALYSIS.md
related-code: core/errors/*.ts, errors/parse/*/pattern.js, errors/js/*/pattern.js, interpreter/index.ts, interpreter/interpreter.fixture.test.ts
related-types: core/errors { MlldError, ErrorSeverity, BaseErrorDetails }
---

# Error System

## tldr

mlld has a compiled error pattern system that transforms both parse errors and JavaScript/Node runtime errors into user-friendly messages. Patterns are pure functions that extract variables, templates use `${VARIABLE}` placeholders, and everything compiles into generated files at build time. Add new patterns by creating `pattern.js` and `error.md` files - the build process handles the rest.

## How It Works

### 1. Files Created

#### Parse Errors (compile-time)
- **`errors/parse/*/pattern.js`** - Pure functions that match parse errors and extract variables
- **`errors/parse/*/error.md`** - Templates with `${VARIABLE}` placeholders for error messages

#### JavaScript/Node Errors (runtime)
- **`errors/js/*/pattern.js`** - Pure functions that match JS/Node runtime errors
- **`errors/js/*/error.md`** - Templates for JavaScript execution error messages

### 2. Build Process

Two build scripts compile patterns:

**Parse errors** (`scripts/build-parse-errors.js`):
- Reads all `errors/parse/*/pattern.js` and matching `error.md` files
- Generates `core/errors/patterns/parse-errors.generated.js`

**JavaScript errors** (`scripts/build-js-errors.js`):
- Reads all `errors/js/*/pattern.js` and matching `error.md` files
- Generates `core/errors/patterns/js-errors.generated.js`

Both generated files contain:
- All patterns compiled into a single array
- Template interpolation logic
- Error enhancement function
- No runtime imports or file I/O needed

### 3. Runtime & Testing

- **Parse errors**: Enhanced at parse time in `interpreter/index.ts`
- **JS/Node errors**: Enhanced at execution time in `JavaScriptExecutor` and `NodeExecutor`
- **Testing**: Errors are validated against expected patterns during regular test runs

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
errors/js/*/{pattern.js, error.md} → build-js-errors.js → js-errors.generated.js

Runtime:
Parse Error → enhanceParseError() → Enhanced Error → User
JS/Node Error → enhanceJSError() → Enhanced Error → User
```

### System Components

1. **Core Error Classes** (`core/errors/`)
   - Hierarchical error types extending MlldError
   - Location tracking, severity levels, structured details
   - Used throughout interpreter for runtime errors

2. **Pattern Files** (`errors/{parse,js}/*/pattern.js`)
   - Pure functions (no imports!)
   - `test(error, ctx)` - Returns true if pattern matches
   - `enhance(error, ctx)` - Returns variables for template interpolation
   - Parse patterns match on Peggy error structure
   - JS patterns match on error messages and code context

3. **Template Files** (`errors/{parse,js}/*/error.md`)
   - User-facing error messages
   - Use `${VARIABLE}` placeholders
   - Single source of truth for error text

4. **Generated Files**
   - `core/errors/patterns/parse-errors.generated.js` - Parse error patterns
   - `core/errors/patterns/js-errors.generated.js` - JavaScript/Node error patterns
   - Both export enhancement functions
   - Regenerated on each build

## Creating Error Patterns

### Parse Error Patterns

#### 1. Create pattern directory
```
errors/parse/my-error/
├── pattern.js    # Pure function for error detection
├── error.md      # Template with ${VARIABLES}
└── example.md    # Documentation example
```

#### 2. Write pattern.js (pure function, no imports!)
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

#### 3. Write error.md template
```
Variables must start with @. Found invalid syntax for '${varName}'
```

### JavaScript/Node Error Patterns

#### 1. Create pattern directory
```
errors/js/my-js-error/
├── pattern.js    # Pure function for JS error detection
├── error.md      # Template with ${VARIABLES}
└── example.md    # Documentation example
```

#### 2. Write pattern.js
```javascript
export const pattern = {
  name: 'my-js-error',
  
  test(error, ctx) {
    // ctx has: code, error, params, metadata
    // Check error message and code content
    return error.message.includes('TypeError') && 
           ctx.code.includes('undefined');
  },
  
  enhance(error, ctx) {
    // Extract context from the code
    const line = ctx.code.split('\n')[0];
    
    return {
      LINE: line,
      TYPE: 'undefined value'
    };
  }
};
```

#### 3. Write error.md template
```
JavaScript error: Cannot access ${TYPE}

Found in: ${LINE}

Ensure all variables are defined before use.
```

### Build Both Types

```bash
npm run build:errors    # Compiles both parse and JS patterns
```

## Build Process Details

The build process is triggered by `npm run build:errors` which runs both:

### Parse Error Build (`scripts/build-parse-errors.js`)

1. **Scans** `errors/parse/*/` directories for pattern.js and error.md pairs
2. **Parses** pattern.js files to extract the pattern object
3. **Reads** error.md templates
4. **Generates** `core/errors/patterns/parse-errors.generated.js` containing:
   - All patterns in a single array
   - Template strings with proper escaping
   - `interpolateTemplate()` function for variable substitution
   - `enhanceParseError()` function that applies patterns
   - Fallback logic for unmatched errors

### JavaScript Error Build (`scripts/build-js-errors.js`)

1. **Scans** `errors/js/*/` directories for pattern.js and error.md pairs
2. **Parses** pattern.js files (same process as parse errors)
3. **Reads** error.md templates
4. **Generates** `core/errors/patterns/js-errors.generated.js` containing:
   - All JS/Node patterns in a single array
   - `enhanceJSError()` function for runtime error enhancement
   - Returns enhanced error details or null if no match

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

#### Parse Error Context
Each parse pattern receives:
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

#### JavaScript Error Context
Each JS pattern receives:
- `error` - The JavaScript/Node error object with:
  - `message` - Error message
  - `stack` - Stack trace (if available)
- `ctx` - Context object with:
  - `code` - The JavaScript/Node code that was executed
  - `params` - Parameters passed to the function
  - `metadata` - Additional execution metadata

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

### Build Scripts
- `scripts/build-parse-errors.js` - Builds parse error patterns
- `scripts/build-js-errors.js` - Builds JavaScript/Node error patterns

### Generated Files (gitignored)
- `core/errors/patterns/parse-errors.generated.js` - Compiled parse patterns
- `core/errors/patterns/js-errors.generated.js` - Compiled JS/Node patterns

### Integration Points
- `core/errors/patterns/init.ts` - Exports both enhancement functions
- `interpreter/index.ts` - Applies parse error enhancement
- `interpreter/env/executors/JavaScriptExecutor.ts` - Enhances JS runtime errors
- `interpreter/env/executors/NodeExecutor.ts` - Enhances Node runtime errors
- `interpreter/env/executors/BaseCommandExecutor.ts` - Preserves enhanced errors

## Gotchas

- Pattern files must be pure functions (no imports!)
- Pattern names must match directory names
- Templates in error.md are the single source of truth
- Variables returned by `enhance()` must match template placeholders
- Generated files are overwritten on each build
- Parse errors occur before AST creation - work with raw text
- JS errors occur at runtime - have access to code and params
- BaseCommandExecutor must preserve MlldCommandExecutionError instances
- Test runner uses non-greedy regex for template matching