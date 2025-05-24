## Findings

After reviewing the test file and comparing it against the AST changes described in the context, I've identified several locations that need updates:

1. **Line 358-371**: The `createRunDirective` function is being used to create directive nodes for testing, but we need to check its implementation to ensure it's using the updated AST structure.

2. **Line 433-435**: Creating a command reference object directly with `{ name: 'greet', args: [], raw: '$greet' }` may not match the updated structure that uses `values` array instead of direct properties.

3. **Line 596-597**: The command reference object `{ name: 'undefinedCommand', args: [], raw: '$undefinedCommand' }` has the same issue as above.

4. **Lines 182-186, 229-245, 295-302, 351-356, 462-470, 514-522**: These sections create variable reference and text nodes directly, and need to be checked for compatibility with the new AST structure.

5. **Line 625-626**: The assertion on the replacement node's structure should be checked to ensure it's aligned with the new AST structure.

6. **Throughout the file**: The test file uses `createRunDirective`, `createTextNode`, and `createVariableReferenceNode` helper functions from `@tests/utils/testFactories`. These factory functions need to be reviewed to ensure they're creating nodes with the updated structure.

7. **Line 437-452**: This test checks command execution with a command reference, and should be updated to use the `values` array instead of direct properties.

The most critical changes needed are:
- Update any direct creation of node objects to use the `values` array instead of removed properties
- Ensure the `raw` property is correctly used for directives
- Update assertions to check the `values` array for node structures instead of removed properties