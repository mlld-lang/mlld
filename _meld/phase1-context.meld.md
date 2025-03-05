@import[partials/meld-architect.md]

# Meld Phase 1: Foundation Repair Context

We are working on fixing critical foundation issues in the Meld codebase, specifically focusing on path parsing/resolution and AST integration. We currently have 645 passing tests and 57 failing tests, many related to these foundation issues.

## Phase 1 Focus Areas

1. Path resolution and parsing issues (property name mismatches, structured path format, special variables)
2. AST integration and proper service architecture (making ParserService the sole interface to meld-ast)

===============================
=== SHIPPING PLAN FOR PHASE 1 =

@import[../dev/SHIP.md]

===============================
=== STRUCTURED PATH FORMAT ISSUES =

@import[../dev/FIXPATHSPARSE.md]

===============================
=== SERVICE ARCHITECTURE ISSUES =

@import[../dev/PLAN-REGEX.md]

===============================
=== CORE ARCHITECTURE ==========

@import[../docs/ARCHITECTURE.md]

===============================
=== RELEVANT CODE =============

@cmd[cpai ../services/resolution/ResolutionService/ResolutionService.ts ../services/resolution/ResolutionService/resolvers/PathResolver.ts ../services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts ../services/pipeline/ParserService/ParserService.ts ../services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.ts ../services/resolution/ValidationService/validators/PathDirectiveValidator.ts ../core/types/dependencies.ts --stdout]

===============================
=== FAILING TESTS =============

@cmd[npm test -- --no-coverage "ResolutionService|PathResolver|ParserService|PathDirectiveHandler|PathDirectiveValidator" | grep -B 1 -A 10 "FAIL"]

===============================
=== TEST UTILITIES ============

@cmd[cpai ../tests/utils/TestContext.ts ../tests/utils/debug/StateTrackingService/StateTrackingService.ts ../tests/utils/debug/StateHistoryService/StateHistoryService.ts --stdout]

===============================
=== YOUR TASK =================

## Phase 1 Priority Tasks

### 1.1 Path Resolution and Parsing
- Fix the structured path format transition issues in ResolutionService
- Ensure proper handling of special path variables ($PROJECTPATH, $HOMEPATH, $., $~)
- Correct property name mismatches between AST nodes and validator expectations
- Update PathDirectiveHandler to properly handle the StructuredPath object format
- Update PathDirectiveValidator to align with expected test formats

### 1.2 AST Integration and Service Architecture
- Enforce ParserService as the sole interface to meld-ast
- Remove direct meld-ast imports from other services
- Remove custom code fence validation regex in favor of AST properties
- Update ContentResolver to leverage AST node properties

When providing solutions:
1. Focus on one issue at a time
2. Provide specific file paths and line numbers for changes
3. Explain your reasoning so we understand the fix
4. Ensure types and interfaces are properly maintained
5. Consider potential side effects of changes

IMPORTANT: We have robust test utilities - use them to validate your solutions! You can leverage StateTrackingService and StateHistoryService for debugging complex issues.

BE SPECIFIC AND DECISIVE. DO NOT PROVIDE VAGUE SUGGESTIONS. 