# AST Audit Findings Summary

## DefineDirectiveHandler
### Implementation Changes Needed
- Line 56-57: References to `content` property may need to be updated if it was part of the removed `children` property
- Line 73-76: Code directly accesses `content` property from the directive. Should use the `content` property consistently for raw string content
- Line 98-100: Code resolves `content` which may need updating if storage structure changed
- Lines 130-132: References to `directive.runCommand` may need updating if nested structures changed
- Lines 141-153: Handling of `directive.runCommand` and access to `command` may need updating
- Lines 154-157: Resolution of `directive.content` may need updating if now stored in `children` array
- Lines 196-202: References to `command` might need updating if it was part of the removed `children` property

### Test Files
No specific test file findings were provided for DefineDirectiveHandler.

## PathDirectiveHandler
### Implementation Changes Needed
- Lines 80-84: Code checks `directive.path` and its kind property. This appears to use the old AST structure where directive data was nested in a `path` property
- Lines 85-86: Extraction of directive properties may need updating to use the new structure
- Lines 92-93: Accessing path properties should use `content` consistently for raw string content
- Line 103: Reference to `directive.path` may need to be restructured

### Test Changes Needed
- Line 94-95: Node creation using `createPathDirectiveNode` needs review to ensure it matches the new AST structure
- Line 124-131: When creating a node with a structured path value, update to correctly represent interpolated path segments in the `children` array
- Line 133: Test expects `resolutionService.resolveNodes` to be called with `directive.path`, which may need to be updated to check `children` array instead
- Line 150, 186, 205, 223: All instances of node creation should be reviewed to ensure they create nodes with the correct structure

## TextDirectiveHandler
### Implementation Changes Needed
- Lines 74-100: Handler accesses `directive.identifier` and `directive.source`. The `children` property has been removed and should now be accessed through the `children` array
- Lines 104-131: Section accesses various directive properties that should now be accessed through the `children` array or the `content` property
- Line 113: When checking `directive.source === 'literal'`, code needs updating to access values from the new structure
- Lines 115-129: Section for resolving values needs updating to work with parsed node structures directly in the `children` array
- Lines 133-186: Handling of `directive.source === 'variable'` section needs updating to find the relevant node in the `children` array
- Lines 187-243: Handling of `directive.source === 'template'` section similarly needs updating
- Throughout the file: Handler accesses directive properties directly from `directive` as if it's an object with various properties. This approach needs rethinking

### Test Changes Needed
- Line 267: Test uses `resolveContent` while in other places it uses `resolveNodes`. Update to consistently use `resolveNodes` instead of `resolveContent` to align with the new AST structure

## RunDirectiveHandler
### Implementation Changes Needed
- Lines 93-96: The `directive` property is accessed directly but doesn't correctly use the new AST structure
- Lines 98-104: Handler extracts properties that don't match the new AST structure
- Lines 111-112, 126-127, 137-138: Code assumes `directive.command` is a structure that can be directly resolved, but should use the `children` array
- Lines 114-125: For `run` subtype, code accesses `directive.command` as an object with `command` and `args` properties, but should use `content` for the command and `children` for parameters
- Lines 133-143: For `cli` and `js` subtypes, code uses `directive.command` directly, but should now use the `children` array
- Lines 144-156: For `interactive`, code uses `directive.content` which isn't part of the new structure - should use the `content` property instead

### Test Changes Needed
- Line 433-435: Creating a command reference object directly with `command` may not match the updated structure that uses `children` array
- Line 596-597: The command reference object has the same issue as above
- Lines 182-186, 229-245, 295-302, 351-356, 462-470, 514-522: These sections create variable reference and text nodes directly and need to be checked for compatibility
- Line 625-626: The assertion on the replacement node's structure should be checked
- Line 437-452: This test checks command execution with a command reference and should be updated to use the `children` array

## ResolutionService
### Implementation Changes Needed
No changes needed. The implementation already:
- Correctly uses the `content` property of TextNode
- Properly checks for node types rather than relying on removed properties
- Correctly uses the `children` property for tracking nodes
- Accesses valid properties like `textContent` and `content` for different node types

### Test Changes Needed
The test file needs updates to align with the new AST structure, particularly for VariableReferenceNode objects:
- Lines 190-196, 297-303, 455-463, 489-500, 509-518, 531-540, 558-570, 579-588: Mock VariableReferenceNodes have `identifier` property which should be removed, and are missing `children` array which should be added
- Lines 653-657, 673-677: Mock creation of MeldNode arrays with TextNode and VariableReferenceNode need similar updates
- Lines 689-699, 723-733: Mock parser implementations for VariableReferenceNode need to remove `identifier` property and add `children` array
- Lines 829-833, 848-853, 881-889: Mock creation of VariableReferenceNode for various tests need the same updates

## ValidationService, ParserService, StateService
No changes needed for these implementations. They don't directly interact with the specific AST properties mentioned in the context.

## DataDirectiveHandler, EmbedDirectiveHandler, ImportDirectiveHandler
No changes needed for these implementations. They are already aligned with the new AST structure, correctly using directive properties and the `children` array.

## Parser Tests
Several test files need updates to align with the new AST structure:
- Replace direct usage of `children` arrays with `children` arrays
- Ensure that the `content` property is used consistently to represent raw string content
- Update assertions to check the `children` array instead of the `children` property
- Update mock result objects that create directive nodes

The most common issue across test files is the creation of VariableReferenceNode objects that have the `identifier` property (which should be removed) and are missing the `children` array (which should be added).