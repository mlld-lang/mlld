# Transformation Mode Implementation Fixes

@import[../partials/header.md]

## PREVIOUS ANALYSIS

@import[../detailed/1-method-inventory.md]
@import[../detailed/3-test-patterns.md]
@import[../4-answer.md]

## CODE TO ANALYZE

=== STATE SERVICE ===

@cmd[cpai ../../../services/StateService/StateService.ts --stdout]

=== DIRECTIVE HANDLERS ===

@cmd[cpai ../../../services/DirectiveService/handlers/RunDirectiveHandler.ts ../../../services/DirectiveService/handlers/EmbedDirectiveHandler.ts --stdout]

=== FAILING TRANSFORMATION TESTS ===

@cmd[cpai ../../../tests/services/OutputService/OutputService.test.ts --stdout]

## YOUR TASK

Provide precise implementation fixes for transformation-related issues:

1. For each transformation method that needs fixing:
   ```typescript
   {
     file: string;
     methodName: string;
     currentIssues: string[];
     proposedFix: string;
     transformationFlags: {
       name: string;
       handling: string;
     }[];
     statePreservation: {
       whatToPreserve: string[];
       howToPreserve: string;
     };
   }
   ```

2. Implementation requirements:
   - Must correctly enable/disable transformation
   - Must preserve state during cloning
   - Must handle directive replacement properly
   - Must maintain consistency across service boundaries

3. Provide exact TypeScript implementations

BE PRECISE - these fixes will be applied directly.
INCLUDE all necessary type handling.
ENSURE fixes address all identified test failures.

@import[../partials/quality-requirements.md] 