# Meld API Tests: Essential Context

## What is Meld?

Meld is a pre-processing language and framework that allows users to define variables, run commands, import content, and embed files into documents. It uses a directive-based syntax (e.g., `@text`, `@data`, `@run`, `@import`, `@embed`) and variable references (e.g., `{{variable}}`) to enable dynamic content generation.

## Core Concepts

### 1. Transformation Mode

**Transformation mode** determines whether directives and variables are processed/replaced or left as raw text:

- When **enabled**: `@text greeting = "Hello"` and `{{greeting}}` are processed, resulting in just "Hello" in the output.
- When **disabled**: Directives and variables remain unchanged in the output.

### 2. AST (Abstract Syntax Tree)

The Meld parser (`meld-ast` package) converts input text into an AST representing the document structure. The AST contains different node types:

- **TextVar**: Represents a text variable reference like `{{greeting}}`
- **DataVar**: Represents a data variable reference like `{{config.value}}` or `{{items[0]}}`
- **Directive**: Represents a directive like `@text` or `@data`
- **Text**: Represents plain text content

### 3. Variable Resolution Process

1. The parser generates an AST from the input
2. The `VariableReferenceResolver` processes variable references in the AST
3. When transformation is enabled, variable nodes are replaced with text nodes containing their resolved values
4. The resulting AST is converted back to text

## Current Issues

### 1. AST Node Types

The AST distinguishes between different types of variable references:

```javascript
// Simple variable: {{greeting}}
{
  "type": "TextVar",
  "identifier": "greeting",
  "varType": "text",
  "location": {...}
}

// Data variable with fields: {{config.value}}
{
  "type": "DataVar",
  "identifier": "config",
  "varType": "data",
  "fields": [
    { "type": "field", "value": "value" }
  ],
  "location": {...}
}

// Array access: {{items[0]}}
{
  "type": "DataVar",
  "identifier": "items",
  "varType": "data",
  "fields": [
    { "type": "index", "value": 0 }
  ],
  "location": {...}
}
```

### 2. Current Implementation Shortcomings

- The variable resolver doesn't properly handle all node types
- Transformation is all-or-nothing, with no selective mode for different element types
- Field access using both dot notation (`items.0`) and bracket notation (`items[0]`) isn't consistently handled
- No proper string formatting for complex data structures

### 3. Test Failures

Tests are failing because:
- Many tests disable transformation when they should be testing transformed content
- The implementation doesn't correctly handle variable nodes with transformation enabled
- Array/object formatting is inconsistent

## Key Files

The most important files for understanding and fixing the issues:

1. **Variable Resolution**:
   - `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts` - Contains the core logic for resolving variables
   - `services/state/StateService.ts` - Manages the transformation state

2. **Test Files**:
   - `api/resolution-debug.test.ts` - Tests for variable resolution
   - `api/integration.test.ts` - Integration tests for the API

3. **Helper Files**:
   - `scripts/ast-diagnostics.mjs` - Tool for examining AST structure
   - `scripts/variable-ast-analysis.mjs` - Specialized tool for analyzing variable AST nodes

## Recommended Implementation Strategy

1. Update `VariableReferenceResolver.ts` to properly handle all variable node types.
2. Implement selective transformation in `StateService.ts`.
3. Add better string formatting for complex data structures.
4. Update tests to clearly specify transformation expectations.

See `_issues/_active/api-tests.md` for detailed implementation recommendations.

## Running Diagnostic Tools

To analyze AST structure:
```bash
npm run ast        # General AST diagnostics
npm run var-ast    # Focused variable reference analysis
```

To run tests:
```bash
npm test -- api/resolution-debug.test.ts     # Run variable resolution tests
```

## Example Test Case

```typescript
// Test case that demonstrates the issue
it('should handle array access with dot notation', async () => {
  // Set up the test
  context.fs.writeFileSync('test.meld', '@data items = ["apple", "banana", "cherry"]\nFirst item: {{items.0}}');
  
  // Run with transformation enabled
  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: true
  });
  
  // Verify the output
  expect(result).toContain('First item: apple');  // Should output just 'apple', not an array
});
``` 