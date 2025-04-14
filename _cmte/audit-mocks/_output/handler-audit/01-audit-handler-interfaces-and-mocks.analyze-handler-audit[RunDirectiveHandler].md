<thinking>
Let me start by identifying the relevant components in this audit bundle.

## 1. Identify the Handler Code for RunDirectiveHandler

The handler code is contained in the file `<ServicesPipelineDirectiveserviceHandlersExecutionRundirectivehandlerTs>`. This is a TypeScript class that implements the `IDirectiveHandler` interface and is responsible for executing `@run` directives in the Meld system.

## 2. Identify the Test Code for RunDirectiveHandler

The test code is contained in the file `<ServicesPipelineDirectiveserviceHandlersExecutionRundirectivehandlerTestTs>`. This contains unit tests for the RunDirectiveHandler, using Vitest as the testing framework.

## 3. Identify the Interface Definitions Relevant to RunDirectiveHandler

The relevant interface definitions are:

1. `IValidationService` - In `<ServicesResolutionValidationserviceIvalidationserviceTs>`
2. `IResolutionService` - In `<ServicesResolutionResolutionserviceIresolutionserviceTs>`
3. `IFileSystemService` - In `<ServicesFsFilesystemserviceIfilesystemserviceTs>`
4. `IDirectiveHandler` - Referenced in the handler but not fully provided in the audit bundle

There's also a service mock utility file `<TestsUtilsMocksServicemocksTs>` which contains mock factory functions for these services.

## 4. Compare Interface Definitions, Handler Usage, and Test Mock Usage

Now, I'll analyze each interface to identify discrepancies between the interface definition, how the handler uses it, and how the tests mock it.

### 4.1. IValidationService

**Interface Definition:**
- `registerValidator(kind: string, validator: (node: DirectiveNode) => Promise<void>): void`
- `removeValidator(kind: string): void`
- `getRegisteredDirectiveKinds(): string[]`

**Handler Usage:**
Looking at the RunDirectiveHandler, it injects IValidationService in the constructor:
```typescript
constructor(
  @inject('IValidationService') private validationService: IValidationService,
  @inject('IResolutionService') private resolutionService: IResolutionService,
  @inject('IFileSystemService') private fileSystemService: IFileSystemService
) {}
```

However, I don't see any actual usage of the validationService methods in the handler code.

**Test Mock Usage:**
In the test, a ValidationService mock is created using `createValidationServiceMock()`:
```typescript
validationService = createValidationServiceMock();
```

The mock factory defines:
```typescript
export function createValidationServiceMock() {
  const service = mock<IValidationService>();
  // Default behaviors
  service.validate.mockResolvedValue(undefined);
  return service;
}
```

And the test uses:
```typescript
validationService.validate.mockRejectedValue(validationError);
```

**Discrepancy:**
- The IValidationService interface doesn't have a `validate` method, but the mock factory and tests assume it exists.
- The handler injects IValidationService but doesn't actually use any of its methods.

### 4.2. IResolutionService

**Interface Definition:**
- `resolveText(text: string, context: ResolutionContext): Promise<string>`
- `resolveData(node: VariableReferenceNode, context: ResolutionContext): Promise<JsonValue>`
- `resolvePath(pathString: string, context: ResolutionContext): Promise<MeldPath>`
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

**Handler Usage:**
The handler uses:
- `resolveNodes` - Used multiple times to resolve command strings and script content
- `resolveInContext` - Used to resolve parameters for runCodeParams and command arguments

