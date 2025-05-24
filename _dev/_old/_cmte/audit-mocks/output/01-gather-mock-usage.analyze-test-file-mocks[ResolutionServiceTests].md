# Analysis of Mock Usage in ResolutionService Tests

## TestContextDI Usage
- Creates an isolated test context with `TestContextDI.createIsolated()` to avoid affecting other tests
- Uses `testContext.resolve(ResolutionService)` to retrieve the service under test
- Properly handles async cleanup with `await testContext.cleanup()` in `afterEach`
- Initializes the context after mocks are registered with `await testContext.initialize()`

## Mock Creation
- Creates extensive manual mock objects for core services:
  - `stateService` (IStateService)
  - `fileSystemService` (IFileSystemService)
  - `parserService` (IParserService)
  - `pathService` (IPathService)
- Creates factory mocks for handling circular dependencies:
  - `mockParserClientFactory`
  - `mockVariableResolverClientFactory`
  - `mockDirectiveClientFactory`
  - `mockFileSystemClientFactory`
- Uses helper functions to create typed mock variables:
  - `createMockTextVariable`
  - `createMockDataVariable`
  - `createMockPathVariable`
  - `createMockCommandVariable`
- Creates mock AST factories:
  - `mockTextNodeFactory`
  - `mockVariableNodeFactory`

## Mock Registration
- Uses `testContext.registerMock('IStateService', stateService)` to register service mocks
- Registers mock factories with the container:
  - `testContext.registerMock('ParserServiceClientFactory', mockParserClientFactory)`
- Registers mock AST factories:
  - `testContext.registerMock('TextNodeFactory', mockTextNodeFactory)`
  - `testContext.registerMock('VariableNodeFactory', mockVariableNodeFactory)`
- Mocks external logger with `vi.mock('@core/utils/logger', ...)`

## Spy Usage (vi.fn/vi.mocked)
- Uses `vi.fn()` for mocking individual methods:
  - `getTextVar: vi.fn().mockImplementation(...)`
  - `readFile: vi.fn().mockResolvedValue('file content')`
- Uses `vi.mocked()` to ensure type safety when accessing mock functions:
  - `vi.mocked(fileSystemService.executeCommand).mockResolvedValue(...)`
  - `vi.mocked(mockParserClient.parseString).mockResolvedValue([textNode])`
- Properly implements complex mocks with conditional return values:
  ```javascript
  stateService.getTextVar = vi.fn().mockImplementation((name: string): TextVariable | undefined => {
    if (name === 'greeting') return createMockTextVariable('greeting', 'Hello World');
    // ...
    return undefined;
  })
  ```

## Complexities/Issues
- Extremely large and complex test setup with many manual mocks
- Complex mock implementations for resolving variables, paths, and commands
- Frequent use of type assertions (`as unknown as IStateService`) to satisfy TypeScript
- Several commented-out tests that may need to be re-enabled
- Some tests have debugging console.log statements that should be removed
- Several "Fix:" comments indicating previous issues that were addressed
- Mocks for circular dependencies using client factories add complexity
- Multiple levels of mocking (service → client factory → client) make tests harder to follow

## Skipped Tests
- One commented-out test for circular references detection:
  ```javascript
  // it('should detect circular references', async () => {
  //   // beforeEach mocks stateService and parserClient for var1 -> var2 -> var1
  //   await expectToThrowWithConfig(async () => {
  //      await service.resolveText('{{var1}}', defaultContext);
  //   }, {
  //     type: 'MeldResolutionError', // Or more specific CircularReferenceError if defined
  //     messageContains: 'Circular reference detected: var1 -> var2'
  //   });
  // });
  ```
  - Likely commented out due to changes in circular reference detection implementation

## Recommendations for Improvement
- Consider using `TestContextDI.createTestHelpers()` to simplify test setup
- Replace large manual mocks with more focused mock implementations specific to each test
- Extract common mock setup to shared helper functions
- Remove debugging console.log statements
- Re-enable or remove commented-out tests
- Consider using factory functions to create test fixtures instead of large inline mocks