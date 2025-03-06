# Test Pattern Analysis

@import[../partials/header.md]

## PREVIOUS FINDINGS

@import[../3-answer.md]
@import[../5-answer.md]

## CODE TO ANALYZE

=== TESTS OUTPUT ===

@cmd[npm test]

==== FAILING TESTS ===

@cmd[cpai ../../../tests/api/api.test.ts ../../../tests/services/OutputService/OutputService.test.ts --stdout]

=== PASSING TESTS WITH SIMILAR PATTERNS ===

@cmd[cpai ../../../tests/services/StateService/StateService.test.ts --stdout]

## YOUR TASK

Create a detailed analysis of test patterns, focusing on clone() and transformation:

1. For each failing test, analyze the pattern:
   ```typescript
   {
     testFile: string;
     testName: string;
     pattern: {
       setupSteps: string[];
       stateManagement: {
         usesClone: boolean;
         usesChildState: boolean;
         transformationEnabled: boolean;
       };
       mockUsage: {
         mockType: string;
         methodsCalled: string[];
       };
       failureType: string;
       errorMessage: string;
     };
     similarPassingTests: string[];  // Names of similar tests that pass
     keyDifferences: string[];      // What's different in passing tests
   }
   ```

2. Group the failures by pattern:
   - Tests failing due to missing clone()
   - Tests failing due to transformation state
   - Tests failing due to mock implementation
   - Tests failing due to state inheritance

BE SPECIFIC about the differences between failing and passing tests.
INCLUDE line numbers for all findings.
FOCUS on patterns that could indicate systematic issues.

@import[../partials/quality-requirements.md] 