# Output Content Preservation Issue Investigation

## Issue Description
The SDK integration tests in `api/api.test.ts` are making oversimplified assumptions about output handling that don't align with the actual sophisticated behavior of the OutputService. This creates false negatives in our test suite and risks driving incorrect implementation changes.

## Related Code

### Code Files
- `api/api.test.ts`: Contains the oversimplified SDK integration tests
- `services/OutputService/OutputService.ts`: Sophisticated output pipeline implementation
- `services/OutputService/IOutputService.ts`: Interface defining expected behavior
- `services/OutputService/OutputService.test.ts`: Comprehensive unit tests showing intended behavior

### Test Files
Current SDK test pattern making oversimplified assumptions:
```typescript
const content = `
  Some text content
  @run [echo test]
  More text
`;
// Test makes naive assumptions:
// - Raw text preservation
// - Simple directive handling
// - Direct content matching
```

## Evidence

### Test Expectations vs. Actual Design
1. Test Assumptions:
   - Text content should be preserved exactly as-is
   - Definition directives should be omitted
   - Execution directives should show simple placeholders

2. Actual Service Design:
   - Handles multiple transformation modes
   - Format-specific processing (markdown, llm)
   - Sophisticated state management
   - Complex directive handling rules

### Current Behavior
The test fails because it expects oversimplified behavior that doesn't match the service's actual sophisticated implementation:
- Test expects: Raw text + simple placeholders
- Service provides: Format-specific output based on transformation mode and state

### Code Analysis

#### Test Structure Issues
1. Doesn't consider transformation modes
2. Ignores format-specific requirements
3. Makes assumptions about implementation details
4. Lacks proper test setup for different modes

#### Related Tests
Other tests showing similar pattern:
1. "should handle the complete parse -> interpret -> convert pipeline"
2. "should preserve state and content in transformation mode"

These tests also make oversimplified assumptions about the output pipeline.

### Debug Output
```
AssertionError: expected '' to contain 'Some text content'
```
This error occurs because the test isn't properly configured for the service's actual behavior modes.

#### Visualization
Current test approach vs. actual service pipeline:
1. Test expects: Content -> Simple Output
2. Actual flow: Content -> Parser -> AST -> Interpreter -> Format-Specific Processing -> Final Output

#### Implementation Analysis
The OutputService has sophisticated behavior that the SDK tests aren't properly testing:
- Transformation mode handling
- Format-specific processing
- State management
- Directive handling rules

## Impact on Test Reliability

This misalignment causes:
1. False negatives - tests fail despite correct implementation
2. Maintenance burden - fixing "failing" tests risks breaking actual functionality
3. Documentation gaps - simplified tests don't reflect actual behavior

## Recommendations

1. SDK Integration Tests Should:
   - Consider transformation modes
   - Account for format-specific behavior
   - Match documented interface behavior
   - Test actual use cases rather than implementation details

2. Documentation Updates:
   - Clearly document transformation modes
   - Explain format-specific requirements
   - Provide SDK usage examples that reflect actual behavior

3. Test Structure:
   - Move implementation details to unit tests
   - Keep integration tests focused on real-world usage
   - Add test cases for different modes and formats
   - Document expected behavior in test descriptions

## Next Steps

1. Review and update SDK integration tests to properly handle:
   - Transformation modes
   - Format-specific behavior
   - State management
   - Directive processing

2. Add test coverage for:
   - Different transformation modes
   - Format-specific output
   - Real-world usage patterns

3. Update documentation:
   - Add SDK usage examples
   - Document transformation modes
   - Explain output formatting rules

4. Add logging to help debug mode/state issues in tests 