# TSyringe DI Cleanup Progress

## Updated Service Tests
The following services have been successfully updated to use the TestContextDI.createIsolated() approach:

### Core Services
- ✅ FileSystemService
- ✅ PathService
- ✅ StateService
- ✅ StateFactory
- ✅ ResolutionService
- ✅ InterpreterService
- ✅ ParserService
- ✅ DirectiveService (All tests now passing)

### Directive Handlers
- ✅ TextDirectiveHandler
- ✅ EmbedDirectiveHandler
- ✅ ImportDirectiveHandler
- ✅ RunDirectiveHandler
- ✅ DataDirectiveHandler
- ✅ DefineDirectiveHandler
- ✅ PathDirectiveHandler

### Migration Pattern
For each service, we implemented the following changes:

1. **Context Initialization**:
   - Changed `TestContextDI.create()` to `TestContextDI.createIsolated()`
   - Added proper `await` for async initialization: `await context.initialize()`

2. **Dependency Registration**:
   - Used `context.registerMock('InterfaceName', implementationInstance)` instead of `container.registerInstance()`
   - For class tokens: `context.registerMock(ClassToken, implementationInstance)`

3. **Service Resolution**:
   - Changed from ad-hoc creation to container resolution: `service = context.container.resolve(ServiceClass)`
   - Removed direct instances in favor of container resolution

4. **Circular Dependency Handling**:
   - Connected services through service mediator
   - Used proper factory patterns where needed

5. **Test Expectations**:
   - Updated test expectations to match actual implementation
   - Fixed assertions to align with the DI container behavior

## Lessons Learned
- The `TestContextDI.createIsolated()` approach provides better isolation between tests
- Async initialization requires proper use of `await` throughout the test setup
- The container should be used consistently for both registration and resolution of services
- Tests should verify both the correct functioning of services and their proper integration with the DI container
- Complex services like DirectiveService require specialized helper functions for proper initialization
- Directive handlers need careful initialization and validation service integration
- Variable interpolation should use the centralized syntax from core/syntax ({{variable}}) instead of template literals (${variable})
- Proper dependency initialization sequence is critical, especially for services with multiple handlers
- For logging-related functionality, focus tests on behavior, not logging messages

## Next Steps
- Create more robust helper functions for additional services
- Standardize the test patterns across all service tests
- Implement consistent mocking strategies using vitest-mock-extended
- Create helper functions to simplify the test setup process 