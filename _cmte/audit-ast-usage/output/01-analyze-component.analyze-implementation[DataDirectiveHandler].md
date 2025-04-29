I'll analyze the `DataDirectiveHandler` implementation to identify any code that needs to be updated based on the AST structure changes described in the context.

## Findings

After reviewing the implementation file for the DataDirectiveHandler, I've identified the following areas that need attention to align with the new AST structure:

1. **Lines 207-213**: The code accesses `node.directive` properties directly:
   ```javascript
   const identifier = node.directive.identifier;
   const source = node.directive.source ?? 'literal';
   const value = node.directive.value;
   const embed = node.directive.embed;
   const run = node.directive.run;
   ```
   This seems correct as it's accessing the directive property, not children or content.

2. **Lines 249-252**: When handling source="literal", the code works with `value`:
   ```javascript
   if (value === undefined) {
     throw new DirectiveError('Missing value for @data directive with source="literal"', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
   }
   // Resolve potential variables within the literal value first
   resolvedValue = await this.resolveInterpolatableValuesInData(value, resolutionContext);
   ```
   This appears correct since it's using the value property directly.

3. **Lines 254-301**: When handling source="run", the code accesses properties from the `run` object:
   ```javascript
   const commandInput = run.command;
   const runSubtype = run.subtype;
   ```
   This is correct as it's using the run property from the directive object.

4. **Lines 302-365**: When handling source="embed", the code accesses properties from the `embed` object:
   ```javascript
   const embedSubtype = embed.subtype;
   ```
   This is correct as it's using the embed property from the directive object.

5. **Lines 421-476**: The `resolveInterpolatableValuesInData` method checks for interpolatable values:
   ```javascript
   if (isInterpolatableValueArray(data)) {
     const resolvedString = await this.resolutionService.resolveNodes(data, context);
     // ...
   }
   ```
   This appears to be handling the children array correctly by using a type guard function.

Overall, the implementation appears to already be aligned with the new AST structure. The code doesn't directly reference the removed `children` or `content` properties. Instead, it properly relies on the directive object properties and the `isInterpolatableValueArray` function to handle interpolatable values.

The handler seems to be accessing properties in a way that's compatible with the updated AST structure, so no specific changes are needed based on the described AST changes.