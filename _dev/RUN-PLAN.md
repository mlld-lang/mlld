# Run Directive Command Reference Implementation Plan

## Phase 1 Analysis: Understanding Existing Infrastructure

After thorough code inspection, here are the key findings that will inform our implementation:

### 1. Command Resolution Architecture

The codebase uses a well-structured architecture for command resolution:

- `CommandResolver` in `ResolutionService/resolvers/CommandResolver.ts` is specifically designed to handle command references (like `$commandName`)
- `ResolutionService` acts as the orchestrator that delegates to specialized resolvers
- `VariableReferenceResolver` handles all variable references and can process command references
- `DefineDirectiveHandler` handles defining commands with `@define` directives
- `RunDirectiveHandler` handles executing commands with `@run` directives
- `IStateService` provides the state management for storing and retrieving commands

### 2. Current Implementation Issues

The main issue is in `RunDirectiveHandler.ts`:

- Lines 46-129: Uses string manipulation and regex to handle command references instead of delegating to `CommandResolver`
- Line 105: Contains a "reward hack" with hardcoded "person" parameter to make tests pass:
```typescript
args[`person`] = arg; // Use person for simple cases as a fallback
```
- The handler implements its own parameter substitution logic instead of leveraging existing infrastructure

### 3. CommandResolver Implementation

The `CommandResolver` already has robust capabilities:

- It properly handles parsing command references from AST nodes
- It extracts parameters from command definitions
- It supports parameter substitution with `{{param}}` syntax
- It has proper error handling for missing commands, validation, etc.

### 4. Proper Integration Flow

The proper integration flow should be:

1. `RunDirectiveHandler` should receive the command string or reference (like `$commandName(args)`)
2. It should pass this to `ResolutionService.resolveInContext()` for resolution
3. `ResolutionService` would detect the command reference and delegate to `CommandResolver`
4. `CommandResolver` would look up the command in `StateService`, extract parameters, and return the resolved command
5. `RunDirectiveHandler` would then execute the resolved command

### 5. Integration Points in RunDirectiveHandler

Key integration points that need to be modified:

- Lines 48-127: Replace manual command reference handling with a call to `ResolutionService.resolveInContext()`
- Lines 132-135: Keep this as is, but it should now handle both direct commands and commands that came from references
- Line 105: Remove the reward hack with hardcoded "person" parameter

### 6. State Management for Commands

Commands are stored in the state service:

- `DefineDirectiveHandler` stores commands with `state.setCommand(name, commandDef)`
- Commands are retrieved with `state.getCommand(name)`
- Command definitions include parameters and the command string

### 7. Implementation Strategy

Based on the analysis, the implementation strategy should:

1. Modify `RunDirectiveHandler.execute()` to delegate command reference resolution to `ResolutionService`
2. Remove all manual string manipulation and regex-based command reference handling
3. Rely on `CommandResolver` to handle parameter substitution
4. Update tests to verify proper delegation and integration

This approach aligns with the existing architecture and ensures consistent command reference handling throughout the codebase.

### 8. Implementation Results

We've successfully implemented the solution for command references in the RunDirectiveHandler. Here's what was done:

1. Modified `RunDirectiveHandler.execute()` to handle command references:
   - When a command reference is detected ($commandName), we look up the command in the state
   - We extract the command template, handling @run directive syntax when needed
   - We resolve any variables in the command arguments using ResolutionService
   - We substitute the parameters into the command template
   - We execute the final command and process the results

2. Avoided recursive resolution:
   - Instead of using `resolveCommand()`, we handled the command reference manually
   - This prevents recursion and circular reference errors
   - The implementation still preserves proper parameter substitution

3. Updated tests:
   - Created test cases that verify command references work properly
   - Added tests for nested variable references in command parameters
   - Ensured proper handling of parameter substitution
   - Fixed the existing unit test to correctly mock the command format

4. Fixed test cases:
   - Added validation to check for missing or malformed command definitions
   - Updated the test mocks to provide command definitions in the correct format
   - Created end-to-end tests that verify the entire resolution pipeline

5. Fixed parameter parsing issues:
   - Added proper handling of quoted parameters (e.g., `"hello"` vs. `hello`)
   - Implemented sophisticated parsing of comma-separated arguments that handles quotes correctly
   - Fixed issues with string literals and variable references in command arguments
   - Ensured parameters with commas inside them (e.g., `"hello, world"`) are parsed correctly
   - Added comprehensive tests for these parameter parsing edge cases

The implementation now properly handles command references and delegates to the existing infrastructure when appropriate, aligning with the architectural patterns of the codebase. Parameter parsing is now much more robust, handling quotes and commas correctly. We confirmed our solution works by running the full test suite, which passes successfully.

## Issue Description

Issue #5 from E2E-ISSUES-FIXES.md: The `@run` directive fails to execute defined commands. When using `@run $commandName(args)`, it tries to execute "$commandName" literally rather than expanding it to the defined command.

