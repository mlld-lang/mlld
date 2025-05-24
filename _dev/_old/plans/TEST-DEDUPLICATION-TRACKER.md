# Test Deduplication Audit Tracker

## Purpose
Track the comprehensive audit of all service tests to identify duplicates between `.test.ts` and `.fixture.test.ts` files, and determine which tests need fixture migration.

## Audit Process
For each service/handler:
1. Read `.fixture.test.ts` file to understand coverage
2. Review each test in `.test.ts` file
3. Categorize each test as:
   - **Duplicate** - Functionality already covered by fixture tests (remove)
   - **Unique/Keep** - Tests service-specific behavior not covered by fixtures
   - **Needs Migration** - Unique test that should use fixtures

## Audit Status Overview

| Service/Handler | .test.ts Tests | Fixture Tests | Duplicates | Keep | Needs Migration | Status |
|-----------------|----------------|---------------|------------|------|-----------------|--------|
| TextDirectiveHandler | 7 | 5+ | 2 | 3 | 2 | ✅ Complete |
| DataDirectiveHandler | 8 | 8+ | 4 | 1 | 3 | ✅ Complete |
| PathDirectiveHandler | 7 | 7+ | 4 | 3 | 0 | ✅ Complete |
| ImportDirectiveHandler | 15 | 6 | 6 | 9 | 0 | ✅ Complete |
| AddDirectiveHandler | 14 | 12 | 5 | 9 | 0 | ✅ Complete |
| RunDirectiveHandler | 13 | 8 | 6 | 7 | 0 | ✅ Complete |
| ExecDirectiveHandler | N/A | 9 | N/A | N/A | 0 | ✅ Complete |
| PathService | 20+ | 12 | 7 | 13+ | 0 | ✅ Complete |
| ResolutionService | 44 | 11 | 19 | 25 | 0 | ✅ Complete |
| StateService | 29 | 0 | 0 | 29 | N/A | ✅ Complete |
| InterpreterService | 21 (integration) | 0 | 0 | 21 | N/A | ✅ Complete |
| ParserService | 22 | 0 | 0 | 0 | 22 | ✅ Complete |
| DirectiveService | 11 (8+3) | 0 | 0 | 11 | N/A | ✅ Complete |
| ValidationService | 41 | 0 | 0 | 41 | N/A | ✅ Complete |
**Legend**: ✅ Complete | 🟡 Not Started | 🔴 Issues Found | N/A Not Applicable

## Detailed Findings

### TextDirectiveHandler
**Date Audited**: 5/19/2025
**Fixture Test File**: `TextDirectiveHandler.fixture.test.ts`
**Manual Test File**: `TextDirectiveHandler.test.ts`

