I'll analyze the implementation of the RunDirectiveHandler to identify any code that needs to be updated based on the AST changes described in the context.

## Findings

After reviewing the RunDirectiveHandler implementation and comparing it with the AST changes and test fixtures, I've identified several areas that need to be updated:

1. **Lines 93-96**: The `directive` property is accessed directly, but the code doesn't correctly use the new AST structure:
   ```javascript
   if (!node.directive || node.directive.kind !== 'run') {
       throw new DirectiveError('Invalid node type provided to RunDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
   }
   const directive = node.directive as IDirectiveData;
   ```
   This should access the directive data correctly. The tests show that `directive` is an object with properties like `kind`, `subtype`, `raw`, and `values`.

2. **Lines 98-104**: The handler extracts properties that don't match the new AST structure:
   ```javascript
   const { 
       subtype, 
       command: commandInput, 
       language, 
       parameters: languageParams, 
       outputVariable = 'stdout', 
       errorVariable = 'stderr' 
   } = directive;
   ```
   According to the fixtures, the directive object now has a different structure with properties like `kind`, `subtype`, `raw`, and `values`.

3. **Lines 111-112, 126-127, 137-138**: The code assumes `commandInput` is a structure that can be directly resolved, but in the new AST structure, we need to use the `values` array:
   ```javascript
   if (subtype === 'runCommand') {
     commandToExecute = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
   }
   ```
   
4. **Lines 114-125**: For `runDefined` subtype, the code accesses `commandInput` as an object with `name` and `args` properties, but in the new structure, it should use `values` for the command and `args` for parameters:
   ```javascript
   const definedCommand = commandInput as { name: string; args?: InterpolatableValue[] };
   // ...
   const cmdVar = state.getVariable(definedCommand.name, VariableType.COMMAND) as CommandVariable | undefined;
   ```

5. **Lines 133-143**: For `runCode` and `runCodeParams` subtypes, the code uses `commandInput` directly, but should now use the `values` array:
   ```javascript
   const scriptContent = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
   ```

6. **Lines 144-156**: For `runCodeParams`, the code uses `languageParams` which isn't part of the new structure - it should use the `args` property instead:
   ```javascript
   if (subtype === 'runCodeParams' && languageParams) {
     try { 
         const resolvedParamsPromises = languageParams.map((param: InterpolatableValue) => 
             this.resolutionService.resolveInContext(param, resolutionContext));
         // ...
     }
   }
   ```

The implementation needs significant updates to properly work with the new AST structure, particularly around how it accesses directive properties, command values, and arguments. The handler should now rely on the `values` array and the `args` property instead of the removed properties.