<thinking>
Let me systematically analyze the TextDirectiveHandler's interface usage and mocks by following the steps outlined in the request.

## 1. Identify Handler Code
The TextDirectiveHandler code is located in the `<ServicesPipelineDirectiveserviceHandlersDefinitionTextdirectivehandlerTs>` section. This is the main handler implementation I need to analyze.

## 2. Identify Test Code
The test code for TextDirectiveHandler is located in the `<ServicesPipelineDirectiveserviceHandlersDefinitionTextdirectivehandlerTestTs>` section. This contains all the test setup and mock configurations.

## 3. Identify Interface Definitions
The relevant interface definitions are:
- `IValidationService` in `<ServicesResolutionValidationserviceIvalidationserviceTs>`
- `IResolutionService` in `<ServicesResolutionResolutionserviceIresolutionserviceTs>`
- `IFileSystemService` in `<ServicesFsFilesystemserviceIfilesystemserviceTs>`
- The mock utilities in `<TestsUtilsMocksServicemocksTs>`

Now, let me analyze each interface and compare its definition with its usage in the handler and tests.

## 4. Extract Interface Members

### IValidationService
- `registerValidator(kind: string, validator: (node: DirectiveNode) => Promise<void>): void`
- `removeValidator(kind: string): void`
- `getRegisteredDirectiveKinds(): string[]`
- Also extends ValidationServiceLike which might have additional members (not visible in the provided code)

### IResolutionService
This is a large interface with many methods:
- `resolveText(text: string, context: ResolutionContext): Promise<string>`
- `resolveData(node: VariableReferenceNode, context: ResolutionContext): Promise<JsonValue>`
- `resolvePath(pathString: string | StructuredPath, context: ResolutionContext): Promise<MeldPath>`
- `resolveCommand(commandName: string, args: string[], context: ResolutionContext): Promise<string>`
- `resolveFile(path: MeldPath): Promise<string>`
- `resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>`
- `resolveNodes(nodes: InterpolatableValue, context: ResolutionContext): Promise<string>`
- `resolveInContext(value: string | StructuredPath | InterpolatableValue, context: ResolutionContext): Promise<string>`
- `resolveFieldAccess(baseValue: unknown, fieldPath: AstField[], context: ResolutionContext): Promise<Result<JsonValue, FieldAccessError>>`
- `validateResolution(pathInput: string, validationContext: PathValidationContext): Promise<MeldPath>`
- `extractSection(content: string, sectionHeading: string, fuzzyThreshold?: number): Promise<string>`
- `detectCircularReferences(value: string, context: ResolutionContext): Promise<void>`
- `convertToFormattedString(value: JsonValue, context: ResolutionContext): Promise<string>`
- `enableResolutionTracking(config: Partial<ResolutionTrackingConfig>): void`
- `getResolutionTracker(): VariableResolutionTracker | undefined`

### IFileSystemService
- `readFile(filePath: ValidatedResourcePath): Promise<string>`
- `writeFile(filePath: ValidatedResourcePath, content: string): Promise<void>`
- `exists(filePath: ValidatedResourcePath): Promise<boolean>`
- `stat(filePath: ValidatedResourcePath): Promise<Stats>`
- `isFile(filePath: ValidatedResourcePath): Promise<boolean>`
- `readDir(dirPath: ValidatedResourcePath): Promise<string[]>`
- `ensureDir(dirPath: ValidatedResourcePath): Promise<void>`
- `isDirectory(filePath: ValidatedResourcePath): Promise<boolean>`
- `watch(path: ValidatedResourcePath, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>`
- `getCwd(): string`
- `dirname(filePath: string): string`
- `executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>`
- `setFileSystem(fileSystem: IFileSystem): void`
- `getFileSystem(): IFileSystem`
- `mkdir(dirPath: ValidatedResourcePath, options?: { recursive?: boolean }): Promise<void>` (deprecated)
- `deleteFile(filePath: string): Promise<void>`

## 5. Analyze Handler Usage of Interfaces

### IValidationService Usage in Handler
Looking at the TextDirectiveHandler, it injects the IValidationService:
```typescript
constructor(
  @inject('IValidationService') private validationService: IValidationService,
  @inject('IResolutionService') private resolutionService: IResolutionService,
  @inject('IFileSystemService') private fileSystemService: IFileSystemService
) {
  logger.debug('TextDirectiveHandler constructor called', {
    hasValidationService: !!validationService,
    hasResolutionService: !!resolutionService,
    hasFileSystemService: !!fileSystemService
  });
}
```

However, I don't see any actual usage of the validationService methods within the handler's execute method. It injects the service but doesn't appear to call any of its methods.

### IResolutionService Usage in Handler
The handler uses several methods from IResolutionService:
- `resolveNodes`: Used for resolving interpolatable values (line ~179)
- `resolveInContext`: Used for resolving embed paths (line ~218)
- `resolvePath`: Used for resolving and validating paths (line ~221)
- `extractSection`: Used for extracting sections from embedded content (line ~258)

### IFileSystemService Usage in Handler
The handler uses the following methods from IFileSystemService:
- `readFile`: Used to read file content (line ~233)
- `executeCommand`: Used to execute commands (line ~199)
- `getCwd`: Used to get the current working directory (line ~200)

## 6. Analyze Test/Mock Usage

### Mock Creation
The test uses the standardized mock factories from the test utilities:
```typescript
validationService = createValidationServiceMock();
stateService = createStateServiceMock();
resolutionService = createResolutionServiceMock();
```

