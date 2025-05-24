I'll analyze the test file to identify any code that might need changes based on the AST structure modifications.

## Findings

The test file needs several updates to align with the new AST structure. Here are the specific areas that need attention:

1. **Line 179-196**: The test case "should parse directive content" mocks a result with a structure that doesn't align with the new AST:
   - It uses `directive.value` as an array directly, but according to the changes, the `value` property has been removed and should use the `children` array instead.

2. **Line 375-401**: The test case "should parse a simple text directive" has similar issues:
   - It uses `directive.value` array which should be replaced with `children` array.

3. **Line 404-438**: The test case "should parse @run directive with interpolated values in brackets":
   - Uses `directive.command` as an array directly, but according to the changes, this should likely be using the `children` array.
   - The test refers to `InterpolatableValue` type which may need updating.

4. **Throughout the tests**: All the mock result objects that create directive nodes need to be updated:
   - Replace any direct usage of `value` arrays with `children` arrays
   - Ensure that the `content` property is used consistently to represent raw string content
   - Update assertions to check the `children` array instead of the `value` property

5. **Line 426-436**: The assertions on `commandParts` variable need to be updated to check the appropriate structure based on the new AST design.

The test file generally needs to be updated to reflect that node structures (like text nodes, variable references) are now stored in the `children` array rather than in `value` or other removed properties.