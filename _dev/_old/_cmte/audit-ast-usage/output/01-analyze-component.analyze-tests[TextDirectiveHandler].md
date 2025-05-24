I've analyzed the test file for TextDirectiveHandler to identify any issues related to the AST structure changes. Let me provide my findings:

## Findings

The test file for TextDirectiveHandler shows no direct issues related to the AST structure changes mentioned in the context. Here's why:

1. **No direct manipulation of `value` property**: The test doesn't create or assert against the removed `value` property directly. Instead, it uses the `createNodeFromExample()` function (lines 222-237) to parse example code into AST nodes using the `@core/ast` import, which would already handle the updated structure.

2. **No direct manipulation of `params` property**: There are no references to the deprecated `params` property in the test file.

3. **Appropriate usage of AST nodes**: The test interacts with AST nodes through:
   - Calling `resolutionService.resolveNodes` with `node.directive.value` (line 267) or `ast.directive.values` (lines 287, 308, 329, 350, 393) - this suggests the test might need to be updated to consistently use `values` instead of `value` in some places.
   - The test is mostly focusing on the resolution and state changes rather than asserting on the AST structure itself.

4. **Potential minor issue**: In line 267, the test uses `node.directive.value` while in other places it uses `ast.directive.values`. This inconsistency should be addressed by consistently using `values` instead of `value` to align with the new AST structure.

The test primarily focuses on the behavior of the TextDirectiveHandler rather than the structure of the AST nodes themselves. It creates nodes by parsing example code, which would already follow the current AST structure, and then tests the handler's functionality with these nodes.

The only change needed would be to update line 267 from:
```javascript
vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('Hello');
```
to ensure it's using `node.directive.values` instead of `node.directive.value` for consistency with the rest of the test and to align with the new AST structure.