It also registers a basic mock for IFileSystemService:
```typescript
testDIContext.registerMock('IFileSystemService', mock()); // Add basic FS mock
```

### IValidationService Mock Usage
The test configures the validationService mock:
```typescript
validationService.validate.mockResolvedValue(undefined);
```

However, the `validate` method is not part of the IValidationService interface as defined in the provided code. This suggests a discrepancy.

### IResolutionService Mock Usage
The test configures several mock implementations for the resolutionService:
- `resolveNodes`: Mocked to handle text and variable references (lines ~78-96)
- `resolveInContext`: Mocked to handle variable resolution (lines ~97-102)

### IFileSystemService Mock Usage
The test doesn't explicitly configure any methods on the fileSystemService mock. It just registers a basic mock.

## 7. Compare and List Discrepancies

### Interface Mismatches

1. **IValidationService**:
   - The handler injects IValidationService but doesn't use any of its methods.
   - The test mocks a `validate` method that doesn't appear in the IValidationService interface definition.

2. **IResolutionService**:
   - The handler uses the `resolveNodes`, `resolveInContext`, `resolvePath`, and `extractSection` methods, which are all part of the interface.
   - No discrepancies found for IResolutionService.

3. **IFileSystemService**:
   - The handler uses `readFile`, `executeCommand`, and `getCwd`, which are all part of the interface.
   - No discrepancies found for IFileSystemService.

### Mock Mismatches

1. **IValidationService**:
   - The test mocks a `validate` method that's not in the interface definition.
   - This suggests either the interface definition is incomplete or the test is mocking something unnecessary.

2. **IResolutionService**:
   - The mock implementation for `resolveNodes` and `resolveInContext` seems appropriate.
   - No clear discrepancies found.

3. **IFileSystemService**:
   - The test creates a basic mock for IFileSystemService but doesn't configure any specific methods.
   - The handler uses `readFile`, `executeCommand`, and `getCwd`, but these aren't specifically mocked in the test.
   - This could be a potential issue if the tests exercise code paths that use these methods.

### Test Setup Issues

1. The test doesn't specifically configure mocks for the IFileSystemService methods that the handler uses (`readFile`, `executeCommand`, `getCwd`).
2. The test mocks a `validate` method on IValidationService that doesn't appear to be in the interface or used by the handler.
</thinking>

# TextDirectiveHandler Interface Usage and Mocks Audit

## Interface Discrepancies Analysis

After analyzing the TextDirectiveHandler code, its tests, and the interfaces it depends on, I've identified several discrepancies between interface definitions, handler usage, and test mocks.

### Interface Mismatches

1. **IValidationService**
   - **Unused Service**: The handler injects `IValidationService` in its constructor but never uses any of its methods in the `execute` function. This appears to be an unnecessary dependency.
   - **Missing Interface Method**: The test mocks a `validate` method (line 69: `validationService.validate.mockResolvedValue(undefined)`) that is not defined in the `IValidationService` interface provided.

2. **IStateService**
   - **Missing Interface Definition**: The handler's `execute` method returns `IStateService`, but the complete interface definition for `IStateService` was not provided in the audit bundle, making it difficult to verify proper usage.
   - **Method Usage Without Type Checking**: The handler uses methods like `state.setTextVar()` (line 282), `state.getCommandVar()` (line 177), and others without clear interface verification.

### Mock Mismatches

1. **IFileSystemService**
   - **Incomplete Mocking**: The test creates a basic mock for `IFileSystemService` (line 154: `testDIContext.registerMock('IFileSystemService', mock())`) but doesn't configure any specific methods the handler uses:
     - `readFile` (used in handler line 233)
     - `executeCommand` (used in handler line 199)
     - `getCwd` (used in handler line 200)
   - This could lead to test failures when code paths using these methods are exercised.

2. **IResolutionService**
   - **Inconsistent Mocking**: While the test provides custom implementations for `resolveNodes` and `resolveInContext`, it doesn't specifically mock `resolvePath` or `extractSection`, which are also used by the handler.
   - **Type Signature Mismatch**: The mock for `resolveInContext` (lines 97-102) has a simplified implementation that doesn't fully match the complex type signature in the interface.

### Test Setup Issues

1. **Mock Method Verification**
   - The test verifies `stateService.setTextVar` was called with expected parameters, but doesn't verify any interactions with `resolutionService` or `fileSystemService` methods, despite the handler making extensive use of them.

2. **Error Case Testing**
   - While there are tests for error cases, they don't specifically verify the error handling for file system operations (`readFile`, `executeCommand`), which could fail in production.

3. **Missing Test Coverage**
   - No specific tests for the `source === 'embed'` code path that uses `fileSystemService.readFile`
   - Limited testing for the `source === 'run'` code path that uses `fileSystemService.executeCommand`

## Summary of Findings

The primary concerns are:

1. The handler injects `IValidationService` but never uses it, suggesting either:
   - The dependency is unnecessary and should be removed
   - There's missing validation logic that should be implemented

2. The test mocks are incomplete, particularly for `IFileSystemService`, which could lead to test failures or missed bugs.

3. There's a mismatch between the test's expectation of a `validate` method on `IValidationService` and the actual interface definition.

These issues should be addressed to improve the reliability of the code and its tests, ensuring that the interfaces, implementation, and tests are properly aligned.