# Warning System in Meld-AST

This document explains how the warning system works in the `meld-ast` parser, with a special focus on the `variable_warning` flag and handling of undefined variables in paths.

## Understanding the `variable_warning` Flag

The `variable_warning` flag serves two distinct but related purposes in the codebase:

### 1. As a property on path objects in the AST

When a path contains text variables (like `{{text_variable}}`), a `variable_warning` flag is automatically set to `true` on the path object. This flag indicates that the path contains variables that may need to be resolved.

```javascript
// Internal parser code that sets the flag
if (textVars.length > 0) {
  result.variable_warning = true;
}
```

Path variables (like `$path_var`) are considered expected in paths and don't trigger this warning flag.

### 2. As a parser option

In the `ParserOptions` interface, `variable_warning` is a boolean option that defaults to `false`:

```typescript
interface ParserOptions {
  // ... other options
  
  /**
   * Suppress warnings for undefined variables in paths (default: false)
   * When true, no warnings are emitted for undefined variables
   * When false, warnings are emitted for undefined variables
   */
  variable_warning?: boolean;
}
```

- When set to `true`, it suppresses warnings for undefined variables in paths.
- When set to `false` (default), warnings are emitted for undefined variables.

## What Warnings Look Like to Users

Warnings are emitted through the `onError` handler that can be configured in the parser options. If no custom handler is provided, warnings are typically logged to the console.

Here's how the warnings are configured:

```typescript
const options: ParserOptions = {
  // Other options...
  
  // Suppress warnings for undefined variables in paths (default: false)
  variable_warning: false,
  
  // Custom error handler
  onError: (error: MeldAstError) => {
    console.warn(`Parse warning: ${error.toString()}`);
  }
};
```

When a warning occurs (when a text variable is found in a path and `variable_warning` is `false`), the `onError` handler is called with a `MeldAstError` object. This error contains:

1. A message about the undefined variable
2. Location information pointing to where in the document the issue was found
3. Additional details like error code

A typical warning might look like:
```
Parse warning: Undefined variable 'text_variable' in path at line 5, column 12
```

## Controlling Warnings

Users have two options to control these warnings:

### 1. Set the parser option

```typescript
const options = {
  variable_warning: true // This suppresses warnings for undefined variables
};
const result = parse(input, options);
```

### 2. Provide a custom error handler

```typescript
const options = {
  onError: (error) => {
    // Custom handling of warnings
    if (error.message.includes('undefined variable')) {
      // Special handling for variable warnings
    } else {
      // Handle other errors
    }
  }
};
```

This system allows developers to either suppress all variable warnings or to handle them in a customized way based on their application's needs.

## Warning Types

Warnings in the parser generally fall into these categories:

1. **Undefined variables** - Variables used in paths that aren't defined
2. **Validation warnings** - Issues found during node validation
3. **Content warnings** - When content in a directive might be misformatted
4. **Syntax warnings** - Non-fatal syntax issues that the parser can still handle

## Examples

### Example 1: Path with undefined text variable

```markdown
@embed [path/to/{{text_variable}}.md]
```

If `text_variable` isn't defined and `variable_warning` is `false`, this will generate a warning.

### Example 2: Double brackets content that looks like a path

```markdown
@embed [[content/that/looks/like/a/path.md]]
```

This might generate a content warning since the content inside double brackets appears to be a path, which typically uses single brackets. 