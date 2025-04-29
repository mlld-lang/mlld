I'll analyze the test file for DataDirectiveHandler to identify any needed changes based on the AST structure updates.

## Findings

After reviewing the test file in detail, here are the specific areas that need updates to align with the new AST structure:

1. **Line 148-149**: In `createDataDirective` function call, the test is creating a directive node for testing. The test utility function needs to be checked to ensure it's correctly creating nodes with `children` array instead of using the removed `childNodes` property.

2. **Line 167**: Another `createDataDirective` call that might need updating in the underlying test utility.

3. **Line 175**: `createDataDirective` usage that needs to be checked.

4. **Line 193**: The test creates a directive node with `createDirectiveNode` and sets a `run` property with command that includes a text node. This should be checked to ensure it's using the `children` array correctly for the command instead of any removed properties.

5. **Line 195**: When mocking `resolveNodes`, the function expects nodes to have a `content` property which is being accessed with `n.content`. This might need to be updated to check the `value` property instead according to the AST changes.

6. **Line 201**: Another `createDataDirective` call that should be verified.

7. **Line 209**: `createDataDirective` usage that needs checking.

8. **Line 219**: `createDataDirective` call for variable resolution tests.

9. **Line 229**: Another `createDataDirective` call with variable reference.

10. **Line 240**: Final `createDataDirective` usage that should be checked.

The test file mostly relies on factory functions (`createDataDirective`, `createDirectiveNode`, etc.) to create test nodes rather than constructing them directly. The implementation of these factory functions would need to be updated to align with the new AST structure, particularly ensuring they:

- Use `children` array instead of `childNodes`
- Don't use the removed `content` property
- Correctly structure the `value` property
- Properly handle the `children` array with parsed node structures

The test file itself doesn't directly assert against these properties, but it depends on the correct implementation of the factory functions.