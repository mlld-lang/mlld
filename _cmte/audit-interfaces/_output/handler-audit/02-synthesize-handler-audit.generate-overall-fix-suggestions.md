# Handler Interface and Mock Audit Findings & Suggestions

After analyzing the handler audits, I've identified several patterns of discrepancies between interface definitions, handler implementations, and test mocks. Below are my recommendations organized by target file.

## Interface File Suggestions

### `services/resolution/ResolutionService/IResolutionService.ts`

1. **Remove method duplication**: The interface contains duplicate/overloaded definitions for `resolveInContext`, `resolveData`, `resolvePath`, and other methods, creating ambiguity.
   ```typescript
   // CURRENT ISSUE: Duplicate method definitions with different signatures
   resolveData(node: VariableReferenceNode, context: ResolutionContext): Promise<JsonValue>;
   // ...later in the same interface...
   resolveData(ref: VariableReferenceNode, context: ResolutionContext): Promise<any>;
   ```
   
   **Suggestion**: Consolidate duplicate methods with a single, consistent signature using specific types rather than `any`:
   ```typescript
   resolveData(node: VariableReferenceNode, context: ResolutionContext): Promise<JsonValue>;
   ```

2. **Add missing method overloads**: Handlers are using method signatures that don't match the interface.
   
   **Suggestion**: Add the following method overloads to match actual usage:
   ```typescript
   resolveNodes(value: InterpolatableValue, context: ResolutionContext): Promise<string>;
   resolveInContext(value: VariableReferenceNode, context: ResolutionContext): Promise<string>;
   ```

### `services/validation/ValidationService/IValidationService.ts`

1. **Add missing validate method**: Multiple handlers use `validationService.validate()` but this method isn't explicitly defined in the interface.
   
   **Suggestion**: Add the validate method to the interface:
   ```typescript
   validate(node: DirectiveNode): Promise<void>;
   ```

### `services/fs/FileSystemService/IFileSystemService.ts`

1. **Remove deprecated methods**: The interface contains deprecated methods like `fileExists` that should be removed or clearly marked.
   
   **Suggestion**: Either remove deprecated methods or properly annotate them:
   ```typescript
   /**
    * @deprecated Use exists() instead
    */
   fileExists(filePath: string): Promise<boolean>;
   ```

2. **Ensure path type consistency**: Methods accept `ValidatedResourcePath` but are often called with string arguments.
   
   **Suggestion**: Update method signatures to accept either type:
   ```typescript
   exists(filePath: string | ValidatedResourcePath): Promise<boolean>;
   readFile(filePath: string | ValidatedResourcePath): Promise<string>;
   ```

## Mock Utility File Suggestions

### `tests/utils/mocks/serviceMocks.ts`

1. **Fix ValidationService mock**: Add the missing `validate` method to the mock factory.
   
   **Suggestion**:
   ```typescript
   export function createValidationServiceMock() {
     const service = mock<IValidationService>();
     // Add validate method
     service.validate = vi.fn().mockResolvedValue(undefined);
     return service;
   }
   ```

2. **Fix FileSystemService mock**: Remove extra methods not in the interface and ensure all required methods are mocked.
   
   **Suggestion**:
   ```typescript
   export function createFileSystemServiceMock() {
     const service = mock<IFileSystemService>();
     // Core methods used by most handlers
     service.readFile = vi.fn().mockResolvedValue('');
     service.writeFile = vi.fn().mockResolvedValue(undefined);
     service.exists = vi.fn().mockResolvedValue(true);
     service.getCwd = vi.fn().mockReturnValue('/workspace');
     service.executeCommand = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
     service.deleteFile = vi.fn().mockResolvedValue(undefined);
     // Remove fileExists and resolvePath which aren't in the interface
     return service;
   }
   ```

3. **Fix ResolutionService mock**: Ensure the mock factory implements all methods with consistent signatures.
   
   **Suggestion**:
   ```typescript
   export function createResolutionServiceMock() {
     const service = mock<IResolutionService>();
     // Add common methods used by handlers
     service.resolveInContext = vi.fn().mockImplementation(async (value, ctx) => {
       if (typeof value === 'string') return value;
       if (value?.type === 'VariableReference') return `resolved-var:${value.identifier}`;
       return JSON.stringify(value);
     });
     service.resolveNodes = vi.fn().mockImplementation(async (nodes, ctx) => {
       if (Array.isArray(nodes)) {
         return nodes.map(n => n.content || `{{${n.identifier}}}`).join('');
       }
       return String(nodes);
     });
     service.resolvePath = vi.fn().mockResolvedValue({ path: '/test/path' } as MeldPath);
     service.extractSection = vi.fn().mockResolvedValue('');
     return service;
   }
   ```

