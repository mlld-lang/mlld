# Error Bootstrap System

This is a temporary bootstrap system for capturing and improving parser errors during development. It helps identify confusing error messages and create better alternatives.

## Quick Start

### Capturing Errors

When you encounter a confusing parse error:

```bash
# Run mlld with the --capture-errors flag
echo '/confusing syntax' | mlld --capture-errors

# Or with a file
mlld run myfile.mld --capture-errors
```

This will:
1. Create a directory in `errors/captured/001/` (incrementing number)
2. Save the input that caused the error
3. Save error context in JSON format
4. Copy a pattern template for you to fill out

### Testing Error Patterns

After creating or modifying a pattern:

```bash
# Test a captured error
mlld error-test errors/captured/001

# Test an existing pattern
mlld error-test errors/cases/parse/directive-unknown
```

### Creating Patterns

1. Look at the captured error in `errors/captured/XXX/`
2. Edit the `pattern.ts` file to detect and enhance the error
3. Add your pattern to `core/errors/patterns/registry.ts`:
   ```typescript
   import { pattern as myPattern } from '../../../errors/cases/parse/my-pattern/pattern';
   // Add to the errorPatterns array
   ```
4. Test it with `mlld error-test`
5. When happy, move it to `errors/cases/parse/descriptive-name/`
6. Rebuild: `npm run build`

## Directory Structure

```
errors/
├── README.md           # This file
├── cases/              # Permanent error patterns
│   └── parse/          # Parser error patterns
│       ├── directive-unknown/
│       │   ├── pattern.ts    # Error detection & enhancement
│       │   └── example.md    # Documentation
│       └── import-wildcard/
│           ├── pattern.ts
│           └── example.md
├── captured/           # Temporary captured errors (gitignored)
│   └── 001/
│       ├── input.mld      # Input that caused error
│       ├── context.json   # Error details
│       ├── pattern.ts     # Template to fill out
│       └── example.md     # Auto-generated docs
└── templates/          # Templates for new patterns
    └── pattern.ts      # Pattern template
```

## Pattern Structure

Each pattern must export a `pattern` object with:

```typescript
export const pattern: ErrorPattern = {
  name: 'descriptive-name',
  
  test(error, ctx) {
    // Return true if this pattern matches the error
    // error.found - what the parser found
    // error.expected - what the parser expected
    // ctx.line - the line containing the error
    // ctx.source - full source code
    return false;
  },
  
  enhance(error, ctx) {
    // Return a helpful error message
    return new MlldParseError(
      'Clear, actionable error message',
      error.location
    );
  }
};
```

## Common Pattern Examples

### Unknown Directive
```typescript
test: (e, ctx) => e.found === '/' && !ctx.line.match(/^\/(var|show|run|...)/),
enhance: (e, ctx) => {
  const attempt = ctx.line.match(/^\/(\w+)/)?.[1];
  return new MlldParseError(
    `Unknown directive '/${attempt}'. Available: /var, /show, /run...`,
    e.location
  );
}
```

### Missing Quotes
```typescript
test: (e, ctx) => e.expected.some(x => x.text === '"') && ctx.line.includes(' '),
enhance: (e, ctx) => new MlldParseError(
  'Paths with spaces must be quoted: "path with spaces.mld"',
  e.location
)
```

## Important: Pattern Registration

Due to TypeScript path alias limitations with dynamic imports, all patterns must be registered in `core/errors/patterns/registry.ts`. This ensures patterns can use `@core/errors` imports properly.

```typescript
// In core/errors/patterns/registry.ts
import { pattern as directiveUnknown } from '../../../errors/cases/parse/directive-unknown/pattern';
import { pattern as myNewPattern } from '../../../errors/cases/parse/my-new-pattern/pattern';

export const errorPatterns: ErrorPattern[] = [
  directiveUnknown,
  myNewPattern, // Add your pattern here
  // ...
];
```

## Notes

- This is **temporary** infrastructure for improving errors
- Patterns will eventually be built into the parser
- Focus on the most confusing/common errors first
- Keep patterns simple and focused on one error type
- Test patterns thoroughly before moving to `cases/`
- Always add patterns to the registry for them to work