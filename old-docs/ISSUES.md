# Issues


<Rules>

1. Always put the most problematic/concerning issues at the top and the 'easiest to fix' issues at the bottom.
2. Use the template below to prevent duplicates.
3. Don't number issues, just give them a random 3-char identifier (eg `Issue x3c`)
4. Use top-level pseudoXML for each issue, bullets, and nested bullets to keep organized. 
5. If you identify an issue which does _not_ have a test, create a failing test which represents the issue.
6. Use your judgment in the amount of detail required. 
7. If the fix is self evident and no investigation is needed, just include the title, description, and the list of related failing tests.
8. Simple fixes that are categorical ("all these things need to be renamed or have imports updated based on recent changes") can be grouped together, but you should still keep them tied to one specific test failure as an anchor.

</Rules>

<Template>

<IssueXXX>

## Issue #XXX: "Exact language of one failing test"

Description of the issue.

### Failing tests
- tests/path/test1.test.ts 
    - "Name of related failing test"
    - "Name of other related failing test"
- tests/other-path/test2.test.ts 
    - "Name of another related failing test in a different file"

### Minimal relevant files for reproducing/investigating the failure:
- src/path/file1.ts
- src/path/file2.ts

### Current hypotheses
- Details of hypothesis 1

### Evidence
- list the evidence we have available for helping understand the issue

### Notes
- any additional notes or context helpful for understanding the issue.

<IssueXXX>

</Template>

## Subinterpreter State Inheritance and Nested Directive Handling

**Status**: Investigation Needed
**Priority**: High
**Type**: Bug
**Component**: Interpreter

### Description
The subinterpreter tests are failing due to issues with state inheritance and nested directive handling. The core problem appears to be that parent state values are not being properly inherited or accessed in nested contexts.

### Key Files
- `src/interpreter/__tests__/subInterpreter.test.ts` (Main test file showing failures)
- `src/interpreter/subInterpreter.ts` (Implementation)
- `src/interpreter/state/state.ts` (State management)
- `src/interpreter/__tests__/nested-directives.test.ts` (Additional test coverage)

### Failing Tests
1. `should interpret nested directives`
2. `should handle location offsets correctly`
3. `should inherit parent state variables`
4. `should merge child state back to parent`

### Investigation Notes
- Parent state setText/getText methods not working as expected
- Error when trying to interpret sub-directives: "Failed to parse or interpret sub-directives"
- State inheritance chain may be broken
- Need to verify if state is being properly cloned/inherited in nested contexts

### Questions for Architecture Review
1. Should nested states maintain their own isolated context or fully inherit parent state?
2. How should state modifications in nested contexts propagate back to parent?
3. Is the current state inheritance model sufficient for complex nested scenarios?

## Location Adjustments in Nested Directives

**Status**: Investigation Needed
**Priority**: High
**Type**: Bug
**Component**: Interpreter

### Description
Location information is not being properly adjusted when handling nested directives, leading to incorrect error reporting and location tracking.

### Key Files
- `src/interpreter/__tests__/nested-directives.test.ts`
- `src/interpreter/utils/location.ts`
- `src/interpreter/directives/registry.ts`

### Failing Tests
1. `handles nested text directives with adjusted locations`
2. `handles errors in nested directives with adjusted locations`
   - Expected location {line: 10, column: 3} but received undefined

### Investigation Notes
- Location adjustment may be happening at wrong phase of interpretation
- Error objects not carrying location information through the stack
- Need to verify if location adjustment is consistent across all directive types

### Questions for Architecture Review
1. At what point in the interpretation pipeline should location adjustment occur?
2. Should location adjustment be handled by individual directives or centralized?
3. How should we handle location information in error cases?