## Handler File Suggestions

### `services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.ts`

1. **Remove commented validation code**: The handler has commented-out validation code that should be either removed or implemented.
   
   **Suggestion**: Either remove the commented code or implement validation properly:
   ```typescript
   // Remove this commented code if not needed
   // await this.validationService.validate(node);
   
   // Or implement it properly
   await this.validationService.validate(node);
   ```

### `services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.ts`

1. **Remove unused ValidationService injection**: The handler injects ValidationService but never uses it.
   
   **Suggestion**: Remove the unused dependency:
   ```typescript
   constructor(
     // Remove this line if not used
     // @inject('IValidationService') private validationService: IValidationService,
     @inject('IResolutionService') private resolutionService: IResolutionService,
     // ...
   ) {}
   ```

### `services/pipeline/DirectiveService/handlers/execution/TextDirectiveHandler.ts` and `RunDirectiveHandler.ts`

1. **Remove unused ValidationService injection**: These handlers inject ValidationService but don't use it.
   
   **Suggestion**: Remove the unused dependency:
   ```typescript
   constructor(
     // Remove this line if not used
     // @inject('IValidationService') private validationService: IValidationService,
     @inject('IResolutionService') private resolutionService: IResolutionService,
     @inject('IFileSystemService') private fileSystemService: IFileSystemService
   ) {}
   ```

## Test File Suggestions

### All handler test files

1. **Standardize mock creation**: Use the provided mock factories consistently instead of creating manual mocks.
   
   **Suggestion**:
   ```typescript
   // Instead of manual mocks like this:
   resolutionServiceMock = {
     resolveNodes: vi.fn().mockImplementation(/* ... */),
     // ...
   };
   
   // Use the factory consistently:
   resolutionService = createResolutionServiceMock();
   // Then customize specific methods if needed:
   resolutionService.resolveNodes.mockImplementation(/* ... */);
   ```

2. **Avoid mocking non-existent methods**: Tests mock methods that don't exist in interfaces.
   
   **Suggestion**: Ensure mocks only include methods defined in interfaces:
   ```typescript
   // Don't mock methods not in the interface
   // validationService.validate.mockRejectedValue(validationError); // If not in interface
   
   // Instead, ensure the interface includes the method first
   ```

### `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts`

1. **Fix validation testing**: Tests expect validation errors but use a mock method that doesn't exist in the interface.
   
   **Suggestion**:
   ```typescript
   // After ensuring IValidationService has a validate method:
   it('should validate directive structure', async () => {
     validationService.validate.mockRejectedValue(new MeldDirectiveError('Invalid directive'));
     
     await expect(handler.execute(invalidNode, context)).rejects.toThrow(MeldDirectiveError);
     expect(validationService.validate).toHaveBeenCalledWith(invalidNode);
   });
   ```

### `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts`

1. **Fix skipped tests**: Address the mocking issues causing tests to be skipped.
   
   **Suggestion**:
   ```typescript
   // For the "should handle heading level validation" test:
   it('should handle heading level validation', async () => {
     // Use expectToThrowWithConfig instead of direct assertions
     await expectToThrowWithConfig(async () => {
       await handler.execute(invalidHeadingNode, context);
     }, {
       errorType: MeldDirectiveError,
       code: 'INVALID_HEADING_LEVEL',
       message: expect.stringContaining('Invalid heading level')
     });
     
     // Verify logger was called with direct spy if needed
     expect(vi.spyOn(logger, 'warn')).toHaveBeenCalled();
   });
   ```

## Priority Recommendations

Here are the highest priority changes that would address the most critical issues:

1. **Add the missing `validate` method to `IValidationService`** - This will fix numerous test failures and clarify the interface contract.

2. **Consolidate duplicate method definitions in `IResolutionService`** - This will reduce ambiguity and make the interface more maintainable.

3. **Standardize the mock factories in `serviceMocks.ts`** - Ensuring these properly implement all required methods will make tests more consistent and reliable.

4. **Remove unused ValidationService injections** - This will simplify the handlers and make their dependencies clearer.

These changes should address the most common discrepancies found across multiple handlers and tests, providing a solid foundation for further improvements.