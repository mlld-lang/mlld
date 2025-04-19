# Test Audit Results

## Summary

Total test files examined: 92
Files with mocks: 88

### Overall Status

- 🟢 Compliant: 4
- 🟡 Minor Issues: 1
- 🟠 Major Issues: 3
- 🔴 Critical Failures: 84

### Mock Files Status

- 🟢 Compliant: 0
- 🟡 Minor Issues: 1
- 🟠 Major Issues: 3
- 🔴 Critical Failures: 84

### Service Area Analysis

| Service Area | Total Files | Files With Mocks | Files With Issues |
|--------------|-------------|------------------|-------------------|
| Other | 47 | 45 | 45 |
| CLI | 2 | 2 | 2 |
| FileSystemService | 3 | 3 | 3 |
| DirectiveService | 14 | 14 | 14 |
| InterpreterService | 2 | 2 | 2 |
| ParserService | 1 | 1 | 1 |
| ResolutionService | 9 | 9 | 9 |
| ValidationService | 2 | 1 | 1 |
| SourceMapService | 1 | 1 | 1 |
| StateService | 4 | 4 | 4 |
| Tests | 7 | 6 | 6 |

## Priority Files

### api/integration.test.ts

**Category**: 🔴
**Service Area**: Other
**Uses Mocks**: Yes

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

### services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts

**Category**: 🔴
**Service Area**: DirectiveService
**Uses Mocks**: Yes

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

### services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts

**Category**: 🔴
**Service Area**: DirectiveService
**Uses Mocks**: Yes

**Issues**:
- Missing: Uses async resolution
- Missing: Uses expectToThrowWithConfig
- May need factory pattern implementation

**Required Changes**:
- Add Uses async resolution
- Add Uses expectToThrowWithConfig
- Verify and implement proper factory mocking

### services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts

**Category**: 🔴
**Service Area**: DirectiveService
**Uses Mocks**: Yes

**Issues**:
- Missing: Uses async resolution
- Missing: Uses expectToThrowWithConfig
- May need factory pattern implementation

**Required Changes**:
- Add Uses async resolution
- Add Uses expectToThrowWithConfig
- Verify and implement proper factory mocking

### services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.integration.test.ts

**Category**: 🔴
**Service Area**: DirectiveService
**Uses Mocks**: Yes

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

### services/pipeline/InterpreterService/InterpreterService.integration.test.ts

**Category**: 🔴
**Service Area**: InterpreterService
**Uses Mocks**: Yes

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

### services/pipeline/InterpreterService/InterpreterService.unit.test.ts

**Category**: 🔴
**Service Area**: InterpreterService
**Uses Mocks**: Yes

**Issues**:
- Missing: Uses async resolution
- Missing: Uses expectToThrowWithConfig
- May need factory pattern implementation

**Required Changes**:
- Add Uses async resolution
- Add Uses expectToThrowWithConfig
- Verify and implement proper factory mocking

### tests/sourcemap/sourcemap-integration.test.ts

**Category**: 🔴
**Service Area**: Other
**Uses Mocks**: Yes

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

## Other Tests

### 🔴 Category

#### api/api.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### api/array-access.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### api/nested-array.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### api/resolution-debug.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### cli/cli.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### cli/commands/debug-context.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### cli/commands/debug-transform.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### cli/commands/init.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### core/ServiceProvider.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/fs/PathService/PathService.tmp.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/fs/ProjectPathResolver.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/pipeline/OutputService/OutputService.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/resolution/CircularityService/CircularityService.test.ts

**Issues**:
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/state/StateEventService/StateEventService.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/state/StateEventService/StateInstrumentation.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/state/utilities/StateVariableCopier.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/codefence-duplication-fix.test.ts

**Issues**:
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/comment-handling-fix.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/debug/import-debug.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/embed-directive-fixes.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/embed-directive-transformation-fixes.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/embed-line-number-fix.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/embed-transformation-e2e.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/embed-transformation-variable-fix.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/output-filename-handling.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/output-service-embed-transformation.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/pipeline/pipelineValidation.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/samples/di-sample.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/specific-nested-array.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/specific-variable-resolution.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/transformation-debug.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/debug/StateDebuggerService/StateDebuggerService.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/debug/StateHistoryService/StateHistoryService.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/debug/StateTrackingService/StateTrackingService.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/debug/StateVisualizationService/StateVisualizationService.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/debug/StateVisualizationService/TestVisualizationManager.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/debug/TestOutputFilterService/TestOutputFilterService.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/examples/RunDirectiveCommandMock.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/fs/MockCommandExecutor.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/variable-index-debug.test.ts

**Issues**:
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/xml-output-format.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

### 🟠 Category

#### services/fs/PathService/PathService.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses async resolution
- Add Uses expectToThrowWithConfig

## CLI Tests

### 🔴 Category

#### services/cli/CLIService/CLIService.test.ts

**Issues**:
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/cli/cli-error-handling.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

## FileSystemService Tests

### 🔴 Category

#### services/fs/FileSystemService/NodeFileSystem.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/fs/FileSystemService/PathOperationsService.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

### 🟡 Category

#### services/fs/FileSystemService/FileSystemService.test.ts

**Issues**:
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses expectToThrowWithConfig

## DirectiveService Tests

### 🔴 Category

#### services/pipeline/DirectiveService/DirectiveService.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.command.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

#### services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig
- May need factory pattern for client factory

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig
- Implement proper factory client mocking

## ParserService Tests

### 🔴 Category

#### services/pipeline/ParserService/ParserService.test.ts

**Issues**:
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

## ResolutionService Tests

### 🔴 Category

#### services/resolution/ResolutionService/resolvers/CommandResolver.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/resolution/ResolutionService/resolvers/ContentResolver.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/resolution/ResolutionService/resolvers/DataResolver.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/resolution/ResolutionService/resolvers/PathResolver.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/resolution/ResolutionService/resolvers/TextResolver.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

### 🟠 Category

#### services/resolution/ResolutionService/ResolutionService.test.ts

**Issues**:
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses expectToThrowWithConfig

## ValidationService Tests

### 🔴 Category

#### services/resolution/ValidationService/ValidationService.test.ts

**Issues**:
- Missing: Uses async resolution
- Missing: Uses factory patterns

**Required Changes**:
- Add Uses async resolution
- Add Uses factory patterns

## SourceMapService Tests

### 🔴 Category

#### services/sourcemap/SourceMapService.test.ts

**Issues**:
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

## StateService Tests

### 🔴 Category

#### services/state/StateService/StateFactory.test.ts

**Issues**:
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/state/StateService/StateService.transformation.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### services/state/StateService/migration.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

### 🟠 Category

#### services/state/StateService/StateService.test.ts

**Issues**:
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses expectToThrowWithConfig

## Tests Tests

### 🔴 Category

#### tests/utils/tests/FixtureManager.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/tests/MemfsTestFileSystem.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/tests/ProjectBuilder.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/tests/TestContext.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/tests/TestSnapshot.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

#### tests/utils/tests/memory-file-system.test.ts

**Issues**:
- Missing: Uses TestContextDI.createIsolated()
- Missing: Properly cleans up resources
- Missing: Uses async resolution
- Missing: Uses context.registerMock()
- Missing: Uses factory patterns
- Missing: Uses expectToThrowWithConfig

**Required Changes**:
- Add Uses TestContextDI.createIsolated()
- Add Properly cleans up resources
- Add Uses async resolution
- Add Uses context.registerMock()
- Add Uses factory patterns
- Add Uses expectToThrowWithConfig