#### Fixture Test Coverage
- ✅ Simple text assignments with string literals (text-assignment fixtures)
- ✅ Template literals with variable interpolation (text-template fixtures)
- ✅ Multiline templates (text-template-multiline fixtures)
- ✅ Error handling for undefined variables
- ✅ Comprehensive coverage via getFixturesByKind/getFixturesByKindAndSubtype methods

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| should handle a simple text assignment with string literal | Duplicate | Remove | Covered by text-assignment fixtures |
| should handle text assignment with escaped characters | Unique | Keep | Tests specific escape sequences (\n, \t, \") not in fixtures |
| should handle a template literal in text directive | Needs Migration | Migrate | Could use text-template fixtures |
| should handle object property interpolation in text value | Needs Migration | Migrate | Tests field access, could use fixtures with object vars |
| should handle path referencing in text values | Unique | Keep | Tests specific path variable resolution logic |
| should throw DirectiveError if text interpolation contains undefined variables | Unique | Keep | Tests error propagation and mock behavior |
| should handle basic variable interpolation | Duplicate | Remove | Covered by text-template fixtures |

#### Summary
- Tests to remove: 2
  - "should handle a simple text assignment with string literal"
  - "should handle basic variable interpolation"
- Tests to keep as-is: 3
  - "should handle text assignment with escaped characters"
  - "should handle path referencing in text values"
  - "should throw DirectiveError if text interpolation contains undefined variables"
- Tests to migrate to fixtures: 2
  - "should handle a template literal in text directive"
  - "should handle object property interpolation in text value"

---

### DataDirectiveHandler
**Date Audited**: 5/19/2025
**Fixture Test File**: `DataDirectiveHandler.fixture.test.ts`
**Manual Test File**: `DataDirectiveHandler.test.ts`

#### Fixture Test Coverage
- ✅ Object data assignments (data-object fixtures)
- ✅ Array data assignments (data-array fixtures)
- ✅ Nested object data (data-object-nested fixtures)
- ✅ Mixed array data (data-array-mixed fixtures)
- ✅ Primitive data types (boolean, number)
- ✅ Error handling for invalid JSON
- ✅ Resolution errors
- ✅ Comprehensive coverage of all data fixtures by pattern matching

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| should process simple JSON data | Duplicate | Remove | Covered by data-object fixtures |
| should handle nested JSON objects | Duplicate | Remove | Covered by data-object-nested fixtures |
| should handle JSON arrays | Duplicate | Remove | Covered by data-array fixtures |
| should handle invalid JSON from run/add | Unique | Keep | Tests specific error path with command execution |
| should handle resolution errors | Duplicate | Remove | Already covered in fixture tests |
| should resolve variables in nested JSON structures | Needs Migration | Migrate | Variable resolution in nested structures |
| should handle JSON strings containing variable references | Needs Migration | Migrate | String interpolation in data values |
| should preserve JSON structure when resolving variables | Needs Migration | Migrate | Tests structure preservation during resolution |

#### Summary
- Tests to remove: 4
  - "should process simple JSON data"
  - "should handle nested JSON objects"
  - "should handle JSON arrays"
  - "should handle resolution errors"
- Tests to keep as-is: 1
  - "should handle invalid JSON from run/add" (tests command execution error path)
- Tests to migrate to fixtures: 3
  - "should resolve variables in nested JSON structures"
  - "should handle JSON strings containing variable references"
  - "should preserve JSON structure when resolving variables"

---

### PathDirectiveHandler
**Date Audited**: 5/19/2025
**Fixture Test File**: `PathDirectiveHandler.fixture.test.ts`
**Manual Test File**: `PathDirectiveHandler.test.ts`

#### Fixture Test Coverage
- ✅ Simple path assignments (path-assignment fixtures)
- ✅ Absolute paths (path-assignment-absolute fixtures)
- ✅ Project paths (path-assignment-project fixtures)
- ✅ Special paths (path-assignment-special fixtures)
- ✅ Paths with variables (path-assignment-variable fixtures)
- ✅ Validation error handling
- ✅ Resolution error handling

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| should process simple paths | Duplicate | Remove | Covered by path-assignment fixtures |
| should handle paths with variables | Duplicate | Remove | Covered by path-assignment-variable fixtures |
| should handle relative paths | Unique | Keep | Tests relative path handling not in fixtures |
| should handle validation errors | Duplicate | Remove | Already covered in fixture tests |
| should handle resolution errors (resolveNodes) | Duplicate | Remove | Already covered in fixture tests |
| should handle resolution errors (resolvePath) | Unique | Keep | Tests specific path resolution error |
| should handle state errors (setVariable) | Unique | Keep | Tests state management edge case |

#### Summary
- Tests to remove: 4
  - "should process simple paths"
  - "should handle paths with variables"
  - "should handle validation errors"
  - "should handle resolution errors (resolveNodes)"
- Tests to keep as-is: 3
  - "should handle relative paths" (unique relative path handling)
  - "should handle resolution errors (resolvePath)" (specific resolution step)
  - "should handle state errors (setVariable)" (state edge case)
- Tests to migrate to fixtures: 0 (unique tests are fine as manual tests)

---

### ImportDirectiveHandler
**Date Audited**: 5/19/2025
**Fixture Test File**: `ImportDirectiveHandler.fixture.test.ts`
**Manual Test File**: `ImportDirectiveHandler.test.ts`

#### Fixture Test Coverage
- ✅ Import all handling (import-all fixtures)
- ✅ Import all with variables (import-all-variable fixtures)
- ✅ Import selected handling (import-selected fixtures)
- ✅ Validation error handling
- ✅ File not found errors
- ✅ Circular import errors

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| should handle $. alias for project path | Unique | Keep | Special path variable handling |
| should handle $PROJECTPATH for project path | Unique | Keep | Special path variable handling |
| should handle $~ alias for home path | Unique | Keep | Special path variable handling |
| should handle $HOMEPATH for home path | Unique | Keep | Special path variable handling |
| should throw error if resolved path does not exist | Duplicate | Remove | Covered by fixture error tests |
| should handle user-defined path variables in import path | Unique | Keep | Tests variable resolution in paths |
| should import all variables with * | Duplicate | Remove | Covered by import-all fixtures |
| should import specific variables with alias | Duplicate | Remove | Covered by import-selected fixtures |
| should handle validation errors from ValidationService | Duplicate | Remove | Already in fixture tests |
| should handle variable not found during path resolution | Unique | Keep | Tests specific resolution error |
| should handle file not found from FileSystemService | Duplicate | Remove | Already in fixture tests |
| should handle circular imports from CircularityService | Duplicate | Remove | Already in fixture tests |
| should handle parse errors from ParserService | Unique | Keep | Tests parse error handling |
| should handle interpretation errors from InterpreterService Client | Unique | Keep | Tests interpreter error handling |
| should always call endImport on CircularityService even if read fails | Unique | Keep | Tests cleanup behavior |

#### Summary
- Tests to remove: 6
  - "should throw error if resolved path does not exist"
  - "should import all variables with *"
  - "should import specific variables with alias"
  - "should handle validation errors from ValidationService"
  - "should handle file not found from FileSystemService"
  - "should handle circular imports from CircularityService"
- Tests to keep as-is: 9
  - All special path variable tests ($., $PROJECTPATH, $~, $HOMEPATH)
  - "should handle user-defined path variables in import path"
  - "should handle variable not found during path resolution"
  - "should handle parse errors from ParserService"
  - "should handle interpretation errors from InterpreterService Client"
  - "should always call endImport on CircularityService even if read fails"
- Tests to migrate to fixtures: 0 (unique tests are fine as manual tests)

---

## Migration Priority

Based on the audit findings, prioritize migration in this order:
1. **ParserService** - 22 tests need migration to output fixtures (critical for AST stability)
2. **DataDirectiveHandler** - 3 tests need migration to fixtures (variable resolution tests)
3. **TextDirectiveHandler** - 2 tests need migration to fixtures (template and interpolation tests)
4. **Other Handlers** - 0 tests need migration (only duplicates to remove)

**Special Note on ParserService**: This is the highest priority because:
- It's the foundation of the entire AST system
- Output fixtures would catch any grammar/AST structure regressions
- All other services depend on consistent AST output from the parser

## Summary of Findings

### Overall Statistics (All Services/Handlers)
- Total test files analyzed: ~28 files
- Total manual tests reviewed: ~278 tests
- Tests identified for removal (duplicates): 52 (19%)
- Tests to keep (unique functionality): 199 (72%)
- Tests needing fixture migration: 27 (10%)

### Key Insights
1. **High Duplication Rate**: 41% of manual tests duplicate functionality already covered by fixture tests
2. **Unique Value Tests**: 49% of manual tests provide unique value by testing:
   - Service-specific error handling
   - Mock behavior validation
   - Edge cases not covered by fixtures
   - Integration patterns
3. **Limited Migration Needs**: Only 10% of tests need migration to fixtures
4. **Test Quality**: Fixture tests provide comprehensive coverage of AST node processing

### AddDirectiveHandler
**Date Audited**: 5/19/2025
**Fixture Test File**: `AddDirectiveHandler.fixture.test.ts`
**Manual Test File**: `AddDirectiveHandler.test.ts`

#### Fixture Test Coverage
- ✅ Basic add-path handling
- ✅ Add-path-section handling (skipped due to grammar bug)
- ✅ Add-template handling
- ✅ Add-template-multiline (skipped due to grammar bug)
- ✅ Add-template-variables handling
- ✅ Add-variable handling
- ✅ Error handling (file not found, invalid directive, unsupported subtype)
- ✅ Options handling (headingLevel, underHeader)
- ✅ Formatting context preservation

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| should handle basic add without modifiers (subtype: addPath) | Duplicate | Remove | Covered by fixture add-path test |
| should handle add with section (subtype: addPath) | Duplicate | Remove | Covered by fixture add-path-section test |
| should throw error if file not found | Duplicate | Remove | Already in fixture error tests |
| should handle section extraction failure gracefully | Unique | Keep | Tests specific extraction error |
| should handle error during path resolution | Unique | Keep | Tests resolution error path |
| should handle error during file reading | Unique | Keep | Tests file system error path |
| should handle variable resolution failure in path | Unique | Keep | Tests variable resolution error |
| should handle variable resolution failure in template | Unique | Keep | Tests template resolution error |
| should handle user-defined path variables with $ | Unique | Keep | Tests path variable resolution |
| should handle simple variable reference embeds | Duplicate | Remove | Covered by add-variable fixture |
| should handle data variable reference embeds (using dot notation) | Unique | Keep | Tests object field access |
| should add resolved template literal content | Duplicate | Remove | Covered by add-template fixtures |
| should return replacement node when transformation is enabled | Unique | Keep | Tests transformation mode |
| should still return replacement node even when transformation is disabled | Unique | Keep | Tests non-transformation mode |

#### Summary
- Tests to remove: 5
  - "should handle basic add without modifiers (subtype: addPath)"
  - "should handle add with section (subtype: addPath)"
  - "should throw error if file not found"
  - "should handle simple variable reference embeds"
  - "should add resolved template literal content"
- Tests to keep as-is: 9
  - All error handling tests (section extraction, path resolution, file reading, variable resolution)
  - Path variable handling
  - Data variable dot notation
  - Transformation mode tests
- Tests to migrate to fixtures: 0 (unique tests are fine as manual tests)

---

## Success Metrics

### Before Audit
- Total test files: 10 (5 handlers analyzed)
- Total test cases: 51 in manual tests + ~40 in fixture tests
- Duplicate test coverage: Unknown

### After Audit (Results)
- Test files to remain: 10 (no consolidation needed)
- Test cases after deduplication: 30 manual + ~40 fixture tests
- Tests removed (duplicates): 21 (41% reduction)
- Tests using fixtures: 57% (40 out of 70 total)

### Recommendations
1. Remove 21 duplicate tests to eliminate redundancy
2. Migrate 5 tests to fixtures for consistency
3. Keep 25 unique manual tests that provide specific value
4. Continue using both .test.ts and .fixture.test.ts patterns

### RunDirectiveHandler
**Date Audited**: 5/19/2025
**Fixture Test File**: `RunDirectiveHandler.fixture.test.ts`
**Manual Test File**: `RunDirectiveHandler.test.ts`

#### Fixture Test Coverage
- ✅ Run-command handling
- ✅ Run-command-multiline handling 
- ✅ Run-code handling
- ✅ Run-code-multiline handling
- ✅ Run-exec handling
- ✅ Run-exec-parameters handling
- ✅ Error handling (invalid directive, command failure, undefined reference)
- ✅ Custom output variable names

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| should execute simple commands | Duplicate | Remove | Covered by run-command fixture |
| should handle commands with variables | Unique | Keep | Tests variable interpolation in commands |
| should handle custom output variable | Duplicate | Remove | Already in fixture tests |
| should properly expand command references with $ | Duplicate | Remove | Covered by run-exec fixture |
| should execute script content without language as shell commands | Unique | Keep | Tests default language behavior |
| should execute script content with specified language using a temp file | Unique | Keep | Tests language-specific execution |
| should resolve and pass parameters to a language script | Duplicate | Remove | Covered by run-exec-parameters fixture |
| should handle parameter resolution failure in strict mode | Unique | Keep | Tests strict mode behavior |
| should handle resolution errors for command string | Unique | Keep | Tests specific resolution error path |
| should handle command execution errors | Duplicate | Remove | Already in fixture error tests |
| should handle undefined command references for runExec | Duplicate | Remove | Already in fixture error tests |
| should handle stdout and stderr | Unique | Keep | Tests combined output handling |
| should handle transformation mode (return replacement node) | Unique | Keep | Tests transformation-specific behavior |

#### Summary
- Tests to remove: 6
  - "should execute simple commands"
  - "should handle custom output variable"
  - "should properly expand command references with $"
  - "should resolve and pass parameters to a language script"
  - "should handle command execution errors"
  - "should handle undefined command references for runExec"
- Tests to keep as-is: 7
  - Variable interpolation test
  - Language-specific tests (default behavior, specified language)
  - Strict mode parameter resolution
  - Resolution error handling
  - Combined stdout/stderr handling
  - Transformation mode behavior
- Tests to migrate to fixtures: 0 (unique tests are fine as manual tests)

---

### ExecDirectiveHandler
**Date Audited**: 5/19/2025
**Fixture Test File**: `ExecDirectiveHandler.fixture.test.ts`
**Manual Test File**: None (only has fixture tests)

#### Fixture Test Coverage
- ✅ execCommand subtype handling
- ✅ execCode with language handling
- ✅ exec with literal value handling
- ✅ exec-reference with existing command
- ✅ Error handling (invalid directive node, missing content)
- ✅ Parameter handling
- ✅ Metadata handling (risk level, description)

#### Summary
- No manual test file exists - all testing is done through fixtures
- Fixture tests provide comprehensive coverage of all handler functionality
- No duplicate tests to remove
- No tests to migrate (already fixture-based)

---

### ResolutionService
**Date Audited**: 5/19/2025
**Fixture Test File**: `ResolutionService.fixture.test.ts`
**Manual Test File**: `ResolutionService.test.ts`

#### Fixture Test Coverage
- ✅ Template resolution (single variable, multiline)
- ✅ Data variable resolution (object property, nested property)
- ✅ Variable interpolation in text
- ✅ Field access resolution
- ✅ Invalid field access handling
- ✅ Real AST node processing from fixtures

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|-----------|
| should handle text nodes | Duplicate | Remove | Basic functionality tested in fixtures |
| should resolve text variables | Duplicate | Remove | Covered by fixture tests |
| should resolve data variables | Duplicate | Remove | Covered by fixture tests |
| should resolve system path variables | Unique | Keep | System path variable handling |
| should resolve user-defined path variables | Unique | Keep | User-defined path handling |
| should resolve command references | Unique | Keep | Command variable resolution |
| should handle parsing failures | Unique | Keep | Error recovery behavior |
| should concatenate multiple nodes | Duplicate | Remove | Basic functionality in fixtures |
| should read file content | Unique | Keep | File system integration |
| should throw when file does not exist | Unique | Keep | Error handling for files |
| should extract section by heading | Unique | Keep | Section extraction logic |
| should include content until next heading | Unique | Keep | Heading level logic |
| should throw when section is not found | Unique | Keep | Section error handling |
| should return MeldPath when validation succeeds | Duplicate | Remove | Path validation in fixtures |
| should re-throw PathValidationError | Unique | Keep | Error propagation |
| should wrap and throw other errors | Unique | Keep | Error wrapping logic |
| should detect direct circular references | Unique | Keep | Circular reference detection |
| should handle non-circular references | Unique | Keep | Valid reference chains |
| should resolve simple field access | Duplicate | Remove | Covered by fixtures |
| should resolve nested field access | Duplicate | Remove | Covered by fixtures |
| should throw FieldAccessError (invalid) | Duplicate | Remove | Error handling in fixtures |
| should throw FieldAccessError (non-object) | Duplicate | Remove | Error handling in fixtures |
| should resolve nested data with field access | Duplicate | Remove | Already in fixtures |
| should throw FieldAccessError in strict mode | Unique | Keep | Strict mode behavior |
| should resolve system path variables (dup) | Duplicate | Remove | Already listed above |
| should resolve user-defined path vars (dup) | Duplicate | Remove | Already listed above |
| should resolve text variables (dup) | Duplicate | Remove | Already listed above |
| should concatenate multiple nodes (dup) | Duplicate | Remove | Already listed above |
| should handle non-existent var in strict | Unique | Keep | Strict mode behavior |
| should return empty for non-existent (non-strict) | Unique | Keep | Non-strict behavior |
| should detect circular references (dup) | Duplicate | Remove | Already listed above |
| should execute basic command | Unique | Keep | Command execution |
| should throw for non-existent command | Unique | Keep | Command error handling |
| should handle command execution error | Unique | Keep | Execution error handling |
| should resolve only TextNodes | Duplicate | Remove | Basic filtering in fixtures |
| should resolve mix of nodes | Duplicate | Remove | Basic functionality |
| should filter out non-content nodes | Unique | Keep | Node filtering behavior |
| should return empty for empty input | Unique | Keep | Edge case handling |
| should return empty if only non-content | Unique | Keep | Edge case handling |
| should throw if resolution fails (strict) | Unique | Keep | Strict mode errors |
| should return partial result (non-strict) | Unique | Keep | Non-strict behavior |

#### Summary
- Tests to remove: 19
  - Basic resolution tests covered by fixtures
  - Field access tests duplicated in fixtures
  - Simple concatenation and filtering tests
- Tests to keep as-is: 25
  - Service-specific behavior (strict vs non-strict modes)
  - File system operations
  - Section extraction logic
  - Error handling and propagation
  - Circular reference detection
  - Command execution tests
  - Edge case handling
- Tests to migrate to fixtures: 0 (unique tests are better as manual tests)

---

### StateService
**Date Audited**: 5/19/2025
**Fixture Test File**: None
**Manual Test File**: `StateService.test.ts`
**Additional Test File**: `StateService.transformation.test.ts` (for specific transformation feature)

#### Test Coverage
- ✅ Setting and getting variables (text, data, path, command)
- ✅ Node management (add/get nodes)
- ✅ Import management
- ✅ Event emission for state operations
- ✅ State cloning and merging
- ✅ Child state inheritance
- ✅ Immutability enforcement
- ✅ State tracking relationships
- ✅ Node ID preservation
- ✅ Transformation feature (in separate test file)

#### Analysis
StateService is a core infrastructure service that manages state. It doesn't process AST nodes directly like handlers do, so fixture-based testing is not appropriate. All tests focus on:
- State manipulation operations
- Variable management
- State relationships (parent/child)
- Event emission
- Immutability guarantees

#### Summary
- Tests to remove: 0 (no duplicates)
- Tests to keep as-is: 29 (all provide unique value)
- Tests to migrate to fixtures: N/A (not applicable for this service)
- **Note**: Service-specific functionality doesn't benefit from fixture testing
- **Note**: Has an open issue with one failing test (merge tracking)

---

### InterpreterService
**Date Audited**: 5/19/2025
**Fixture Test File**: None
**Manual Test File**: `InterpreterService.integration.test.ts` (integration tests only)

#### Test Coverage
- ✅ Basic interpretation (text nodes, directive nodes)
- ✅ Directive-specific interpretation (data, path, text)
- ✅ Node order preservation
- ✅ State isolation and merging
- ✅ Error handling and rollback
- ✅ Circular import detection
- ✅ Location tracking in errors
- ✅ State consistency after errors
- ✅ File path context tracking
- ✅ Schema validation
- ✅ Cleanup handling

#### Analysis
InterpreterService has only integration tests, which is appropriate for a service that orchestrates multiple other services. Tests focus on:
- End-to-end directive processing
- State management across interpretations
- Error propagation and recovery
- Integration with DirectiveService and StateService

#### Summary
- Tests to remove: 0 (no duplicates)
- Tests to keep as-is: 21 (all integration tests)
- Tests to migrate to fixtures: N/A (integration tests use actual services)
- **Note**: Service uses `createNodeFromExample` helper which needs migration
- **Note**: Tests use old syntax helpers that may need updating
- **Key Issue**: Tests import from `@core/syntax/helpers/index` which needs to be replaced

---

### ParserService
**Date Audited**: 5/19/2025
**Fixture Test File**: None
**Manual Test File**: `ParserService.test.ts`

#### Test Coverage
- ✅ Basic parsing (text, directives, code fences)
- ✅ Code fence variations (with/without language, nested)
- ✅ Mixed content parsing
- ✅ Empty content handling
- ✅ Error handling (invalid/malformed directives)
- ✅ Variable reference parsing
- ✅ Field and array access in variables
- ✅ Location tracking and filePath inclusion
- ✅ Error location preservation

#### Analysis
ParserService is the core grammar parsing service. Tests focus on:
- Raw text → AST transformation
- Error handling with proper location info
- Complex syntax parsing (interpolations, field access)
- Location tracking through parse operations

#### Summary
- Tests to remove: 0 (no duplicates)
- Tests to keep as-is: 0 (should migrate to fixture-based validation)
- Tests to migrate to fixtures: 22 (ALL tests could use output fixtures)
- **IMPORTANT**: ParserService could benefit significantly from output fixtures
- **Migration Strategy**: 
  1. Test provides input text
  2. Parser generates AST
  3. Compare against expected AST structure from fixtures
- **Note**: This would ensure parser output stays consistent with grammar changes
- **Note**: Would catch regressions in AST structure automatically

---

### DirectiveService
**Date Audited**: 5/19/2025
**Fixture Test File**: None
**Manual Test File**: `DirectiveService.test.ts` (8 tests)
**Integration Test File**: `DirectiveService.integration.test.ts` (3 tests)

#### Test Coverage
- ✅ Handler registration and retrieval
- ✅ Directive processing delegation
- ✅ Error handling (unknown directives, invalid nodes)
- ✅ Context creation and passing
- ✅ State change application
- ✅ Integration with handlers (integration tests)

#### Analysis
DirectiveService orchestrates directive handling by delegating to appropriate handlers. Tests focus on:
- Handler registration/management
- Proper delegation based on directive type
- Error handling for unknown directives
- State management integration

#### Summary
- Tests to remove: 0 (no duplicates)
- Tests to keep as-is: 11 (all provide unique value)
- Tests to migrate to fixtures: N/A (orchestration service)
- **Note**: Integration tests verify end-to-end directive processing

---

### ValidationService
**Date Audited**: 5/19/2025
**Fixture Test File**: None
**Manual Test File**: `ValidationService.test.ts`

#### Test Coverage
- ✅ Schema validation for all directive types
- ✅ Required field validation
- ✅ Optional field handling
- ✅ Type validation (string, array, object)
- ✅ Nested structure validation
- ✅ Error reporting with detailed messages
- ✅ Valid directive acceptance
- ✅ Invalid directive rejection

#### Analysis
ValidationService validates directive nodes against their schemas. Tests focus on:
- Schema compliance checking
- Error message generation
- Field type validation
- Required/optional field handling
- Complex nested structure validation

#### Summary
- Tests to remove: 0 (no duplicates)
- Tests to keep as-is: 41 (all provide unique value)
- Tests to migrate to fixtures: N/A (schema validation service)
- **Note**: Comprehensive test coverage for all directive types and edge cases

---

## Implementation Guidelines

### When to Keep Manual Tests
- Tests that mock specific error conditions
- Tests that verify service-specific behavior
- Tests that check edge cases not covered by fixtures
- Unit tests for internal helper methods

### When to Use Fixtures
- Tests that validate AST node processing
- Tests that check directive handling
- Integration tests
- Tests that need real AST structures

### PathService
**Date Audited**: 5/19/2025
**Fixture Test File**: `PathService.fixture.test.ts`
**Manual Test File**: `PathService.test.ts`

#### Fixture Test Coverage
- ✅ Simple relative path resolution 
- ✅ Absolute path resolution
- ✅ Project-relative path resolution
- ✅ Special variable path resolution ($~, $PROJECTPATH)
- ✅ Path validation with existence checks
- ✅ External path rejection when not allowed
- ✅ URL detection and handling
- ✅ Path normalization and utility methods

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| should resolve a simple relative path to an AbsolutePath based on project root | Duplicate | Remove | Covered by fixture test |
| should resolve a ./ relative path to an AbsolutePath based on project root | Unique | Keep | Tests specific ./ prefix behavior |
| should resolve a simple path relative to baseDir if provided | Unique | Keep | Tests baseDir parameter functionality |
| should return an AbsolutePath as is (after normalization) | Unique | Keep | Tests absolute path passthrough |
| should resolve project path $. correctly | Duplicate | Remove | Covered by fixture test |
| should resolve project path $PROJECTPATH correctly | Duplicate | Remove | Covered by fixture test |
| should resolve home path $~ correctly | Duplicate | Remove | Covered by fixture test |
| should resolve home path $HOMEPATH correctly | Unique | Keep | Tests additional home path variant |
| should return empty RelativePath for empty input | Unique | Keep | Tests edge case handling |
| should throw PathValidationError for URL input | Duplicate | Remove | Covered by fixture test |
| should normalize a path with .. correctly | Duplicate | Remove | Covered by fixture normalize tests |
| should normalize a path with . correctly | Duplicate | Remove | Covered by fixture normalize tests |
| should normalize windows paths | Unique | Keep | Tests Windows-specific behavior |
| should preserve trailing slash | Unique | Keep | Tests specific normalization behavior |
| should validate paths (various validation tests) | Duplicate/Unique | Mixed | Some covered by fixtures, some unique |

#### Summary
- Tests to remove: 7
  - Basic path resolution tests covered by fixtures
  - Special path variable tests ($., $PROJECTPATH, $~)
  - Normalization tests covered by fixtures
- Tests to keep as-is: 13+
  - Tests with specific parameters (baseDir)
  - Edge case handling (empty input)
  - Platform-specific behavior (Windows paths)
  - Detailed validation logic tests with specific rules
- Tests to migrate to fixtures: 0 (unique tests are fine as manual tests)

---

### Migration Process
1. Identify appropriate fixture from `core/ast/fixtures/`
2. Replace manual node construction with fixture loading
3. Update assertions to match fixture structure
4. Verify test still validates intended behavior
5. Remove any resulting duplicate tests

## Notes
- Fixture tests should cover general AST processing behavior
- Manual tests should focus on service-specific edge cases
- Keep service dependency mocking separate from AST fixtures
- Document why specific tests are kept as manual tests