**Test Mock Usage:**
The test creates a manual mock for IResolutionService:
```typescript
resolutionServiceMock = {
  resolveNodes: vi.fn().mockImplementation(async (nodes, ctx) => nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join('')),
  resolveInContext: vi.fn().mockImplementation(async (value, ctx) => {
      if (typeof value === 'object' && value?.type === 'VariableReference') {
          if (value.identifier === 'missingVar') throw new MeldResolutionError('Variable not found by mock', { code: 'VAR_NOT_FOUND' });
          return `resolved-var:${value.identifier}`;
      }
      return typeof value === 'string' ? value : JSON.stringify(value)
  }),
  resolveText: vi.fn().mockResolvedValue(''),
  resolveData: vi.fn().mockResolvedValue({}),
  resolvePath: vi.fn().mockResolvedValue({} as MeldPath),
  resolveCommand: vi.fn().mockResolvedValue(null),
  extractSection: vi.fn().mockResolvedValue(''),
  validateResolution: vi.fn().mockResolvedValue(undefined),
  resolveFieldAccess: vi.fn().mockImplementation(async (base, path, ctx) => success(base)), 
  getResolutionTracker: vi.fn().mockReturnValue(undefined), 
  resolveFile: vi.fn().mockResolvedValue(''), 
  resolveContent: vi.fn().mockResolvedValue(''), 
  detectCircularReferences: vi.fn().mockResolvedValue(undefined), 
  convertToFormattedString: vi.fn().mockResolvedValue(''), 
  enableResolutionTracking: vi.fn(), 
};
```

**Discrepancy:**
- The interface defines `validateResolution` as taking `(pathInput: string, validationContext: PathValidationContext): Promise<MeldPath>`, but the handler doesn't use this method at all.
- The interface also has a duplicate/overloaded `validateResolution` that takes `(value: string | MeldNode | InterpolatableValue, context: ResolutionContext): Promise<void>`, which is confusing.
- The test mock for `resolveFieldAccess` returns a simple success result, but the actual method might be more complex.

### 4.3. IFileSystemService

**Interface Definition:**
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

**Handler Usage:**
The handler uses:
- `executeCommand` - Used to execute shell commands
- `writeFile` - Used to write temporary script files for `runCode` and `runCodeParams`
- `deleteFile` - Used to clean up temporary script files
- `getCwd` - Used to get the current working directory as a fallback for execution context

**Test Mock Usage:**
The test creates a manual mock for IFileSystemService:
```typescript
fileSystemServiceMock = {
  getCwd: vi.fn().mockReturnValue('/workspace'),
  executeCommand: vi.fn().mockResolvedValue({ stdout: 'default stdout', stderr: '' }),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''), 
  exists: vi.fn().mockResolvedValue(true),
  mkdir: vi.fn().mockResolvedValue(undefined),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  setFileSystem: vi.fn(),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false } as Stats),
  isFile: vi.fn().mockResolvedValue(true),
  readDir: vi.fn().mockResolvedValue([]),
  isDirectory: vi.fn().mockResolvedValue(false),
  watch: vi.fn().mockImplementation(async function*() { yield { eventType: '', filename: ''} }),
  dirname: vi.fn().mockReturnValue('.'),
  getFileSystem: vi.fn().mockReturnValue({} as IFileSystem),
  fileExists: vi.fn().mockResolvedValue(true),
  resolvePath: vi.fn().mockImplementation(async (p) => p as string),
};
```

**Discrepancy:**
- The mock includes `fileExists` and `resolvePath` methods, which are not part of the IFileSystemService interface.

### 4.4. IStateService

The handler doesn't directly inject IStateService, but it uses it through the context passed to the `execute` method.

**Handler Usage:**
The handler uses:
- `getCurrentFilePath` - To get the current file path for error context
- `setTextVar` - To store command output
- `getCommandVar` - To retrieve command definitions
- `isTransformationEnabled` - To check if transformation is enabled

**Test Mock Usage:**
The test uses `createStateServiceMock()` which creates a comprehensive mock for IStateService.

**Discrepancy:**
- No significant discrepancies noted for IStateService.

### 4.5. IDirectiveHandler

The RunDirectiveHandler implements IDirectiveHandler, but the interface definition is not fully provided in the audit bundle. From the handler code, we can infer that it includes at least:
- `kind: string` property
- `execute(context: DirectiveProcessingContext): Promise<DirectiveResult>` method

**Discrepancy:**
- Without the full interface definition, it's hard to determine if there are discrepancies.

## Summary of Discrepancies

### Interface Mismatches:
1. **IValidationService:**
   - The interface doesn't have a `validate` method, but the mock factory and tests assume it exists.
   - The handler injects IValidationService but doesn't actually use any of its methods.

