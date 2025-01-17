# Test Assessment

## Instructions 

Add all test files and tests to this document in outline form based on your assessment. For example:

## Example categorization
- testfile.test.ts - notes on the file itself (needs to be renamed, needs to be split up etc)
    - "Name of test" - whatever note/comment you want to make here as long as you want to make it 
    - "Name of other test" - another comment 

## Test Files Review Checklist

## Test Reviews

### src/interpreter/__tests__/parser.test.ts
File level issues:
- Missing tests for multiline content (""" syntax) despite implementation in tokenizer
- No separation between tokenizer and parser tests
- Missing error cases for malformed directives
- No tests for logging behavior

Individual test review:
- "should parse text nodes"
    - Basic test but missing edge cases (empty text, whitespace-only text)
    - Location testing is minimal (just checks defined)
    - Good: Tests the core text node parsing functionality

- "should parse directive nodes"
    - Only tests simplest case with name/value
    - Missing tests for complex JSON arguments
    - Missing validation of location details
    - Good: Verifies basic directive structure

- "should preserve locations in parsed nodes"
    - Only tests line numbers, not columns
    - Good test case with mixed content types
    - Missing edge cases (empty lines, whitespace)

- "should throw parse error for invalid syntax"
    - Too minimal - only tests one error case
    - Missing specific error message validation
    - Missing tests for other error scenarios (malformed JSON, etc)

- "should handle nested directives"
    - Tests basic nesting
    - Uses 'any' type cast which is suspicious
    - Missing deep nesting cases
    - Missing validation of all nested properties

Missing test categories:
1. Tokenizer specific tests
    - Multiline content (""")
    - Mixed content types
    - Edge cases (empty lines, pure whitespace)
    
2. Parser specific tests
    - Complex JSON arguments
    - Malformed JSON
    - Invalid directive kinds
    - Nested directive edge cases

3. Location tracking
    - Column numbers
    - Multiline content locations
    - Whitespace handling

4. Error handling
    - Different types of syntax errors
    - JSON parsing errors
    - Nested directive errors

## Good tests for foundational functionality
Tests that are well-organized, correctly placed, and testing the right things at the right level.

- src/interpreter/__tests__/parser.test.ts - Correctly colocated, matches source file name
    - However, seems minimal compared to parser.ts complexity - needs expansion

