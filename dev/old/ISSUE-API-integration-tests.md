# Fix API Integration Tests - HIGH PRIORITY

## Issue Description

The API integration tests in `api/integration.test.ts` are currently failing (19 of 27 tests). These failures are due to mismatches between how the Meld parser generates AST nodes and how the validators and handlers expect them to be structured.

## Current Status

- ✅ 4 tests passing (path validation error cases)
- ⏭️ 4 tests skipped (path variable definition tests)
- ❌ 19 tests failing (other directive types and variable references)

## Root Cause Analysis

We've identified the following key issues:

1. **Path Directives** (PARTIALLY FIXED)
   - Parser produces: `id` and `path.raw` properties
   - Validator expects: `identifier` and `value` properties
   - Current status: Basic validator and handler fixes implemented
   - Remaining issue: "Cannot read properties of undefined (reading 'getPathVar')"

2. **Import Directives**
   - Error: `value.match is not a function`
   - Affects: All import-related tests

3. **Define Directives**
   - Error: `Define directive requires an "identifier" property`
   - Affects: Command execution tests

4. **Embed Directives**
   - Error: `Embed directive requires a "path" property`
   - Affects: All embed tests

5. **TextVar Nodes**
   - Error: `Unknown node type: TextVar`
   - Affects: Variable references, formatting tests, state management

6. **Code Fence Parsing**
   - Error: `Invalid code fence: missing opening or closing backticks`
   - Affects: All code fence tests

## Required Fixes

1. **For Each Validator**
   - Update to accept multiple property formats (like we did with Path)
   - Extract values from nested objects where needed
   - Support both old and new AST formats

2. **For Each Handler**
   - Update to handle various AST structures
   - Fix value extraction from different property names
   - Ensure proper state management

3. **For TextVar Node Issues**
   - Fix interpretation of variable references
   - Update transformation pipeline

4. **For Code Fence Tests**
   - Fix backtick escaping in test fixtures
   - Update parsing expectations

## Implementation Plan

1. Use the `PathDirectiveValidator` and `PathDirectiveHandler` fixes as a template
2. Fix one directive type at a time in this order:
   - Complete path directive fixes
   - Import directives
   - Define directives
   - Embed directives
   - TextVar handling
   - Code fence parsing

3. For each fix:
   - Analyze the AST structure from the parser
   - Update validator to accept both formats
   - Update handler to extract values properly
   - Run tests to verify fix works

## Related Files

- `services/resolution/ValidationService/validators/*.ts` - Validator implementations
- `services/pipeline/DirectiveService/handlers/*/*.ts` - Handler implementations
- `api/integration.test.ts` - The test file needing fixes
- `examples/api-demo.meld` - Reference for correct directive usage
- `dev/API_INTEGRATION_TESTS.md` - Detailed analysis of issues and fix plan
- `dev/API_INTEGRATION_FIX_STEPS.md` - Step-by-step implementation guide

## Expected Outcome

- All 27 API integration tests passing
- Validators and handlers that work with both property naming conventions
- Better understanding of AST structure
- Improved documentation of node formats

## Priority

HIGH - Fixing these tests is our current priority before moving to CLI implementation.

## Time Estimate

1-2 days