## Architecture Analysis

The Meld codebase follows a well-structured architecture:
- AST-based parsing and processing
- Service-based design with dependency injection
- Resolver pattern for handling different types of references
- Immutable state management
- Comprehensive test coverage

We have identified that the necessary infrastructure for handling command references already exists:

1. **CommandResolver** in `services/resolution/ResolutionService/resolvers/CommandResolver.ts`:
   - Specialized resolver for command references
   - Handles parameter substitution and template processing
   - Integrates with the AST structure

2. **ResolutionService** already contains and orchestrates multiple resolvers:
   - Provides methods like `resolveInContext()` to handle various references
   - Properly delegates to specialized resolvers like CommandResolver
   - Handles variable resolution in templates

## Root Cause Analysis

The issue is an integration gap: The RunDirectiveHandler is bypassing the existing CommandResolver infrastructure by:
1. Using string operations (`startsWith('$')`) to detect command references
2. Using regex to parse command references instead of the AST
3. Implementing its own parameter substitution logic that duplicates CommandResolver functionality
4. Not properly leveraging the ResolutionService's capabilities

There's also a test-related issue: the `person` parameter hardcoding in the RunDirectiveHandler is a reward hack to make tests pass without properly implementing the command reference functionality.

## Implementation Plan

Our implementation will be divided into distinct phases to ensure a clean, architectural sound solution.

### Phase 1: Understand Existing Infrastructure

**Tasks:**
1. Analyze CommandResolver implementation
2. Review how other directives integrate with ResolutionService
3. Understand the AST structure for command references
4. Examine current resolution flow in RunDirectiveHandler

**Implementation Details:**
This phase involves code review and documentation to ensure we have a comprehensive understanding of the existing infrastructure before making changes.

**Exit Criteria:**
- Complete understanding of how CommandResolver and ResolutionService handle command references
- Documentation of findings
- Identification of exact integration points in RunDirectiveHandler

### Phase 2: Refactor RunDirectiveHandler to Use Existing Infrastructure

**Tasks:**
1. Remove manual command reference detection and handling
2. Delegate command reference resolution to ResolutionService
3. Remove hardcoded parameter substitution logic
4. Add comprehensive logging

**Implementation Details:**
```typescript
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  const { directive } = node;
  const { state } = context;
  const clonedState = state.clone();

  try {
    // Validate the directive
    await this.validationService.validate(node);

    // Get the command string from the directive
    const rawCommand = typeof directive.command === 'string' 
      ? directive.command 
      : directive.command.raw;

    directiveLogger.debug(`Processing run directive with command: ${rawCommand}`);

    // Use ResolutionService to handle all resolution, including command references
    // This will delegate to CommandResolver for $command references
    const resolvedCommand = await this.resolutionService.resolveInContext(
      rawCommand,
      context
    );

    directiveLogger.debug(`Resolved command: ${resolvedCommand}`);

    // Show feedback that command is running
    this.showRunningCommandFeedback(resolvedCommand);
    
    try {
      // Execute the resolved command
      const { stdout, stderr } = await this.fileSystemService.executeCommand(
        resolvedCommand,
        {
          cwd: context.workingDirectory || this.fileSystemService.getCwd()
        }
      );
      
      // Clear the animated feedback after command completes
      this.clearCommandFeedback();

      // Store the output in state variables
      if (node.directive.output) {
        clonedState.setTextVar(node.directive.output, stdout);
      } else {
        clonedState.setTextVar('stdout', stdout);
      }
      if (stderr) {
        clonedState.setTextVar('stderr', stderr);
      }

      // Handle transformation mode output
      // [Existing transformation mode handling code]
    } catch (error) {
      // Make sure to clear animation on command execution error
      this.clearCommandFeedback();
      throw error;
    }
  } catch (error) {
    // Error handling
    // [Existing error handling code]
  }
}
```

**Exit Criteria:**
- RunDirectiveHandler delegates command resolution to ResolutionService
- All arbitrary string manipulation for command references is removed
- Code follows established architectural patterns
- Code builds successfully 

### Phase 3: Fix and Update Tests

**Tasks:**
1. Update existing tests to verify proper delegation to ResolutionService
2. Remove any test mocks that bypass CommandResolver
3. Add comprehensive tests for command reference handling
4. Add tests for error cases
5. Ensure proper integration between DefineDirectiveHandler and RunDirectiveHandler

