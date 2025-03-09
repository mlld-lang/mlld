# Action Plan for Fixing 43 Failing Tests

## 1. PathService Fixes (15 failures)

### Issue
The PathService implementation doesn't correctly handle path normalization and validation as expected by the tests in `PathService.tmp.test.ts` and `api/integration.test.ts`.

### Action Items
1. Implement special path variable resolution:
   ```typescript
   // Add these methods to PathService
   resolveHomePath(path: string): string {
     // Replace $~ with the actual home path
     return path.replace(/^\$~\/|^\$~$/, this.homePath + '/');
   }
   
   resolveProjectPath(path: string): string {
     // Replace $. with the actual project path
     return path.replace(/^\$\.\/|^\$\.$/, this.projectPath + '/');
   }
   ```

2. Update `resolvePath()` method to validate paths according to test expectations:
   ```typescript
   resolvePath(filePath: string | StructuredPath, baseDir?: string): string {
     // Handle structured path first
     if (typeof filePath !== 'string') {
       // Extract raw path and validate segments
       // ...existing code...
     }
     
     // Handle string path
     if (!filePath) return '';
     
     // Special path variable resolution
     if (filePath.startsWith('$~') || filePath === '$HOMEPATH') {
       return this.resolveHomePath(filePath);
     }
     
     if (filePath.startsWith('$.') || filePath === '$PROJECTPATH') {
       return this.resolveProjectPath(filePath);
     }
     
     // Reject paths with . and .. segments
     if (filePath.includes('./') || filePath.includes('../')) {
       throw new PathValidationError(
         PathErrorMessages.validation.dotSegments.message,
         PathErrorCode.CONTAINS_DOT_SEGMENTS
       );
     }
     
     // Reject raw absolute paths
     if (path.isAbsolute(filePath)) {
       throw new PathValidationError(
         PathErrorMessages.validation.rawAbsolutePath.message,
         PathErrorCode.INVALID_PATH_FORMAT
       );
     }
     
     // Reject paths with slashes but no path variable
     if (filePath.includes('/') && !this.hasPathVariables(filePath)) {
       throw new PathValidationError(
         PathErrorMessages.validation.slashesWithoutPathVariable.message,
         PathErrorCode.INVALID_PATH_FORMAT
       );
     }
     
     // Existing code for baseDir handling
     // ...
   }
   ```

3. Update error handling to include location information:
   ```typescript
   // Ensure error objects include location information when provided
   throw new PathValidationError(
     message,
     {
       code: errorCode,
       path: pathString,
       location: options.location // Pass through location if provided
     }
   );
   ```

## 2. VariableReferenceResolver Fixes (2 failures)

### Issue
The `tests/variable-index-debug.test.ts` tests are failing due to method naming inconsistencies:
- `privateResolver.resolveFieldAccess is not a function`
- `Cannot read properties of undefined (reading 'bind')`

### Action Items
1. Check the current implementation of VariableReferenceResolver:
   ```typescript
   // If the method was renamed, we need to either:
   // 1. Change it back to the original name, or
   // 2. Update the test to use the new name
   
   // Add the missing method if it was removed:
   resolveFieldAccess(varName: string, fieldPath: string[]): any {
     // Implementation...
   }
   
   // Add the missing debug method:
   debugFieldAccess(varName: string, fieldPath: string[]): any {
     // Implementation for debug method
   }
   ```

## 3. CLI Error Handling Fixes (2 failures)

### Issue
Tests in `tests/cli/cli-error-handling.test.ts` are failing because console mocks aren't being called.

### Action Items
1. Fix the test setup for console mocks:
   ```typescript
   // Check how the console is being mocked and ensure it's being properly captured
   const consoleMocks = {
     mocks: {
       error: vi.fn(),
       log: vi.fn()
     }
   };
   
   // Make sure the CLI code is actually using the mocked console
   console.error = consoleMocks.mocks.error;
   console.log = consoleMocks.mocks.log;
   ```

2. Verify that error handling code is properly calling console.error:
   ```typescript
   // In CLI code:
   try {
     // ...operation that might fail
   } catch (error) {
     console.error(`Failed to process: ${error.message}`);
     // Make sure this is being called!
   }
   ```

## 4. InterpreterService Integration Fixes (12 failures)

### Issue
Multiple failures in `InterpreterService.integration.test.ts` related to error handling and circular import detection.

### Action Items
1. Fix state rollback on merge errors:
   ```typescript
   // In the interpreteContent method:
   try {
     // ...existing code
     if (options.mergeState && stateContext.hasErrors()) {
       // Properly handle state rollback
       await this.stateService.rollback(stateContext);
       throw new MeldInterpreterError(
         `Error merging state: ${stateContext.getErrorMessages().join(', ')}`,
         { stateContext }
       );
     }
   } catch (error) {
     // Ensure proper error handling
   }
   ```

