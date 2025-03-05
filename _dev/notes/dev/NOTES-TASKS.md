# Consolidated Task List

This document maps specific issues from NOTES.md to the phases defined in SHIP.md to ensure all identified problems are accounted for in our planning.

## Phase 1.2: AST Integration and Service Architecture

### Validation and Testing Issues
- Update ValidationService tests to align with new error messaging expectations
- Fix tests expecting specific error messages that don't match current implementation
- Implement consistent error messaging across validators
- Use error testing utilities to make tests more resilient to message changes

### Code Fence Handling
- Remove custom code fence validation regex in favor of AST properties
- Fix parse errors for nested code fences
- Fix code fence test fixtures

## Phase 2: Variable Resolution System

### TextVar and DataVar Resolution
- Fix TextVar and DataVar resolution (currently returning raw syntax instead of values)
- Implement proper variable interpolation within text strings
- Fix data variable field access resolution
- Replace regex variable extraction with parser-based resolution

### Command Resolution
- Update CommandResolver to use standardized resolution system
- Fix parameter handling issues (expects 0 parameters but got x)
- Fix incorrect error messages for parameter count mismatches

## Phase 3: Directive Validation and Handling

### TextDirectiveHandler
- Update to resolve variables in values correctly (Hello {{name}}! → Hello World!)

### DataDirectiveHandler
- Fix object field access resolution

### DefineDirectiveHandler
- Fix command definition parsing
- Fix "Cannot read properties of undefined (reading 'split')" error

### ImportDirectiveHandler
- Fix path validation and processing issues

### EmbedDirectiveHandler
- Fix section extraction
- Fix output formatting issues (output includes [directive output placeholder] prefix)

## Phase 4: API Completion and Integration

### Import Handling
- Fix "should handle simple imports" test (syntax validation error)
- Fix "should handle nested imports with proper scope inheritance" test
- Fix "should detect circular imports" test (error message mismatch)
- Implement circular import detection that checks for circularity before path validation

### Command Execution
- ✅ Fix "Command not supported in test environment" errors (Implemented MockCommandExecutor)
- Fix output formatting issues (extra quotes in output)
- Fix parameter handling with proper environment context

### Complex Multi-file Projects
- Fix tests for complex multi-file projects with imports and shared variables
- Address path-related errors in integration tests

### Format Transformation
- Fix output format not matching expected patterns (for MD and XML)

### State Management
- Fix problems with debug capture access
- Fix file not found errors

## Implementation Notes

### Command Execution Mocking (✅ Completed)

Implemented a robust command execution mocking system to support testing of components that execute system commands, particularly the RunDirectiveHandler.

**Key Components Created:**

1. **MockCommandExecutor**: Core class that simulates command execution
   - Supports exact command matching
   - Supports pattern matching with RegExp
   - Supports capture group substitution
   - Configurable default responses

2. **CommandMockableFileSystem**: Implementation of IFileSystem with command mocking
   - Built on memfs for in-memory file operations
   - Integrates with MockCommandExecutor for command execution

3. **commandMockingHelper**: Utility for easy setup in tests
   - Simple API for configuring mock responses
   - Can inject mocks into existing services
   - Provides cleanup functionality

4. **Documentation and Examples**:
   - Created COMMAND_MOCKING.md with detailed usage instructions
   - Created example tests showing real-world usage patterns
   - Added tests for the mocking system itself

**Example Usage:**

```typescript
// Set up mocking
const { mockCommand, fs } = setupCommandMocking({
  fileSystemService // Optional service to inject the mock into
});

// Configure mock responses
mockCommand('git status', {
  stdout: 'On branch main\nNothing to commit',
  stderr: '',
  exitCode: 0
});

// Test component that executes commands
const result = await runDirectiveHandler.execute(node, context);

// Verify results based on mocked command output
expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'On branch main\nNothing to commit');
```

## By Completion Phase

### Phase 1.2
- ValidationService test fixes
- Code fence handling 
- Error message consistency

### Phase 2
- TextVar and DataVar resolution
- Variable interpolation
- Command parameter resolution

### Phase 3
- All directive handler fixes
- Import path validation
- Embed section extraction
- Command definition parsing

### Phase 4
- Import circular detection
- ✅ Command execution in test environment (MockCommandExecutor)
- Multi-file project integration
- Format transformation
- Debug state management 