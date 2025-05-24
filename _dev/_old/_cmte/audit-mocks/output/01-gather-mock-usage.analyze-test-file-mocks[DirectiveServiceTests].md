# Analysis of Mock Usage in DirectiveService Tests

## TestContextDI Usage
- Uses `TestContextDI.createIsolated()` to create a clean, isolated DI container for tests
- Calls `await context.initialize()` explicitly to ensure services are ready
- Uses `context.resolveSync<T>()` to get service instances from the container
- Properly cleans up with `await context?.cleanup()` in `afterEach`

## Mock Creation
- Creates mock handlers (`mockTextHandler`, `mockDataHandler`, `mockImportHandler`) as manual objects with `vi.fn()` implementations
- Uses `context.resolveSync()` to obtain services that are automatically mocked by TestContextDI (IStateService, IResolutionService)
- Creates a custom state storage object (`stateStorage`) for tracking variable state in tests
- Creates a simple mock `FormattingContext` object directly

## Mock Registration
- Registers mock handlers directly on the service instance with `service.registerHandler(mockHandler)`
- Doesn't need to explicitly register other mocks as they're automatically provided by TestContextDI
- Mocks for core services (ValidationService, PathService, etc.) are automatically registered by TestContextDI

## Spy Usage (vi.spyOn)
- Spies on `mockState.setTextVar` with implementation to track variables in `stateStorage`
- Spies on `mockState.setDataVar` with implementation to track variables in `stateStorage`
- Spies on `mockState.getTextVar` and `mockState.getDataVar` to retrieve from `stateStorage`
- Spies on `mockState.clone` and `mockState.createChildState` to return the mock itself
- Spies on `mockState.getCurrentFilePath` to return a fixed path
- Spies on `mockResolutionService.resolveInContext` with a custom implementation that handles different data types

## Complexities/Issues
- Manual creation of `DirectiveProcessingContext` objects for each test case is verbose and repetitive
- Uses type assertion with `as any` in several places to bypass type checking
- Direct manipulation of internal service properties (`(service as any).handlers.delete('text')`)
- No clear separation between unit and integration testing approaches
- No clear pattern for mock creation - mix of manual mocks and TestContextDI-provided mocks

## Skipped Tests
- `should process text directive with variable interpolation` - marked with `it.skip()`
- `should process data directive with variable interpolation` - marked with `it.skip()`
- `should process basic import` - marked with `it.skip()`
- `should handle nested imports` - marked with `it.skip()`

These appear to be skipped due to complexity of implementing variable interpolation and import handling in the test environment, which would require more sophisticated mocking of the resolution and file system services.

## Recommendations for Improvement
- Create helper functions for common test setup patterns (e.g., creating processing contexts)
- Use TestContextDI's mock registration more consistently instead of direct spying
- Consider implementing the skipped tests with proper mocking of dependencies
- Use factory methods for creating test objects to reduce duplication
- Create a reusable pattern for testing directive handlers that could be shared across handler tests