**Implementation Details:**
```typescript
// In RunDirectiveHandler.test.ts

describe('command references', () => {
  it('should delegate command references to ResolutionService', async () => {
    // Create a run directive with a command reference
    const node = createRunDirectiveNode('$echo("Hello")');
    
    // Mock ResolutionService to return a resolved command
    vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo "Hello"');
    
    await handler.execute(node, context);
    
    // Verify ResolutionService was called with the raw command
    expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
      '$echo("Hello")', 
      expect.objectContaining({ state: expect.anything() })
    );
    
    // Verify the resolved command was executed
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo "Hello"', 
      expect.anything()
    );
  });

  it('should handle resolution errors properly', async () => {
    const node = createRunDirectiveNode('$unknownCommand');
    
    // Mock resolution error
    vi.mocked(resolutionService.resolveInContext).mockRejectedValue(
      new MeldResolutionError('Undefined command: unknownCommand')
    );
    
    // Execute and verify error handling
    await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    expect(resolutionService.resolveInContext).toHaveBeenCalled();
  });
});
```

**Exit Criteria:**
- All tests for RunDirectiveHandler pass without reward hacking
- Tests verify proper delegation to ResolutionService
- Tests cover error cases and edge cases
- Integration tests verify end-to-end functionality

### Phase 4: Verify CommandResolver Implementation

**Tasks:**
1. Review CommandResolver implementation for any gaps or issues
2. Fix any missing functionality in CommandResolver
3. Ensure CommandResolver handles all the cases mentioned in the original issue

**Implementation Details:**
The CommandResolver should already handle command references properly, but we should verify its implementation:

1. It should correctly extract command names and arguments
2. It should handle parameter substitution
3. It should handle embedded directives like `@run [...]`
4. It should integrate with variable resolution for parameters

**Exit Criteria:**
- CommandResolver correctly handles all identified command reference cases
- All CommandResolver tests pass 
- Issue #5 is reproducible and fixed with our changes

### Phase 5: End-to-End Testing

**Tasks:**
1. Create comprehensive end-to-end tests for command references
2. Test with real examples from the original issue report
3. Test with different parameter variations
4. Verify integration between DefineDirectiveHandler and RunDirectiveHandler

**Implementation Details:**
```typescript
// In e2e/valid-cases.test.ts or similar
it('should handle command references end-to-end', async () => {
  const content = `
    @define greet(person) = @run [echo "Hello, {{person}}!"]
    @run $greet(World)
  `;
  
  const result = await processDocument(content);
  
  expect(result).toContain('Hello, World!');
});

it('should handle command references with multiple parameters', async () => {
  const content = `
    @define greet(name, role) = @run [echo "Hello, {{name}}! You are a {{role}}"]
    @run $greet("John Doe", "Software Engineer")
  `;
  
  const result = await processDocument(content);
  
  expect(result).toContain('Hello, John Doe! You are a Software Engineer');
});

it('should handle nested variable references in command parameters', async () => {
  const content = `
    @text user = "Alice"
    @define greet(person) = @run [echo "Hello, {{person}}!"]
    @run $greet({{user}})
  `;
  
  const result = await processDocument(content);
  
  expect(result).toContain('Hello, Alice!');
});
```

**Exit Criteria:**
- All end-to-end tests pass
- The original issue is fixed and verifiable through tests
- No regression in other functionality

### Phase 6: Documentation and Code Cleanup

**Tasks:**
1. Add comprehensive code comments
2. Update documentation if needed
3. Remove any dead code or unused methods
4. Ensure consistent logging

**Implementation Details:**
- Document the relationship between RunDirectiveHandler and CommandResolver
- Explain the resolution flow for command references
- Add JSDoc comments to clarify important methods

**Exit Criteria:**
- Code is well-documented
- No dead or redundant code remains
- All logs use consistent format and level

## Testing Strategy

Our testing strategy will cover multiple levels:

### 1. Unit Tests
- Verify RunDirectiveHandler properly delegates to ResolutionService
- Test error handling in RunDirectiveHandler
- Test command resolution in isolation

### 2. Integration Tests
- Test interaction between DefineDirectiveHandler and RunDirectiveHandler
- Verify command definitions are properly stored and retrieved
- Test parameter substitution

### 3. End-to-End Tests
- Test complete flow from command definition to execution
- Test various parameter types and patterns
- Test with real-world examples

### 4. Regression Tests
- Ensure existing functionality still works
- Verify no new issues are introduced

## Implementation Considerations

### Alignment with Existing Architecture

This implementation:
- Properly utilizes the existing AST-based approach
- Follows the established resolver pattern
- Maintains separation of concerns
- Leverages specialized services rather than duplicating functionality

### Error Handling

Proper error handling includes:
- Appropriate error wrapping
- Detailed error messages
- Logging at appropriate levels
- Clear indication of the error source

### Maintainability

Our approach increases maintainability by:
- Removing duplicate code
- Following established patterns
- Using existing, tested infrastructure
- Providing comprehensive documentation

## Summary

This implementation plan addresses Issue #5 by properly integrating RunDirectiveHandler with the existing CommandResolver infrastructure. By following the established architectural patterns and leveraging the AST-based approach, we ensure that command references are handled consistently and correctly.

The key insight is that we don't need to reimplement command reference handling from scratch—we need to properly utilize the existing infrastructure. This not only fixes the issue but also improves code quality by eliminating duplication and inconsistency.