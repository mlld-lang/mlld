# Interface & Implementation Audit

@import[partials/header.md]
@import[partials/code-analysis-instructions.md]

## CODE TO ANALYZE

=== STATE SERVICE INTERFACE AND IMPLEMENTATION ===

@cmd[cpai ../../services/StateService/IStateService.ts ../../services/StateService/StateService.ts --stdout]

=== USAGE IN PRODUCTION CODE ===

@cmd[cpai ../../services/DirectiveService ../../services/OutputService ../../services/InterpreterService --stdout]

=== TEST USAGE ===

@cmd[cpai ../../tests/services/StateService --stdout]

## YOUR TASK

Perform a thorough audit of the StateService interface and implementation alignment:

1. Create a complete method inventory comparing IStateService.ts and StateService.ts:
   - List all methods in both files
   - Compare signatures exactly
   - Note any mismatches or inconsistencies
   - Flag methods that exist in one but not the other

2. Analyze usage patterns:
   - Find all places StateService methods are called in production code
   - Note any methods called that aren't in the interface
   - Identify any parameter type mismatches
   - List any undocumented assumptions about return types

3. Compare test usage to interface:
   - Check if tests call methods not in interface
   - Verify test assertions match interface contracts
   - Note any mock implementations that differ

@import[partials/quality-requirements.md]

SPECIFIC REQUIREMENTS:

- Create a detailed method comparison table
- Include line numbers for all findings
- Note any transformation-related methods specifically
- Flag any clone() or state management inconsistencies
- Identify any circular dependencies
- List all places where state is modified 