- src/interpreter/directives/__tests__/*.test.ts - Well organized directive tests
    - Each test file matches its source file (data.test.ts -> data.ts, etc.)
    - Properly colocated in the directives directory
    - Exception: directives.test.ts may be testing index.ts/registry.ts - needs clarification

## Ambiguous / testing too much at once
Tests that are trying to test multiple pieces of functionality or whose scope is unclear.

- src/interpreter/__tests__/test-infrastructure.test.ts - Name doesn't indicate what it's testing
    - Needs review to determine if this should be split into multiple files
    - May need to be renamed to match source file

- src/interpreter/__tests__/nested-directives.test.ts - Tests functionality across multiple components
    - Should potentially be split into separate unit tests for each component
    - Some tests may belong in integration tests

## Mismatches current code
Tests that don't align with current implementation after refactors, or test files that don't match their source files.

- src/interpreter/__tests__/subInterpreter.test.ts - Matches file but may need updates
    - Recent refactors likely affected the subInterpreter functionality
    - Need to verify against current implementation

## Integration Tests Assessment
- tests/integration/cli.test.ts - Properly located
    - Need to verify if some tests from src/cli/__tests__/cli.test.ts should be merged here
    - Possible duplicate test coverage between integration and unit tests

- tests/integration/sdk.test.ts - Properly located
    - Tests the public SDK interface
    - May need expansion as new features are added

## Organization Issues
Tests that are in the wrong location or have structural problems:

### Mock Organization
- Duplicate meld-ast.ts mocks:
    - src/interpreter/__tests__/__mocks__/meld-ast.ts
    - src/interpreter/__mocks__/meld-ast.ts (appears to be unused/obsolete)
    - tests/__mocks__/meld-ast.ts
    - Need to determine which should be global vs local and consolidate

- Global mocks in tests/__mocks__ seem appropriate:
    - setup.ts - Test setup utilities
    - directive-handlers.ts - Mock handlers used across tests
    - md-llm.ts - LLM interface mock
    - state.ts - Global state mock
    - meld-spec.ts - Spec definitions

### Location Problems
Tests that need to be moved:
- src/interpreter/__mocks__ directory appears redundant with __tests__/__mocks__
- src/cli/__tests__/cli.test.ts may have overlap with integration tests
- Empty tests/cli directory - should be removed or populated
- Need to review if any tests in tests/ should be colocated in src/

### Next Steps
1. Resolve mock duplication - consolidate meld-ast.ts mocks
2. Review and potentially split test-infrastructure.test.ts
3. Move appropriate tests from nested-directives.test.ts to integration
4. Update subInterpreter tests to match current implementation
5. Clean up empty/unused test directories
6. Review CLI test organization between unit and integration tests

### src/interpreter/__tests__/test-infrastructure.test.ts
File level issues:
- Name is unclear - this is actually testing test utilities and context management
- Should be renamed to test-utils.test.ts to match source file
- Well structured with clear test groupings
- Good coverage of test infrastructure components

Individual test review:

TestContext group:
- "should create a basic test context"
    - Good: Tests default initialization
    - Missing: Validation of state properties
    - Good: Clear assertions for each property

- "should create a nested test context"
    - Good: Tests parent-child relationship
    - Good: Validates mode changes
    - Missing: Deep nesting scenarios

- "should create handler context with correct properties"
    - Good: Tests context creation with options
    - Missing: Error cases for invalid options
    - Missing: Validation of state inheritance

- "should adjust locations in right-side mode"
    - Good: Tests location adjustment logic
    - Good: Clear expectations for line/column calculations
    - Missing: Edge cases (line 1, negative numbers)

- "should create directive nodes with locations"
    - Good: Tests node creation with location
    - Missing: Validation of directive properties
    - Missing: Error cases for invalid inputs

- "should create text nodes with locations"
    - Good: Basic text node creation
    - Missing: Edge cases (empty text, special characters)
    - Missing: Location validation

Test Utilities group:
- "should create test directives with defaults"
    - Good: Tests default directive creation
    - Missing: Complex directive scenarios
    - Missing: Validation of optional properties

- "should create test locations with defaults"
    - Good: Tests default location creation
    - Missing: Custom location scenarios
    - Missing: Validation of end position

- "should create test state with parent"
    - Good: Tests state inheritance
    - Missing: Deep nesting scenarios
    - Missing: State property validation

- "should create test state with file path"
    - Good: Tests file path handling
    - Missing: Path validation
    - Missing: Error cases for invalid paths

Error Handling group:
- "should preserve error locations in nested contexts"
    - Good: Tests error location adjustment
    - Good: Validates error type and properties
    - Missing: Multiple nesting levels
    - Missing: Different error types
    - Complex test that might need splitting

Recommendations:
1. Rename file to match its source file (test-utils.test.ts)
2. Split into smaller test files:
   - context.test.ts - TestContext related tests
   - test-factories.test.ts - createTest* utility functions
   - error-handling.test.ts - Error adjustment and handling

3. Add missing test categories:
   - Edge cases for location adjustments
   - Deep nesting scenarios
   - Error cases for invalid inputs
   - State inheritance validation

4. Improve type safety:
   - Add type assertions for state properties
   - Validate error types more specifically
   - Add runtime validation for critical properties

5. Add column number verification to all tests
6. Add tests for different error types
7. Add multi-level nesting tests
8. Update tests to be async
9. Add error recovery tests
10. Add error context validation
11. Add whitespace handling tests

### src/interpreter/__tests__/nested-directives.test.ts
File level issues:
- Tests span multiple components (interpreter, directives, state)
- Some tests belong in integration tests
- Well organized into logical groups
- Good error handling coverage

Individual test review:

Basic Nesting group:
- "should handle simple nested directives"
    - Good: Tests basic parent-child relationship
    - Good: Verifies state updates
    - Missing: Validation of node structure
    - Integration test: Tests multiple components together

- "should handle multiple levels of nesting"
    - Good: Tests deep nesting
    - Good: Verifies state at each level
    - Missing: Error cases for max depth
    - Integration test: Tests multiple components together

Location Handling group:
- "should adjust locations in nested directives"
    - Good: Tests location adjustment
    - Good: Error location verification
    - Unit test: Belongs in location handling tests
    - Could be simplified to focus on locations only

State Inheritance group:
- "should inherit parent state in nested directives"
    - Good: Tests state inheritance
    - Good: Variable interpolation
    - Integration test: Combines state and directive testing
    - Should be split into simpler unit tests

- "should handle variable shadowing in nested scopes"
    - Good: Tests scoping rules
    - Good: Complex scenario with multiple levels
    - Integration test: Tests multiple features together
    - Should be split into simpler unit tests

Error Handling group:
- "should handle errors in deeply nested directives"
    - Good: Tests error propagation
    - Good: Location adjustment in errors
    - Integration test: Combines multiple error scenarios
    - Could be split into focused unit tests

Recommendations:
1. Split into separate test files:
   - Unit tests:
     - location-adjustment.test.ts - Location handling
     - state-inheritance.test.ts - State behavior
     - error-propagation.test.ts - Error handling
   
   - Integration tests:
     - nested-directive-integration.test.ts - Multi-component tests
     - directive-inheritance.test.ts - Directive interaction tests

2. Add missing test categories:
   - Maximum nesting depth
   - Circular references
   - Mixed directive types
   - State cleanup after errors

3. Improve test isolation:
   - Mock state management
   - Mock location handling
   - Focus each test on single responsibility

4. Add performance tests:
   - Deep nesting performance
   - Large state objects
   - Complex variable resolution

5. Add column number verification to all tests
6. Add tests for different error types
7. Add multi-level nesting tests
8. Update tests to be async
9. Add error recovery tests
10. Add error context validation
11. Add whitespace handling tests

### src/interpreter/__tests__/subInterpreter.test.ts
File level issues:
- Tests are testing the SubInterpreter class but implementation is now function-based
- Missing tests for adjustNodeLocation function
- No tests for logging behavior
- Missing tests for immutability enforcement
- Good organization into logical groups

Individual test review:

Basic Interpretation group:
- "should interpret text content"
    - Good: Tests basic text parsing
    - Missing: Validation of location properties
    - Missing: Edge cases (empty text, whitespace)
    - Needs update: Should test interpretSubDirectives function

- "should interpret directives"
    - Good: Tests basic directive handling
    - Missing: Complex directive scenarios
    - Missing: Location validation
    - Needs update: Should use new function-based API

Nested Interpretation group:
- "should handle nested content with location adjustment"
    - Good: Tests location adjustment
    - Good: Multi-line content handling
    - Missing: Complex nesting scenarios
    - Needs update: Should test adjustNodeLocation directly

- "should preserve error locations in nested content"
    - Good: Tests error location adjustment
    - Missing: Different error types
    - Missing: Deep nesting error cases
    - Needs update: Should use ErrorFactory.createLocationAwareError

State Management group:
- "should create new state for each interpretation"
    - Good: Tests state isolation
    - Missing: Complex state scenarios
    - Missing: Immutability checks
    - Needs update: Should verify state inheritance chain

- "should inherit parent state when specified"
    - Good: Tests basic inheritance
    - Missing: Deep inheritance chains
    - Missing: Immutability verification
    - Missing: Local vs inherited property tests

Error Handling group:
- "should handle parse errors"
    - Too basic: Only tests one error case
    - Missing: Error location verification
    - Missing: Error message validation
    - Needs update: Should test with new error factory

- "should handle interpretation errors"
    - Too basic: Only tests unknown directive
    - Missing: Various error scenarios
    - Missing: Error propagation tests
    - Needs update: Should verify error adjustment

Missing test categories:
1. Location Adjustment
    - Direct tests of adjustNodeLocation
    - Complex multi-line scenarios
    - Child node location adjustment
    - Edge cases (line 1, negative numbers)

2. State Management
    - Immutability enforcement
    - Deep inheritance chains
    - State cleanup
    - Local vs inherited properties

3. Error Handling
    - Different error types
    - Error location adjustment
    - Error message preservation
    - Stack trace handling

4. Logging
    - Debug log messages
    - Error log messages
    - State change logging
    - Performance logging

Recommendations:
1. Restructure tests to match new function-based API
2. Add dedicated location adjustment tests
3. Expand state management tests
4. Add logging verification
5. Add immutability tests
6. Improve error handling coverage

### src/interpreter/__tests__/interpreter.test.ts
File level issues:
- Tests don't match current async implementation
- Missing tests for context parameter
- No tests for logging behavior
- Good organization into node type groups
- Missing tests for handler execution flow

Individual test review:

Text Nodes group:
- "should handle text nodes"
    - Good: Tests basic text node handling
    - Missing: Multiple text nodes
    - Missing: Location validation
    - Needs update: Should be async
    - Missing: Edge cases (empty text, special chars)

Directive Nodes group:
- "should handle data directives"
    - Good: Tests basic directive execution
    - Missing: Complex directive scenarios
    - Missing: Context validation
    - Needs update: Should be async
    - Missing: Handler execution verification

- "should throw on unknown directives"
    - Good: Tests error case
    - Missing: Error message validation
    - Missing: Context in error
    - Needs update: Should be async
    - Missing: Different directive kinds

Code Fence Nodes group:
- "should handle code fence nodes"
    - Good: Tests basic fence handling
    - Missing: Language validation
    - Missing: Content validation
    - Missing: Complex code scenarios
    - Needs update: Should be async

Nested Interpretation group:
- "should handle nested states correctly"
    - Good: Tests state inheritance
    - Good: Tests state merging
    - Missing: Complex nesting scenarios
    - Missing: Context inheritance
    - Needs update: Should be async

Error Handling group:
- "should preserve error locations"
    - Good: Tests location preservation
    - Missing: Different error types
    - Missing: Context in errors
    - Needs update: Should be async
    - Missing: Handler-specific errors

- "should handle errors in nested contexts"
    - Good: Tests nested error locations
    - Good: Location adjustment
    - Missing: Deep nesting errors
    - Missing: State cleanup after errors
    - Needs update: Should be async

Missing test categories:
1. Handler Context
    - Context inheritance
    - Mode changes
    - Base location handling
    - Current path tracking

2. Handler Execution
    - Handler lookup
    - Handler execution flow
    - Handler result processing
    - Handler error handling

3. State Management
    - State mutations
    - Node accumulation
    - Variable management
    - Change tracking

4. Logging
    - Start/end logs
    - Node processing logs
    - Error logs
    - Performance logs

5. Async Behavior
    - Concurrent execution
    - Error propagation
    - State consistency
    - Handler timing

Recommendations:
1. Update all tests to use async/await
2. Add context parameter tests
3. Add handler execution tests
4. Add logging verification
5. Add concurrent execution tests
6. Improve error handling coverage
7. Add state mutation tracking

### src/interpreter/__tests__/error-locations.test.ts
File level issues:
- Well focused on error location handling
- Good organization by error source
- Missing tests for column numbers in some cases
- Missing tests for some error types
- Tests need async updates

Individual test review:

Nested Directive Errors group:
- "should preserve error location in nested directives"
    - Good: Tests complex nested scenario
    - Good: Verifies line number accuracy
    - Missing: Column number verification
    - Missing: Multiple nesting levels
    - Needs update: Should be async

- "should adjust error locations in right-side mode"
    - Good: Tests location adjustment
    - Good: Line number calculation
    - Missing: Column number adjustment
    - Missing: Multiple base locations
    - Needs update: Should be async

Directive Handler Errors group:
- "should preserve error location in handler errors"
    - Good: Tests handler error locations
    - Good: Full location verification
    - Missing: Different handler types
    - Missing: Nested handler errors
    - Needs update: Should be async

Parser Errors group:
- "should include location in parse errors"
    - Good: Tests basic parse error
    - Missing: Column number verification
    - Missing: Different parse error types
    - Missing: Complex YAML errors
    - Missing: JSON parse errors

Missing test categories:
1. Error Types
    - Syntax errors
    - Validation errors
    - Runtime errors
    - System errors

2. Location Adjustments
    - Multi-level nesting
    - Complex base locations
    - Column adjustments
    - Whitespace handling

3. Error Context
    - Stack traces
    - Error messages
    - Error codes
    - Debug information

4. Error Recovery
    - Partial parsing
    - State cleanup
    - Resource cleanup
    - Error reporting

Recommendations:
1. Add column number verification to all tests
2. Add tests for different error types
3. Add multi-level nesting tests
4. Update tests to be async
5. Add error recovery tests
6. Add error context validation
7. Add whitespace handling tests

### src/interpreter/directives/__tests__/data.test.ts
File level issues:
- Missing tests for canHandle method
- No tests for logging behavior
- Good organization into logical groups
- Missing tests for mode-specific behavior
- Tests need async updates

Individual test review:

Basic Data Handling group:
- "should handle simple data values"
    - Good: Tests basic string value
    - Missing: Location validation
    - Missing: State validation
    - Needs update: Should be async
    - Missing: Mode validation

- "should handle object values"
    - Good: Tests complex object values
    - Missing: Deep object validation
    - Missing: Object mutation checks
    - Needs update: Should be async
    - Missing: Circular references

- "should handle array values"
    - Good: Tests array values
    - Missing: Complex array types
    - Missing: Array mutation checks
    - Needs update: Should be async
    - Missing: Large array handling

Error Handling group:
- "should throw error for missing name"
    - Good: Tests required parameter
    - Missing: Error message validation
    - Missing: Location validation
    - Needs update: Should be async
    - Missing: Context in error

- "should throw error for missing value"
    - Good: Tests required parameter
    - Missing: Error message validation
    - Missing: Location validation
    - Needs update: Should be async
    - Missing: Context in error

- "should preserve error locations in right-side mode"
    - Good: Tests location adjustment
    - Good: Full location verification
    - Missing: Different error types
    - Missing: Multiple nesting levels
    - Needs update: Should be async

Variable Scoping group:
- "should handle variable shadowing"
    - Good: Tests value overwriting
    - Missing: Complex value types
    - Missing: State validation
    - Missing: Change tracking
    - Needs update: Should be async

- "should handle nested scopes"
    - Good: Tests scope isolation
    - Good: Parent/child relationship
    - Missing: Deep nesting
    - Missing: State cleanup
    - Needs update: Should be async

Missing test categories:
1. Handler Capabilities
    - canHandle method
    - Mode support
    - Invalid modes
    - Handler registration

2. Value Types
    - Null values
    - Undefined handling
    - Special types (Date, RegExp, etc)
    - Type coercion

3. State Management
    - State immutability
    - Change tracking
    - State cleanup
    - Variable lifecycle

4. Error Scenarios
    - Invalid value types
    - State errors
    - Nested errors
    - Error recovery

5. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

Recommendations:
1. Add canHandle method tests
2. Add mode-specific tests
3. Add logging verification
4. Update to async/await
5. Add state management tests
6. Add complex value type tests
7. Improve error handling coverage

### src/interpreter/directives/__tests__/define.test.ts
File level issues:
- Missing tests for canHandle method
- No tests for logging behavior
- Good organization into logical groups
- Tests using fn property but implementation uses value
- Missing tests for command options

Individual test review:

Basic Command Definition group:
- "should define simple commands"
    - Good: Tests basic command definition
    - Missing: Location validation
    - Missing: State validation
    - API mismatch: Uses fn instead of value
    - Missing: Command options validation

- "should handle commands with arguments"
    - Good: Tests parameterized commands
    - Missing: Complex argument types
    - Missing: Default arguments
    - API mismatch: Uses fn instead of value
    - Missing: Options validation

Error Handling group:
- "should throw error for missing name"
    - Good: Tests required parameter
    - Missing: Error message validation
    - Missing: Location validation
    - API mismatch: Uses fn instead of value
    - Missing: Context in error

- "should throw error for missing function"
    - Good: Tests required parameter
    - Missing: Error message validation
    - Missing: Location validation
    - API mismatch: Tests fn instead of value
    - Missing: Context in error

- "should preserve error locations in right-side mode"
    - Good: Tests location adjustment
    - Good: Full location verification
    - Missing: Different error types
    - Missing: Multiple nesting levels
    - Missing: Error context validation

Command Scoping group:
- "should handle command shadowing"
    - Good: Tests command overwriting
    - Missing: Complex command scenarios
    - Missing: State validation
    - Missing: Change tracking
    - API mismatch: Uses fn instead of value

- "should handle nested scopes"
    - Good: Tests scope isolation
    - Good: Parent/child relationship
    - Missing: Deep nesting
    - Missing: State cleanup
    - Missing: Command inheritance

Command Execution group:
- "should handle command errors"
    - Good: Tests error propagation
    - Missing: Error types
    - Missing: Error location
    - Missing: State after error
    - Missing: Error context

- "should preserve this context in commands"
    - Good: Tests context binding
    - Missing: Complex contexts
    - Missing: Inheritance chain
    - Missing: Scope validation
    - API mismatch: Uses fn instead of value

Missing test categories:
1. Handler Capabilities
    - canHandle method
    - Mode support
    - Invalid modes
    - Handler registration

2. Command Options
    - Option validation
    - Default options
    - Option inheritance
    - Option overrides

3. State Management
    - Command immutability
    - Change tracking
    - State cleanup
    - Command lifecycle

4. Error Scenarios
    - Invalid command types
    - State errors
    - Nested errors
    - Error recovery

5. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

6. Command Types
    - Async commands
    - Generator commands
    - Bound commands
    - Command composition

Recommendations:
1. Update tests to use value instead of fn property
2. Add canHandle method tests
3. Add command options tests
4. Add logging verification
5. Add state management tests
6. Add async command tests
7. Improve error handling coverage
8. Add command type validation

### src/interpreter/directives/__tests__/directives.test.ts
File level issues:
- Missing tests for built-in handler initialization
- No tests for logging behavior
- Missing tests for handler validation
- Good organization into logical groups
- Missing tests for handler lifecycle

Individual test review:

Registration group:
- "should register and find handlers"
    - Good: Tests basic registration flow
    - Missing: Handler validation
    - Missing: Duplicate registration
    - Missing: Handler initialization
    - Missing: Logging verification

- "should handle multiple handlers"
    - Good: Tests multiple registrations
    - Missing: Handler conflicts
    - Missing: Order validation
    - Missing: Handler removal
    - Missing: State validation

Handler Execution group:
- "should execute handlers with correct context"
    - Good: Tests context passing
    - Missing: Context validation
    - Missing: State changes
    - Missing: Return values
    - Missing: Async execution

- "should handle right-side mode correctly"
    - Good: Tests mode-specific behavior
    - Good: Context inheritance
    - Missing: Mode validation
    - Missing: Mode transitions
    - Missing: Invalid modes

Error Handling group:
- "should handle missing handlers gracefully"
    - Good: Tests undefined handler case
    - Missing: Error logging
    - Missing: State validation
    - Missing: Recovery behavior
    - Missing: Error context

- "should preserve error locations from handlers"
    - Good: Tests error propagation
    - Good: Error type checking
    - Missing: Location validation
    - Missing: Error context
    - Missing: Stack traces

Missing test categories:
1. Handler Initialization
    - Built-in handler setup
    - Custom handler registration
    - Handler validation
    - Initialization errors

2. Handler Lifecycle
    - Registration order
    - Handler removal
    - Handler updates
    - Cleanup

3. Mode Support
    - Mode validation
    - Mode transitions
    - Invalid modes
    - Mode inheritance

4. Registry State
    - State consistency
    - Concurrent access
    - State cleanup
    - State validation

5. Logging
    - Registration logs
    - Error logs
    - Debug logs
    - Performance logs

6. Error Scenarios
    - Invalid handlers
    - Registration errors
    - Execution errors
    - Recovery behavior

7. Performance
    - Handler lookup
    - Multiple handlers
    - Concurrent execution
    - Memory usage

Recommendations:
1. Add built-in handler initialization tests
2. Add handler validation tests
3. Add logging verification
4. Add handler lifecycle tests
5. Add mode validation tests
6. Add state consistency tests
7. Add performance tests
8. Improve error handling coverage

### src/interpreter/directives/__tests__/embed.test.ts
File level issues:
- Missing tests for canHandle method
- No tests for logging behavior
- Good mocking setup for fs and path
- Tests using path property but implementation uses content
- Missing tests for state merging

Individual test review:

Basic Embedding group:
- "should embed file content"
    - Good: Tests basic file embedding
    - Missing: Location validation
    - API mismatch: Uses path instead of content
    - Missing: State validation
    - Missing: Node property validation

- "should handle missing files"
    - Good: Tests error case
    - Missing: Error message validation
    - Missing: Error context
    - API mismatch: Uses path instead of content
    - Missing: State cleanup validation

Location Handling group:
- "should adjust locations in right-side mode"
    - Good: Tests location adjustment
    - Good: Full location verification
    - Missing: Complex content scenarios
    - API mismatch: Uses path instead of content
    - Missing: Multiple adjustments

- "should preserve error locations"
    - Good: Tests error location preservation
    - Good: Location verification
    - Missing: Different error types
    - Missing: Error context
    - Missing: State validation

Nested Embedding group:
- "should handle nested embedded content"
    - Good: Tests nested embedding
    - Missing: Deep nesting validation
    - Missing: State inheritance
    - API mismatch: Uses path instead of content
    - Missing: Location adjustments

- "should prevent circular embedding"
    - Good: Tests circular reference detection
    - Missing: Complex circular scenarios
    - Missing: Error details validation
    - Missing: State cleanup
    - Missing: Location validation

Missing test categories:
1. Handler Capabilities
    - canHandle method
    - Mode support
    - Invalid modes
    - Handler registration

2. Content Processing
    - Content types
    - Content validation
    - Content transformation
    - Content caching

3. State Management
    - State merging
    - State inheritance
    - State cleanup
    - Change tracking

4. Error Scenarios
    - Invalid content
    - State errors
    - Nested errors
    - Error recovery

5. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

6. File System
    - Path resolution
    - File access errors
    - Directory traversal
    - Symlink handling

7. Performance
    - Large file handling
    - Deep nesting
    - Memory usage
    - Caching

Recommendations:
1. Update tests to use content instead of path property
2. Add canHandle method tests
3. Add logging verification
4. Add state merging tests
5. Add file system edge cases
6. Add performance tests
7. Improve error handling coverage
8. Add content validation tests

### src/interpreter/directives/__tests__/import.test.ts
File level issues:
- Missing tests for canHandle method
- No tests for logging behavior
- Good mocking setup for fs and path
- Tests using source property but implementation uses from
- Missing tests for import specifiers

Individual test review:

Basic Import group:
- "should handle import directives"
    - Good: Tests basic file import
    - Missing: Location validation
    - API mismatch: Uses source instead of from
    - Missing: State validation
    - Missing: Import specifier validation

- "should handle nested imports"
    - Good: Tests nested file structure
    - Missing: Deep nesting validation
    - Missing: State inheritance
    - API mismatch: Uses source instead of from
    - Missing: Location adjustments

Error Handling group:
- "should throw on missing source"
    - Good: Tests required parameter
    - Missing: Error message validation
    - Missing: Location validation
    - API mismatch: Tests source instead of from
    - Missing: Context in error

- "should throw on file not found"
    - Good: Tests file system error
    - Missing: Error details validation
    - Missing: State cleanup
    - Missing: Error context
    - Missing: Location validation

Path Resolution group:
- "should handle relative paths"
    - Good: Tests path resolution
    - Good: Mock implementation
    - Missing: Complex paths
    - Missing: Edge cases
    - Missing: Error scenarios

Missing test categories:
1. Handler Capabilities
    - canHandle method
    - Mode support
    - Invalid modes
    - Handler registration

2. Import Specifiers
    - Import all (*)
    - Specific imports
    - Import aliases
    - Invalid specifiers

3. State Management
    - Variable merging
    - State inheritance
    - State cleanup
    - Change tracking

4. Error Scenarios
    - Parse errors
    - Circular imports
    - Invalid content
    - Error recovery

5. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

6. File System
    - Absolute paths
    - Symlinks
    - Directory traversal
    - File permissions

7. Performance
    - Large file imports
    - Deep nesting
    - Memory usage
    - Import caching

Recommendations:
1. Update tests to use from instead of source property
2. Add canHandle method tests
3. Add import specifier tests
4. Add logging verification
5. Add state management tests
6. Add file system edge cases
7. Add performance tests
8. Improve error handling coverage

### src/interpreter/directives/__tests__/path.test.ts
File level issues:
- Missing tests for canHandle method
- No tests for logging behavior
- Good mocking setup for path module
- Missing tests for special path variables ($HOMEPATH, $PROJECTPATH)
- Missing tests for path normalization

Individual test review:

Basic Path Handling group:
- "should handle absolute paths"
    - Good: Tests basic absolute path
    - Missing: Location validation
    - Missing: State validation
    - Missing: Path normalization
    - Missing: Special characters

- "should handle relative paths"
    - Good: Tests basic relative path
    - Good: Path resolution
    - Missing: Complex relative paths
    - Missing: State validation
    - Missing: Edge cases

- "should handle parent directory paths"
    - Good: Tests parent directory (..)
    - Good: Path resolution
    - Missing: Multiple levels
    - Missing: Edge cases
    - Missing: Error scenarios

Error Handling group:
- "should throw error for missing name"
    - Good: Tests required parameter
    - Missing: Error message validation
    - Missing: Location validation
    - Missing: Error context
    - Missing: State cleanup

- "should throw error for missing value"
    - Good: Tests required parameter
    - Missing: Error message validation
    - Missing: Location validation
    - Missing: Error context
    - Missing: State cleanup

- "should preserve error locations in right-side mode"
    - Good: Tests location adjustment
    - Good: Full location verification
    - Missing: Different error types
    - Missing: Multiple nesting levels
    - Missing: Error context

Path Resolution group:
- "should resolve paths relative to current file"
    - Good: Tests current file context
    - Good: Path resolution
    - Missing: Complex scenarios
    - Missing: Edge cases
    - Missing: Error scenarios

- "should handle path variables in values"
    - Good: Tests variable substitution
    - Missing: Complex substitutions
    - Missing: Missing variables
    - Missing: Circular references
    - Missing: Error scenarios

Missing test categories:
1. Handler Capabilities
    - canHandle method
    - Mode support
    - Invalid modes
    - Handler registration

2. Special Variables
    - $HOMEPATH handling
    - $~ handling
    - $PROJECTPATH handling
    - Custom variables

3. Path Normalization
    - Duplicate separators
    - Mixed separators
    - Symbolic links
    - Case sensitivity

4. State Management
    - Path variable scoping
    - Variable overwriting
    - State cleanup
    - Change tracking

5. Error Scenarios
    - Invalid paths
    - Invalid variables
    - Circular references
    - Permission issues

6. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

7. Platform Specifics
    - Windows paths
    - Unix paths
    - Network paths
    - UNC paths

Recommendations:
1. Add canHandle method tests
2. Add special variable tests
3. Add path normalization tests
4. Add logging verification
5. Add platform-specific tests
6. Add error handling coverage
7. Add state management tests
8. Add security tests

### src/interpreter/directives/__tests__/run.test.ts
File level issues:
- Missing tests for canHandle method
- No tests for logging behavior
- Good mocking setup for exec and promisify
- Missing tests for background execution
- Missing tests for working directory handling

Individual test review:

Basic Command Execution group:
- "should handle run directives with command"
    - Good: Tests basic command execution
    - Missing: Location validation
    - Missing: State validation
    - Missing: Background execution
    - Missing: Working directory validation

- "should handle run directives with variables"
    - Good: Tests variable substitution
    - Missing: Complex variables
    - Missing: Variable errors
    - Missing: State validation
    - Missing: Location validation

Error Handling group:
- "should throw on missing command"
    - Good: Tests required parameter
    - Missing: Error message validation
    - Missing: Location validation
    - Missing: Error context
    - Missing: State cleanup

- "should handle command errors"
    - Good: Tests command failure
    - Missing: Error details validation
    - Missing: State cleanup
    - Missing: Error context
    - Missing: Location validation

Output Handling group:
- "should handle stderr output"
    - Good: Tests stderr capture
    - Missing: Mixed stdout/stderr
    - Missing: Large output
    - Missing: Output encoding
    - Missing: Error scenarios

- "should handle working directory"
    - Good: Tests cwd context
    - Missing: Directory validation
    - Missing: Path resolution
    - Missing: Directory errors
    - Missing: State validation

Missing test categories:
1. Handler Capabilities
    - canHandle method
    - Mode support
    - Invalid modes
    - Handler registration

2. Command Execution
    - Background execution
    - Process signals
    - Environment variables
    - Timeouts

3. State Management
    - Command output storage
    - State cleanup
    - Variable scope
    - Change tracking

4. Error Scenarios
    - Permission errors
    - Timeout errors
    - Signal errors
    - Resource errors

5. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

6. Security
    - Command injection
    - Path traversal
    - Permission validation
    - Resource limits

7. Platform Specifics
    - Shell differences
    - Path separators
    - Command availability
    - Environment setup

Recommendations:
1. Add canHandle method tests
2. Add background execution tests
3. Add logging verification
4. Add security validation tests
5. Add platform-specific tests
6. Add resource management tests
7. Improve error handling coverage
8. Add state management tests

### src/interpreter/state/__tests__/state.test.ts
File level issues:
- No tests for logging behavior
- Missing tests for cloning functionality
- Good organization into logical groups
- Missing tests for concurrent access
- Missing tests for memory management

Individual test review:

Text Variables group:
- "should store and retrieve text variables"
    - Good: Tests basic variable storage
    - Missing: Variable validation
    - Missing: Type checking
    - Missing: Logging verification
    - Missing: Memory cleanup

- "should return undefined for non-existent text variables"
    - Good: Tests missing variable case
    - Missing: Parent state check
    - Missing: Error logging
    - Missing: State validation
    - Missing: Cleanup verification

- "should track local changes when setting text variables"
    - Good: Tests change tracking
    - Good: Change format validation
    - Missing: Multiple changes
    - Missing: Change order
    - Missing: Change cleanup

Data Variables group:
- "should store and retrieve data variables"
    - Good: Tests basic data storage
    - Missing: Deep object validation
    - Missing: Type checking
    - Missing: Memory management
    - Missing: Circular references

- "should return undefined for non-existent data variables"
    - Good: Tests missing variable case
    - Missing: Parent state check
    - Missing: Error logging
    - Missing: State validation
    - Missing: Cleanup verification

- "should track local changes when setting data variables"
    - Good: Tests change tracking
    - Good: Change format validation
    - Missing: Complex data types
    - Missing: Change order
    - Missing: Change cleanup

Path Variables group:
- "should store and retrieve path variables"
    - Good: Tests basic path storage
    - Missing: Path validation
    - Missing: Path normalization
    - Missing: Platform specifics
    - Missing: Security checks

- "should return undefined for non-existent path variables"
    - Good: Tests missing variable case
    - Missing: Parent state check
    - Missing: Error logging
    - Missing: State validation
    - Missing: Cleanup verification

Nodes group:
- "should store and retrieve nodes"
    - Good: Tests basic node storage
    - Missing: Node validation
    - Missing: Node ordering
    - Missing: Memory management
    - Missing: Node cleanup

- "should track local changes when adding nodes"
    - Good: Tests change tracking
    - Good: Change format validation
    - Missing: Multiple nodes
    - Missing: Node order
    - Missing: Change cleanup

Imports group:
- "should store and retrieve imports"
    - Good: Tests basic import tracking
    - Missing: Path validation
    - Missing: Circular imports
    - Missing: Import order
    - Missing: Import cleanup

- "should not add duplicate imports"
    - Good: Tests duplicate prevention
    - Missing: Case sensitivity
    - Missing: Path normalization
    - Missing: State validation
    - Missing: Memory cleanup

Immutability group:
- "should prevent modification when immutable"
    - Good: Tests basic immutability
    - Missing: Deep immutability
    - Missing: Parent state effects
    - Missing: Error details
    - Missing: State recovery

Parent State group:
- "should inherit from parent state"
    - Good: Tests basic inheritance
    - Missing: Deep inheritance
    - Missing: Circular references
    - Missing: Memory leaks
    - Missing: State cleanup

- "should override parent values"
    - Good: Tests value overriding
    - Missing: Complex types
    - Missing: Inheritance chain
    - Missing: Memory management
    - Missing: State validation

Missing test categories:
1. Cloning
    - Deep cloning
    - Reference handling
    - Memory management
    - State validation

2. Concurrent Access
    - Race conditions
    - State consistency
    - Lock management
    - Error recovery

3. Memory Management
    - Resource cleanup
    - Memory leaks
    - Large state handling
    - Garbage collection

4. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

5. Error Handling
    - Invalid states
    - Corrupt data
    - Recovery strategies
    - Error propagation

6. Performance
    - Large state trees
    - Deep inheritance
    - Memory usage
    - Operation timing

7. Security
    - State isolation
    - Data validation
    - Access control
    - Resource limits

Recommendations:
1. Add cloning tests
2. Add concurrent access tests
3. Add memory management tests
4. Add logging verification
5. Add performance tests
6. Add security validation
7. Improve error handling coverage
8. Add cleanup verification

### src/interpreter/utils/__tests__/location.test.ts
File level issues:
- Missing tests for edge cases
- No tests for error handling
- Good test organization
- Missing tests for invalid inputs
- Missing tests for special cases

Individual test review:

Undefined Handling group:
- "returns undefined if location is undefined"
    - Good: Tests undefined location
    - Missing: Error logging
    - Missing: Error context
    - Missing: State validation
    - Missing: Type checking

- "returns undefined if baseLocation is undefined"
    - Good: Tests undefined base location
    - Missing: Error logging
    - Missing: Error context
    - Missing: State validation
    - Missing: Type checking

Single Line Adjustment group:
- "adjusts single-line location correctly"
    - Good: Tests basic adjustment
    - Good: Column calculation
    - Missing: Edge cases
    - Missing: Validation
    - Missing: Error scenarios

Multi Line Adjustment group:
- "adjusts multi-line location correctly"
    - Good: Tests multi-line case
    - Good: Line/column calculations
    - Missing: Complex scenarios
    - Missing: Edge cases
    - Missing: Error handling

Column Adjustment group:
- "only adjusts column for first line"
    - Good: Tests column adjustment rule
    - Good: Line calculation
    - Missing: Edge cases
    - Missing: Validation
    - Missing: Error scenarios

Missing test categories:
1. Edge Cases
    - Zero line numbers
    - Negative numbers
    - Large numbers
    - Invalid positions

2. Error Handling
    - Invalid locations
    - Type errors
    - Range errors
    - Recovery strategies

3. Special Cases
    - Empty ranges
    - Overlapping ranges
    - Reversed ranges
    - Zero-width ranges

4. Input Validation
    - Type checking
    - Range validation
    - Property validation
    - Format validation

5. Performance
    - Large line numbers
    - Many adjustments
    - Memory usage
    - Calculation speed

6. Integration
    - Multiple adjustments
    - Nested adjustments
    - Chained adjustments
    - Concurrent adjustments

7. Documentation
    - JSDoc validation
    - Example validation
    - Error message validation
    - Type definition validation

Recommendations:
1. Add edge case tests
2. Add error handling tests
3. Add special case tests
4. Add input validation
5. Add performance tests
6. Add integration tests
7. Add documentation tests
8. Improve test coverage

### tests/integration/cli.test.ts
File level issues:
- Missing tests for error logging
- Good mocking setup for fs and path
- Missing tests for process.exit behavior
- Missing tests for argument parsing edge cases
- Missing tests for real file system interaction

Individual test review:

Format Conversion group:
- "should output llm format by default"
    - Good: Tests default format
    - Missing: Output validation
    - Missing: Error handling
    - Missing: State validation
    - Missing: Format details

- "should handle format aliases correctly"
    - Good: Tests format option
    - Missing: All format aliases
    - Missing: Error cases
    - Missing: Output validation
    - Missing: Format validation

- "should preserve markdown with md format"
    - Good: Tests markdown preservation
    - Missing: Complex markdown
    - Missing: Format validation
    - Missing: Error cases
    - Missing: Output validation

Command Line Options group:
- "should respect --stdout option"
    - Good: Tests stdout output
    - Missing: Output validation
    - Missing: Error cases
    - Missing: Process state
    - Missing: Stream handling

- "should use default output path when not specified"
    - Good: Tests default behavior
    - Missing: Path validation
    - Missing: File system checks
    - Missing: Error cases
    - Missing: State validation

- "should handle multiple format options correctly"
    - Good: Tests multiple formats
    - Missing: Format combinations
    - Missing: Error cases
    - Missing: Output validation
    - Missing: Format order

File Handling group:
- "should handle all supported file extensions"
    - Good: Tests file extensions
    - Missing: Case sensitivity
    - Missing: Path validation
    - Missing: Error cases
    - Missing: File content

- "should reject unsupported file extensions"
    - Good: Tests invalid extensions
    - Missing: Error details
    - Missing: State cleanup
    - Missing: Process exit
    - Missing: Error logging

- "should handle missing input files"
    - Good: Tests file not found
    - Missing: Error details
    - Missing: Path validation
    - Missing: State cleanup
    - Missing: Error logging

Complex Content group:
- "should handle meld directives with format conversion"
    - Good: Tests directive handling
    - Missing: Complex directives
    - Missing: Format validation
    - Missing: Error cases
    - Missing: State validation

Missing test categories:
1. Argument Parsing
    - Invalid arguments
    - Missing arguments
    - Extra arguments
    - Argument order

2. Process Management
    - Exit codes
    - Signal handling
    - Environment variables
    - Process cleanup

3. File System
    - File permissions
    - Directory creation
    - Path resolution
    - File locking

4. Error Handling
    - Parse errors
    - Runtime errors
    - System errors
    - Recovery strategies

5. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

6. Format Handling
    - Format validation
    - Format conversion
    - Format options
    - Custom formats

7. Integration
    - Real file system
    - Process interaction
    - Stream handling
    - System resources

Recommendations:
1. Add argument parsing tests
2. Add process management tests
3. Add file system tests
4. Add error handling tests
5. Add logging verification
6. Add format validation tests
7. Add real file system tests
8. Add process cleanup tests

### tests/integration/sdk.test.ts
File level issues:
- Missing tests for logging behavior
- Good mocking setup for fs and path
- Missing tests for metadata options
- Missing tests for initialState option
- Missing tests for error propagation

Individual test review:

Format Conversion group:
- "should convert to llm format by default"
    - Good: Tests default format
    - Missing: Output validation
    - Missing: Error handling
    - Missing: State validation
    - Missing: Format details

- "should preserve markdown when format is md"
    - Good: Tests markdown format
    - Missing: Complex markdown
    - Missing: Format validation
    - Missing: Error cases
    - Missing: Output validation

- "should handle complex meld content with directives"
    - Good: Tests directive handling
    - Missing: Complex directives
    - Missing: State validation
    - Missing: Error cases
    - Missing: Format validation

Full Pipeline Integration group:
- "should handle the complete parse -> interpret -> convert pipeline"
    - Good: Tests full pipeline
    - Missing: State validation
    - Missing: Error propagation
    - Missing: Performance
    - Missing: Resource cleanup

- "should preserve state across the pipeline"
    - Good: Tests state preservation
    - Missing: Complex state
    - Missing: State validation
    - Missing: Memory leaks
    - Missing: State cleanup

Error Handling group:
- "should handle parse errors gracefully"
    - Good: Tests parse errors
    - Missing: Error details
    - Missing: State cleanup
    - Missing: Error logging
    - Missing: Recovery behavior

- "should handle missing files correctly"
    - Good: Tests file not found
    - Missing: Error details
    - Missing: Path validation
    - Missing: Error logging
    - Missing: Recovery behavior

- "should handle empty files"
    - Good: Tests empty content
    - Missing: State validation
    - Missing: Output validation
    - Missing: Error cases
    - Missing: Resource cleanup

Edge Cases group:
- "should handle mixed content types correctly"
    - Good: Tests mixed content
    - Missing: Content validation
    - Missing: State validation
    - Missing: Error cases
    - Missing: Format validation

- "should preserve whitespace appropriately"
    - Good: Tests whitespace
    - Missing: Complex whitespace
    - Missing: Format validation
    - Missing: Output validation
    - Missing: Edge cases

Missing test categories:
1. Options Handling
    - Metadata options
    - Initial state
    - Format options
    - Custom options

2. State Management
    - State initialization
    - State persistence
    - State cleanup
    - Memory management

3. Error Handling
    - Parse errors
    - Interpret errors
    - Format errors
    - Recovery strategies

4. Performance
    - Large files
    - Complex content
    - Memory usage
    - Operation timing

5. Logging
    - Debug messages
    - Error messages
    - Info messages
    - Performance logging

6. Resource Management
    - File handles
    - Memory cleanup
    - State cleanup
    - System resources

7. Integration
    - Real file system
    - Format conversion
    - Error propagation
    - Pipeline stages

Recommendations:
1. Add options handling tests
2. Add state management tests
3. Add error handling tests
4. Add performance tests
5. Add logging verification
6. Add resource management tests
7. Add real file system tests
8. Add pipeline validation tests


