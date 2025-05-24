I'll analyze the TextDirectiveHandler implementation to identify any code that needs to be updated based on the AST structure changes described in the context.

## Findings

After reviewing the implementation file for TextDirectiveHandler, I've identified several areas that need to be updated to align with the new AST structure:

1. **Lines 74-100**: The handler accesses `directiveData.identifier` and `directiveData.values`. Based on the AST changes, the `identifier` property has been removed and should now be accessed through the `children` array. The code should be updated to find the identifier in the children array.

2. **Lines 104-131**: This section accesses `directiveData.value`, `directiveData.values`, `directiveData.source`, `directiveData.embed`, and `directiveData.run`. According to the AST changes, these properties should now be accessed through the `children` array or the `content` property.

3. **Line 113**: When checking `isInterpolatableValueArray(values)`, the code needs to be updated to correctly access values from the new structure.

4. **Lines 115-129**: This section handles resolving values based on different types. It needs to be updated to work with the new AST structure where parsed node structures are now directly in the `children` array rather than nested within other properties.

5. **Lines 133-186**: The handling of `source === 'run'` section accesses `run` as a property. This needs to be updated to find the relevant node in the `children` array.

6. **Lines 187-243**: The handling of `source === 'embed'` section similarly accesses `embed` as a property. This needs to be updated to find the relevant node in the `children` array.

7. **Throughout the file**: The handler is accessing directive properties directly from `node.directive` as if it's an object with various properties. This approach needs to be completely rethought, as the new AST structure has moved these properties to the `children` array and the `content` property.

8. **Lines 112-131**: The code that handles the "literal" source needs to be updated to work with the new structure where text nodes are directly in the `children` array.

The implementation needs significant updates to align with the new AST structure. The core logic should be revised to:
- Stop relying on the removed `identifier` property and instead find identifiers in the `children` array
- Stop accessing nested properties and instead work with the nodes directly in the `children` array
- Use the `content` property consistently for accessing raw string content