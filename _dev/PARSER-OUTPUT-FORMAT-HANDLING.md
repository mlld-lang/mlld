# Parser Output Format Handling in Directive Handlers

## Issue
Integration tests for import handling were failing with the error:
```
MeldInterpreterError: Interpreter error (Directive): Directive error (import): Failed to interpret imported file: Interpreter error (interpretation): No nodes provided for interpretation
```

## Root Cause
The issue was in the `ImportDirectiveHandler` when processing the output from `ParserService.parse()`. The handler expected the parser to return an object with a `nodes` property, but in some cases, it returned an array of nodes directly.

The incompatibility occurred between:
1. Unit tests that mocked the parser to return `{ nodes: [...] }`
2. Integration tests that used the real parser which returned an array of nodes directly

## Solution
We modified the `ImportDirectiveHandler.execute()` method to handle both output formats by adding code that detects and normalizes the parser output format:

```typescript
// Extract nodes array based on return format from parser
// ParserService.parse can return either an array of nodes directly or an object with nodes property
const nodes = Array.isArray(parsedResults) 
  ? parsedResults 
  : (parsedResults as any).nodes || [];

if (nodes.length === 0) {
  logger.warn('Empty nodes array from parser', {
    filePath: resolvedFullPath,
    parsedResults: typeof parsedResults
  });
}

// Perform the interpretation with the extracted nodes
resultState = await interpreterClient.interpret(nodes, {
  initialState: importedState,
  currentFilePath: resolvedFullPath
});
```

This change ensures the handler works correctly regardless of the parser output format, making both unit tests and integration tests pass.

## Future Considerations
For the URL handling implementation, we should ensure:

1. The URL-related directive handlers all handle the parser output format correctly
2. Unit tests simulate the real parser output format consistently
3. We standardize the parser output format across the system for easier maintenance

## Implementation in URL Functionality

When implementing the URL functionality for directives, these considerations should be incorporated:

1. In `PathService.ts`:
   - Ensure all URL resolution methods adhere to the same pattern for path resolution
   - Consider implementing URL content caching to minimize network requests

2. In `ImportDirectiveHandler.ts` and `EmbedDirectiveHandler.ts`:
   - Both handlers should uniformly handle parser output format to maintain consistency
   - URL validation and fetching should follow security best practices

3. In tests:
   - Update unit tests to use consistent parser output format simulation
   - Add integration tests specifically for URL functionality in directives

This approach will ensure the URL functionality works correctly and consistently across the codebase.