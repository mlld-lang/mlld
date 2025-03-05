# Failing Tests Analysis

@import[partials/header.md]
@import[partials/code-analysis-instructions.md]

## CODE TO ANALYZE

=== API TEST FAILURES ===

@cmd[cpai ../../tests/api/api.test.ts --stdout]

=== OUTPUT SERVICE TEST FAILURES ===

@cmd[cpai ../../tests/services/OutputService/OutputService.test.ts --stdout]

=== RELEVANT IMPLEMENTATION CODE ===

@cmd[cpai ../../services/StateService/StateService.ts ../../services/OutputService/OutputService.ts ../../services/DirectiveService/DirectiveService.ts --stdout]

=== TEST EXECUTION OUTPUT ===

@cmd[npm test tests/api/api.test.ts tests/services/OutputService/OutputService.test.ts ; echo "Test execution complete"]

## YOUR TASK

Perform a thorough analysis of the failing tests:

1. Map API Test Failures:
   - Document exact error messages
   - Trace the execution path to failure
   - Note any mock service usage
   - Check state management flow

2. Analyze OutputService Failures:
   - List all failing transformation tests
   - Check transformation mode setup
   - Verify directive processing
   - Note any state persistence issues

3. Compare Failing vs Passing Tests:
   - Find similar passing test cases
   - Note differences in setup/mocks
   - Check for pattern in failures
   - Map any shared assumptions

@import[partials/quality-requirements.md]

SPECIFIC REQUIREMENTS:

- Create a failure analysis matrix
- Document all error messages
- Map test setup differences
- Note any mock inconsistencies
- List state management issues
- Track transformation problems 