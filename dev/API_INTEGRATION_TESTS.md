# API Integration Tests: Issues and Fix Plan

## Overview

The API integration tests (`api/integration.test.ts`) currently have 19 failing tests out of 27 total tests. These failures occur due to mismatches between how the parser generates AST nodes and how validators and handlers expect them to be structured. Fixing these tests is our current priority.

## Key Issues By Directive Type

### 1. Path Directives - PARTIALLY FIXED
- **Parser produces**: `id` and `path.raw` properties  
- **Validator expects**: `identifier` and `value` properties
- **Current status**: Fixed validator and handler, but some tests still fail with "Cannot read properties of undefined (reading 'getPathVar')"

### 2. Import Directives - NEEDS FIX
- **Error**: `value.match is not a function`  
- **Tests affected**: All import tests (simple imports, nested imports, circular imports)

### 3. Define Directives - NEEDS FIX
- **Error**: `Define directive requires an "identifier" property`
- **Tests affected**: "@define and command execution", "commands with parameters"

### 4. Embed Directives - NEEDS FIX
- **Error**: `Embed directive requires a "path" property`
- **Tests affected**: All embed tests

### 5. TextVar Nodes - NEEDS FIX
- **Error**: `Unknown node type: TextVar`
- **Tests affected**: Variable references, format transformation tests, state management tests

### 6. Code Fence Parsing - NEEDS FIX
- **Error**: `Invalid code fence: missing opening or closing backticks`
- **Tests affected**: All code fence tests

## Current Test Status

- ✅ 4 tests passing (path validation error cases)
- ⏭️ 4 tests skipped (path variable definition cases)
- ❌ 19 tests failing (other directive types and variable references)

## Detailed Fix Plan

### For Each Validator:

1. **PathDirectiveValidator**:
   - ✅ Updated to handle both `id` and `identifier`
   - ✅ Modified to extract path value from `path.raw` if `value` is missing

2. **ImportDirectiveValidator**:
   - Check if `value` is an object and handle appropriately
   - Extract path from `path` property if available
   - Handle nested structures similar to path directive

3. **DefineDirectiveValidator**:
   - Add support for alternative property names
   - Extract command and parameters from nested structures if needed

4. **EmbedDirectiveValidator**:
   - Support extracting path from `path` property or nested structure
   - Handle section extraction correctly

### For Each Handler:

1. **PathDirectiveHandler**:
   - ✅ Modified to extract values from `id` and `path.raw`
   - Still need to fix `getPathVar` issues in some contexts

2. **ImportDirectiveHandler**:
   - Update to handle various path formats
   - Extract path from nested structure if needed

3. **RunDirectiveHandler**:
   - Fix string formatting issues (e.g., extra quotes)
   - Handle various command structures

4. **EmbedDirectiveHandler**:
   - Extract path from nested structure
   - Support various section extraction formats

### For TextVar Node Issues:

1. **Investigate node structure** that's causing "Unknown node type: TextVar"
2. **Fix transformation pipeline** to correctly handle these nodes
3. **Update interpreters** to recognize and process TextVar nodes

### For Code Fence Tests:

1. **Fix escaping** for backticks in test fixtures
2. **Ensure proper nesting** of code fence blocks
3. **Verify parser handling** of code fence structures

## Implementation Strategy

1. **Systematic Approach**: Fix one directive type at a time, verifying tests pass
2. **Temporary Fixes**: Use direct fixes to validators/handlers first, then refactor if needed
3. **Debugging Tool**: Create debug helper to analyze node structures from parser
4. **Documentation**: Document each AST node format as we fix the issues

## Expected Outcomes

- All 27 API integration tests passing
- Robust validator and handler implementations
- Better understanding of AST structure
- Improved code documentation