2. **IResolutionService:**
   - The interface defines `validateResolution` with two different signatures, which is confusing.
   - The handler doesn't use all methods defined in the interface, particularly `validateResolution`.

3. **IFileSystemService:**
   - No significant interface mismatches noted.

### Mock Mismatches:
1. **IValidationService Mock:**
   - The mock includes a `validate` method that doesn't exist in the interface.

2. **IFileSystemService Mock:**
   - The mock includes `fileExists` and `resolvePath` methods, which are not part of the interface.

### Test Setup Issues:
1. The test manually creates mocks for IResolutionService and IFileSystemService instead of using the provided factory functions, which could lead to inconsistencies.

2. The test setup for validationService includes a `validate` method that's not in the interface but is used in a test:
   ```typescript
   validationService.validate.mockRejectedValue(validationError);
   ```
</thinking>

# RunDirectiveHandler Interface Usage and Mocks Audit

## Overview
This audit compares the interface definitions, handler implementation, and test mocks for the `RunDirectiveHandler` to identify discrepancies and potential issues.

## Interface Definition Analysis

### Services Used by RunDirectiveHandler
The handler injects and uses three primary services:
1. `IValidationService`
2. `IResolutionService` 
3. `IFileSystemService`

It also interacts with `IStateService` through the context parameter in the execute method.

## Discrepancies Found

### 1. Interface Mismatches

#### IValidationService
- **Missing Method**: The handler injects `IValidationService` but doesn't use any of its methods in the implementation
- **Unused Interface**: The validation service appears to be completely unused in the handler implementation

#### IResolutionService
- **Method Signature Inconsistency**: The interface defines two versions of `validateResolution` with different signatures:
  - `validateResolution(pathInput: string, validationContext: PathValidationContext): Promise<MeldPath>`
  - `validateResolution(value: string | MeldNode | InterpolatableValue, context: ResolutionContext): Promise<void>`
- **Unused Methods**: The handler only uses a subset of the interface methods (`resolveNodes` and `resolveInContext`)

#### IFileSystemService
- **Type Mismatch**: The handler calls `writeFile` and `deleteFile` with string paths, but the interface defines `writeFile` to accept `ValidatedResourcePath` type
- **Parameter Usage**: The handler uses `deleteFile(tempFilePath)` with a string path, while the interface defines it as `deleteFile(filePath: string)`

### 2. Mock Mismatches

#### IValidationService Mock
- **Extra Method**: The mock factory implements `validate()` which doesn't exist in the interface:
  ```typescript
  service.validate.mockResolvedValue(undefined);
  ```
- **Test Dependency**: Tests rely on this non-existent method:
  ```typescript
  validationService.validate.mockRejectedValue(validationError);
  ```

#### IFileSystemService Mock
- **Extra Methods**: The mock includes methods not in the interface:
  ```typescript
  fileExists: vi.fn().mockResolvedValue(true),
  resolvePath: vi.fn().mockImplementation(async (p) => p as string),
  ```

#### IResolutionService Mock
- **Implementation Mismatch**: The test creates a custom mock instead of using the factory function `createResolutionServiceMock()`, potentially leading to inconsistencies

### 3. Test Setup Issues

#### Validation Testing
- **Invalid Assertion**: Tests expect validation errors but use a mock method that doesn't exist in the interface
- **Mock Initialization**: The test manually creates service mocks instead of consistently using the provided factory functions

#### Path Type Handling
- **Type Safety Issue**: The test doesn't properly validate that paths are handled with the correct types (string vs ValidatedResourcePath)

## Recommendations

1. **Remove Unused Service**: If `IValidationService` is not used, consider removing it from the handler dependencies
2. **Standardize Mock Creation**: Use the provided mock factories consistently in tests
3. **Fix Interface Definitions**: Resolve the duplicate `validateResolution` method in `IResolutionService`
4. **Path Type Consistency**: Ensure handler implementation properly handles path types according to interface definitions
5. **Clean Up Mock Implementations**: Remove extra methods from mocks that don't exist in the interfaces

This audit reveals several inconsistencies between interface definitions, handler implementation, and test mocks that could lead to maintenance issues or runtime errors if not addressed.