2. Fix circular import detection:
   ```typescript
   // Make sure CircularityService is properly wired up
   import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
   
   // In the import handler:
   async handle(node: MeldNode, context: InterpreterContext): Promise<any> {
     const importPath = node.attributes?.path;
     if (!importPath) {
       throw new MeldDirectiveError('Import directive requires a path attribute');
     }
     
     // Check for circular imports
     if (context.importChain.includes(importPath)) {
       throw new MeldDirectiveError(
         `Circular import detected: ${[...context.importChain, importPath].join(' -> ')}`,
         { node }
       );
     }
     
     // Continue with import processing
     // ...
   }
   ```

3. Add proper error location tracking:
   ```typescript
   // Ensure all errors include location information
   throw new MeldInterpreterError(
     errorMessage,
     {
       node, // Include the node for location info
       filePath: context.filePath,
       location: node.location
     }
   );
   ```

## 5. ResolutionService Fixes (12 failures)

### Issue
Failures in `ResolutionService.test.ts` related to validation and circular reference detection.

### Action Items
1. Fix validateResolution method:
   ```typescript
   async validateResolution(
     content: string,
     context: ValidationContext
   ): Promise<void> {
     const nodes = await this.parserService.parse(content);
     
     for (const node of nodes) {
       // Variable validation based on context
       if (node.type === 'VariableReference' && node.value?.type === 'Text') {
         if (!context.allowTextVariables) {
           throw new ResolutionError(
             'Text variables are not allowed in this context',
             { node }
           );
         }
       }
       
       if (node.type === 'VariableReference' && node.value?.type === 'Data') {
         if (!context.allowDataVariables) {
           throw new ResolutionError(
             'Data variables are not allowed in this context',
             { node }
           );
         }
       }
       
       // Path variables validation
       if (node.type === 'PathVariable') {
         if (!context.allowPathVariables) {
           throw new ResolutionError(
             'Path variables are not allowed in this context',
             { node }
           );
         }
       }
       
       // Command references validation
       if (node.type === 'CommandReference') {
         if (!context.allowCommandReferences) {
           throw new ResolutionError(
             'Command references are not allowed in this context',
             { node }
           );
         }
       }
     }
   }
   ```

2. Fix circular reference detection:
   ```typescript
   async detectCircularReferences(content: string): Promise<void> {
     const referencesMap = new Map<string, string[]>();
     const nodes = await this.parserService.parse(content);
     
     // Build references map
     for (const node of nodes) {
       if (node.type === 'Directive' && node.name === 'define') {
         const varName = node.attributes?.name;
         const varValue = node.content;
         
         if (varName && varValue) {
           // Extract references from varValue
           const references = await this.extractReferences(varValue);
           referencesMap.set(varName, references);
         }
       }
     }
     
     // Check for circular references
     for (const [varName, references] of referencesMap.entries()) {
       const visited = new Set<string>();
       const path = [varName];
       
       if (this.detectCircularReference(varName, referencesMap, visited, path)) {
         throw new ResolutionError(
           `Circular reference detected: ${path.join(' -> ')}`,
           { content }
         );
       }
     }
   }
   
   private detectCircularReference(
     varName: string,
     referencesMap: Map<string, string[]>,
     visited: Set<string>,
     path: string[]
   ): boolean {
     if (visited.has(varName)) {
       path.push(varName);
       return true;
     }
     
     visited.add(varName);
     const references = referencesMap.get(varName) || [];
     
     for (const ref of references) {
       path.push(ref);
       if (this.detectCircularReference(ref, referencesMap, visited, path)) {
         return true;
       }
       path.pop();
     }
     
     visited.delete(varName);
     return false;
   }
   ```

## Implementation Strategy

1. **Start with PathService**: Most test failures are related to path handling, so fixing this first will have the biggest impact.

2. **Tackle VariableReferenceResolver**: This is a relatively simple fix focusing on method naming consistency.

3. **Fix CLI Error Handling**: These test failures are isolated to the test suite itself and should be straightforward to fix.

4. **Address InterpreterService**: These failures involve more complex interactions but build on the previous fixes.

5. **Complete ResolutionService**: This completes the full set of fixes.

## Testing Approach

For each area of fixes:

1. Make the minimum changes needed to fix the failing tests
2. Run the specific test files to verify the fixes work:
   ```
   npx vitest run services/fs/PathService/PathService.tmp.test.ts
   npx vitest run api/integration.test.ts
   npx vitest run tests/variable-index-debug.test.ts
   npx vitest run tests/cli/cli-error-handling.test.ts
   npx vitest run services/pipeline/InterpreterService/InterpreterService.integration.test.ts
   npx vitest run services/resolution/ResolutionService/ResolutionService.test.ts
   ```

3. After all individual tests pass, run the full test suite to ensure no regressions:
   ```
   npx vitest run
   ```

## Tracking Progress

| Component | Total Failures | Fixed | Remaining |
|-----------|----------------|-------|-----------|
| PathService | 15 | 0 | 15 |
| VariableReferenceResolver | 2 | 0 | 2 |
| CLI Error Handling | 2 | 0 | 2 |
| InterpreterService | 12 | 0 | 12 |
| ResolutionService | 12 | 0 | 12 |
| **Total** | **43** | **0** | **43** |

This table will be updated as fixes are implemented and tested. 