# Science Notebook 

This is a science notebook for investigating and deducing root causes and correct fixes for issues and failing tests. Be factual and deliberate. No guessing. Log all your learnings and failures here.

## Investigation Template

<Template>

### Issue Name
#### Symptom
- What is failing and how?

#### Evidence Collection
1. Test Failure Output
   ```diff
   - Expected
   + Actual
   ```
2. Related Code Analysis
   - Relevant files/functions
   - Current behavior
   - Expected behavior

#### Assumptions
- List of assumptions we're making about how things should work
- Potential incorrect assumptions to challenge

#### Investigation Plan
1. Logging/Debugging Steps
   - [ ] Specific logging to add
   - [ ] Areas to add breakpoints
   - [ ] Data to collect

2. Questions to Answer
   - [ ] Key questions about behavior
   - [ ] Edge cases to verify

#### Fix Attempts
1. Attempt #1 - DATE
   - Hypothesis: Why we think this will fix it
   - Changes Made: What we changed
   - Result: What happened
   - Conclusion: What we learned

2. Attempt #2 - DATE
   ...

#### Current Status
- Summary of where we are
- Next steps

</Template>

### Directive Handler Test Failures
#### Symptom
- Multiple test files are failing with two distinct types of errors:
  1. File not found errors for `path.js`
  2. TypeError: `state.clear is not a function` in define.test.ts

#### Evidence Collection
1. Test Failure Output
   ```
   Error: Failed to load url ./path.js (resolved id: ./path.js) in /Users/adam/dev/meld/src/interpreter/directives/registry.ts
   TypeError: state.clear is not a function at src/interpreter/directives/__tests__/define.test.ts:9:11
   ```

2. Related Code Analysis
   - Relevant files:
     - src/interpreter/directives/pathDirective.ts (exists)
     - src/interpreter/directives/registry.ts (imports from path.js)
     - src/interpreter/directives/__tests__/define.test.ts (uses state.clear)
   - Current behavior:
     - Registry tries to import from path.js but file is named pathDirective.ts
     - Tests try to call state.clear() but method doesn't exist
   - Expected behavior:
     - Registry should import from correct file path
     - InterpreterState should have a clear method for test setup

#### Assumptions
- The pathDirective.ts file was renamed to path.ts but imports weren't updated
- InterpreterState class should have a clear method for resetting state between tests
- All directive handlers follow same test pattern of clearing state between tests

#### Investigation Plan
1. Code Analysis Steps
   - [x] Verify pathDirective.ts exists and contains expected code
   - [x] Check all imports of path handler in codebase
   - [x] Review InterpreterState class implementation
   - [x] Review other directive handler tests for state management patterns

2. Questions to Answer
   - [x] Is pathDirective.ts the only file with incorrect import path?
   - [x] Do other tests use state.clear() or different reset pattern?
   - [x] What's the correct way to reset state between tests?

#### Fix Attempts
1. Attempt #1 - Current
   - Hypothesis: Renaming pathDirective.ts to path.ts will fix import errors
   - Changes Made: 
     - Renamed pathDirective.ts to path.ts
     - Updated define.test.ts to use new state instance and DirectiveRegistry.clear()
   - Result: 
     - Still getting "Cannot register null or undefined handler" errors
   - Conclusion: 
     - File rename alone is not sufficient
     - Need to investigate module resolution in test environment

2. Attempt #2 - Current
   - Hypothesis: Module resolution in test environment is not handling .ts/.js correctly
   - Evidence:
     - tsconfig.json uses "module": "NodeNext" and "moduleResolution": "NodeNext"
     - vitest.config.ts has tsconfigPaths plugin
     - Imports use .js extension but files are .ts
   - Next steps:
     - Check if we need to update import extensions
     - Verify module resolution settings in vitest config
     - Consider adding path aliases for test environment

3. Attempt #3 - Current
   - Hypothesis: Type mismatch between directive kinds is causing handler registration to fail
   - Evidence:
     - TypeScript errors show mismatch between DirectiveKind type and string literals
     - Example error: `This comparison appears to be unintentional because the types 'DirectiveKind' and '"@path"' have no overlap`
     - Similar errors in multiple directive handlers
   - Next steps:
     - Check DirectiveKind type definition
     - Update directive handlers to use correct type
     - Update tests to use correct directive kind values

#### Current Status
- Fixed state management in test files:
  - Removed state.clear() usage
  - Now creating new state instance in beforeEach
  - Using DirectiveRegistry.clear() for registry reset

- Found type mismatch issues:
  - DirectiveKind type doesn't match string literals used in code
  - Handlers use '@path' but type expects 'path'
  - Need to update all directive handlers and tests

- Module resolution strategy change:
  - Moving from ESM-first to CommonJS-first approach:
    1. Remove `"type": "module"` from package.json
    2. Use CommonJS for development and main build
    3. Add separate ESM build for modern consumers
    4. Support both via package.json exports field
  - Benefits:
    1. Simpler development (no .js extensions in imports)
    2. Better tooling compatibility
    3. Still supports all consumer types
    4. Cleaner TypeScript configuration

- Next steps:
  1. Update package.json:
     - Remove `"type": "module"`
     - Add exports field for dual-module support
     - Add build scripts for both CJS and ESM
  2. Update imports to remove .js extensions
  3. Check DirectiveKind type definition in meld-spec
  4. Update directive handlers to use correct type
  5. Update tests to use correct directive kind values

# Investigation Log

## Directive Handler Test Failures

### Symptoms
- Multiple test files failing with various issues:
  - "Cannot register null or undefined handler" errors in import and embed tests
  - Mismatch between directive prefixes (`@data` vs `data`) in tests
  - File not found errors in CLI tests
  - Location handling issues in subInterpreter tests

### Evidence Collection
1. Test output shows:
   - 11 test suites failing, 4 passing
   - Specific failures in:
     - `tests/integration/cli.test.ts`
     - `tests/integration/sdk.test.ts`
     - `src/interpreter/__tests__/subInterpreter.test.ts`
     - `src/interpreter/directives/__tests__/data.test.ts`
     - `src/interpreter/directives/__tests__/embed.test.ts`
     - `src/interpreter/directives/__tests__/import.test.ts`

2. Code inspection revealed:
   - Directive handlers inconsistently handling prefixed vs unprefixed directives
   - Import and embed handlers needed updates for proper instance exports
   - CLI tests needed proper mocking of `fs` and `path` modules

### Investigation Plan
1. ✓ Check directive handler registration in registry
2. ✓ Review directive kind handling across all handlers
3. ✓ Verify test mocks for file system operations
4. ✓ Analyze subInterpreter test implementation

### Fix Attempts
1. ✓ Updated CLI test mocks:
   - Added proper mocks for `fs.existsSync` and `path.resolve`
   - Implemented mock file content handling

2. ✓ Fixed directive handler implementations:
   - Updated `DataDirectiveHandler` to handle both `@data` and `data`
   - Updated `ImportDirectiveHandler` to handle both `@import` and `import`
   - Updated `EmbedDirectiveHandler` to handle both `@embed` and `embed`

3. ✓ Fixed subInterpreter test mocks:
   - Corrected mock implementation for `parseMeld`
   - Added proper location handling in mocked nodes

### Module Resolution Understanding
- Node.js requires explicit file extensions in ES Modules when `"type": "module"` is set
- Even with TypeScript source files, compiled output is JavaScript, requiring `.js` extensions
- This ensures compatibility during both development and after compilation

### Current Status
1. ✓ Fixed directive prefix handling:
   - All handlers now accept both prefixed and unprefixed versions
   - Tests updated to reflect this behavior

2. ✓ Fixed handler registration:
   - Import and embed handlers properly exported as instances
   - Registry correctly handling all directive types

3. ✓ Fixed CLI test mocks:
   - File system operations properly mocked
   - Path resolution working correctly

4. Remaining Issues:
   - SubInterpreter tests still showing location handling issues
   - Integration tests need review for mock content

### Next Steps
1. Review and fix remaining subInterpreter test failures
2. Update integration tests with proper mock content
3. Consider adding more comprehensive test coverage for edge cases
4. Document the directive prefix handling strategy for future reference

### Lessons Learned
1. Importance of consistent directive prefix handling across the codebase
2. Need for comprehensive mocking in file system operations
3. Value of maintaining test isolation through proper state management
4. Benefits of documenting investigation process in real-time

## File System Mocking Issues

### Symptoms
- Multiple test files failing with file system related errors:
  - "No 'existsSync' export is defined on the 'fs' mock"
  - "File not found" errors in import and embed handlers
  - Inconsistent behavior between CLI and SDK tests

### Evidence Collection
1. Test output shows:
   - CLI tests failing to find files
   - Import handler unable to verify file existence
   - Embed handler failing with file system errors

2. Code inspection revealed:
   - Direct imports from 'fs' in handlers: `import { existsSync, readFileSync } from 'fs'`
   - Inconsistent mocking patterns across test files
   - Some tests using `vi.mock('fs')` while others import from 'fs/promises'

### Investigation Plan
1. ✓ Review all file system operations in handlers
2. ✓ Analyze mocking patterns in test files
3. ✓ Standardize mock implementations

### Fix Attempts
1. ✓ Updated import handlers to use namespace imports:
   - Changed `import { existsSync } from 'fs'` to `import * as fs from 'fs'`
   - Updated all fs operations to use namespace (e.g., `fs.existsSync`)
   - This ensures consistent mocking across the codebase

2. ✓ Standardized mock implementations:
   - CLI tests now properly mock both `fs` and `fs/promises`
   - SDK tests use consistent mocking pattern with `tmpdir`
   - Import and embed tests use same mock structure

3. ✓ Fixed test isolation:
   - Added proper `beforeEach` and `afterEach` cleanup
   - Ensured mocks are cleared between tests
   - Implemented consistent temporary directory handling

### Lessons Learned
1. Namespace imports provide better mockability than destructured imports
2. Test isolation requires careful cleanup of file system mocks
3. Consistent mocking patterns across test files reduces confusion
4. Using `tmpdir` for file operations in tests improves reliability

### Current Status
1. ✓ Fixed fs module mocking:
   - All handlers using namespace imports
   - Tests properly mocking file system operations
   - Consistent error handling for file operations

2. ✓ Standardized test patterns:
   - Common mock implementation across test files
   - Proper test isolation and cleanup
   - Reliable file existence checks

3. Remaining Issues:
   - Some integration tests may need more comprehensive mock data
   - Consider adding more edge cases for file system errors

### Next Steps
1. Review remaining integration tests for completeness
2. Add tests for concurrent file operations
3. Consider adding mock filesystem for more complex scenarios
4. Document file system mocking patterns for future contributors

### Test Status Update

#### Current Test Results
- Total Tests: 122
- Passed: 73
- Failed: 49
- Test Files: 15 (9 passed, 6 failed)

#### Remaining Issues

1. CLI Test Failures:
   - File system mocks not properly set up
   - Missing exports for `fs.promises` and `path.resolve`
   - File not found errors in validation

2. SDK Test Failures:
   - Similar file system mock issues
   - Missing `fs.promises` exports
   - Need proper mock setup for file operations

3. SubInterpreter Test Failures:
   - Location handling issues
   - State merging problems
   - Parse errors in nested directives

4. Embed Handler Test Failures:
   - Path validation issues
   - Error message mismatches
   - Missing mock file content

5. Import Handler Test Failures:
   - Source validation issues
   - Error message mismatches
   - Circular import detection

#### Next Steps
1. Fix file system mocks:
   - Properly mock `fs.promises` with `readFile` and `writeFile`
   - Add `path.resolve` and other path utilities to mocks
   - Set up consistent mock file content

2. Update test setup:
   - Use `beforeEach` to reset state and mocks
   - Provide proper mock file content
   - Fix location handling in subInterpreter tests

3. Align error messages:
   - Update embed handler error messages
   - Fix import handler validation
   - Ensure consistent error handling

4. Document handoff:
   - Summarize remaining work
   - Note test patterns and mock requirements
   - List known issues and potential solutions

### Handoff Notes

#### Project Status
The codebase is transitioning from ESM to CommonJS, with several test suites requiring updates to match this change. The main issues revolve around file system mocking and error handling consistency.

#### Key Areas for Attention
1. File System Mocking
   - Tests need consistent mock implementations
   - Both sync and async operations must be mocked
   - Mock file content should be standardized

2. Error Handling
   - Error messages need alignment across handlers
   - Validation order should be consistent
   - Location information should be preserved

3. Test Infrastructure
   - State management between tests
   - Mock cleanup and initialization
   - File system operation isolation

#### Recommendations
1. Start with CLI and SDK tests:
   - These form the integration layer
   - Fix file system mocks first
   - Ensure consistent error handling

2. Then address handler tests:
   - Align error messages
   - Fix validation logic
   - Update mock implementations

3. Finally, fix subInterpreter tests:
   - Focus on location handling
   - Address state merging
   - Fix parse error handling

#### Known Issues
1. File system mocks:
   ```typescript
   vi.mock('fs', () => ({
     existsSync: vi.fn(),
     promises: {
       readFile: vi.fn(),
       writeFile: vi.fn()
     }
   }));
   ```
   Need to be consistently implemented across test files

2. Path handling:
   ```typescript
   vi.mock('path', () => ({
     resolve: vi.fn((...paths) => paths.join('/')),
     dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/'))
   }));
   ```
   Required for proper file path handling

3. Error messages:
   ```typescript
   // Current
   throw new MeldEmbedError('Embed path is required');
   // Expected
   throw new MeldEmbedError('Embed directive requires a path');
   ```
   Need alignment across all handlers

#### Next Actions
1. Implement consistent file system mocks
2. Fix error message discrepancies
3. Address location handling in subInterpreter
4. Update test setup patterns
5. Document mock patterns for future reference

### Test Suite Failures Investigation - March 2024
#### Symptom
- 49 failed tests across multiple test suites
- Three main categories of failures:
  1. File system mocking issues
  2. Error message mismatches
  3. Location handling in AST nodes

#### Evidence Collection
1. Test Failure Patterns:
   ```
   - CLI Tests: "File not found" errors due to missing fs mocks
   - SDK Tests: Missing "promises" export in fs mock
   - Embed Tests: Error message mismatches and path validation issues
   - Import Tests: Similar error message mismatches
   - SubInterpreter Tests: Location object access errors
   ```

2. Key Error Types:
   - `No "promises" export is defined on the "fs" mock`
   - `No "resolve" export is defined on the "path" mock`
   - Error message mismatches (e.g. "Embed path is required" vs "Embed directive requires a path")
   - `TypeError: Cannot read properties of undefined (reading 'location')`

3. Test Environment Issues:
   - Inconsistent mock implementations across test files
   - Missing mock setup for fs.promises API
   - Incomplete path module mocking
   - Missing file system fixtures

#### Assumptions
- Tests are using vitest's mocking system
- File system operations should be fully mocked in tests
- Error messages should be consistent across the codebase
- AST nodes should have consistent location information

#### Investigation Plan
1. File System Mocking Analysis
   - [ ] Review all fs mock implementations
   - [ ] Check for consistent mock patterns
   - [ ] Verify fs.promises API mocking
   - [ ] Analyze path module mock requirements

2. Error Message Standardization
   - [ ] Catalog all error messages
   - [ ] Identify inconsistencies
   - [ ] Check error creation patterns
   - [ ] Review error handling in directives

3. Location Handling
   - [ ] Review AST node structure
   - [ ] Check location object initialization
   - [ ] Verify location propagation
   - [ ] Test location offset calculations

#### Current Status
1. File System Mocking Issues:
   - Tests need proper fs.promises mock implementation
   - Path module mocking is incomplete
   - Mock cleanup between tests may be inconsistent

2. Error Message Patterns:
   - Inconsistent error messages between tests and implementation
   - Some error messages don't match expected patterns
   - Error location information not consistently included

3. Location Handling:
   - SubInterpreter not properly handling location offsets
   - Some AST nodes missing location information
   - Location propagation may be broken

#### Next Steps
1. Mock Implementation
   - Create consistent fs mock template
   - Add proper fs.promises support
   - Implement complete path module mocking
   - Set up proper test fixtures

2. Error Standardization
   - Define error message format
   - Update error messages to match format
   - Add location information consistently
   - Update tests to match new messages

3. Location Fixes
   - Review location object structure
   - Fix location offset calculations
   - Ensure proper location propagation
   - Add location validation

4. Test Infrastructure
   - Implement shared mock setup
   - Add proper test cleanup
   - Create test utilities
   - Add test fixtures

#### Observations
1. Mock Implementation Patterns:
   ```typescript
   // Current pattern (incomplete)
   vi.mock('fs', () => ({
     existsSync: vi.fn()
   }));

   // Needed pattern
   vi.mock('fs', async (importOriginal) => {
     const actual = await importOriginal();
     return {
       ...actual,
       promises: {
         readFile: vi.fn(),
         writeFile: vi.fn()
       },
       existsSync: vi.fn()
     }
   });
   ```

2. Error Message Inconsistencies:
   ```typescript
   // Current
   throw new MeldEmbedError('Embed path is required');
   
   // Expected
   throw new MeldEmbedError('Embed directive requires a path');
   ```

3. Location Object Issues:
   ```typescript
   // Current (undefined access)
   nodes[0].location?.start.line
   
   // Needed
   if (!node.location?.start) {
     throw new Error('Missing location information');
   }
   ```

#### Test Coverage Summary
- Total Tests: 122
- Passed: 73
- Failed: 49
- Test Files: 15 (9 passed, 6 failed)

Key failing areas:
1. CLI Integration Tests (10/10 failed)
2. SDK Integration Tests (8/10 failed)
3. Embed Handler Tests (15/17 failed)
4. Import Handler Tests (5/7 failed)
5. SubInterpreter Tests (2/5 failed)

### Code Analysis Deep Dive - March 2024
#### Parser and Node Creation
1. Node Creation Issues:
   ```typescript
   // Current parser mock
   vi.mock('../parser', () => ({
     parseMeld: vi.fn((content: string) => {
       if (content === '@text test = "value"') {
         return [{
           type: 'Directive',
           kind: '@text',
           data: { name: 'test', value: 'value' },
           location: { start: { line: 1, column: 1 }, end: { line: 1, column: 21 } }
         }];
       }
       throw new Error('Failed to parse');
     })
   }));
   ```
   - Parser mock is too simplistic
   - Not handling all test cases
   - Location information inconsistent

2. Location Object Handling:
   ```typescript
   // Current implementation
   function adjustNodeLocation(node: Node, baseLocation: Location): void {
     if (!node.location) return;
     
     const startLine = node.location.start.line + baseLocation.start.line - 1;
     const startColumn = node.location.start.line === 1 
       ? node.location.start.column + baseLocation.start.column - 1 
       : node.location.start.column;
   }
   ```
   - Complex offset calculations
   - Edge cases not well tested
   - Column adjustment logic needs verification

#### State Management Issues
1. State Inheritance Chain:
   ```typescript
   // Current implementation
   export class InterpreterState {
     private parentState?: InterpreterState;
     private nodes: MeldNode[] = [];
     private textVars: Map<string, string> = new Map();
     // ...
   }
   ```
   - Parent state reference may be lost
   - Variable shadowing not properly handled
   - Immutability checks inconsistent

2. Mock State Implementation:
   ```typescript
   // Mock state missing key features
   export class InterpreterState {
     private nodes: MeldNode[] = [];
     // Missing parentState
     // Missing baseLocation
     // Missing pathVars
   }
   ```
   - Mock state too simplified
   - Missing critical functionality
   - Not matching production behavior

#### Investigation Strategies
1. Parser Debugging:
   ```typescript
   // Add detailed logging
   export function parseMeld(content: string): MeldNode[] {
     console.log('[Parser] Input:', content);
     try {
       const nodes = actualParseMeld(content);
       console.log('[Parser] Output nodes:', JSON.stringify(nodes, null, 2));
       return nodes;
     } catch (error) {
       console.error('[Parser] Error:', error);
       throw error;
     }
   }
   ```

2. Location Tracking:
   ```typescript
   // Add location validation
   function validateLocation(node: Node, context: string): void {
     console.log(`[Location] Validating ${context}:`, {
       node: node.type,
       location: node.location,
       hasStart: node.location?.start !== undefined,
       hasEnd: node.location?.end !== undefined
     });
   }
   ```

3. State Inheritance Logging:
   ```typescript
   // Add state chain logging
   class InterpreterState {
     private logStateChain(): void {
       console.log('[State] Current chain:', {
         hasParent: !!this.parentState,
         vars: {
           text: Array.from(this.textVars.keys()),
           data: Array.from(this.dataVars.keys()),
           path: Array.from(this.pathVars.keys())
         },
         nodes: this.nodes.length
       });
     }
   }
   ```

#### Root Cause Analysis
1. Node Iteration Failures:
   ```
   TypeError: nodes is not iterable
    at Module.interpret (src/interpreter/interpreter.ts:12:22)
   ```
   Potential causes:
   - Parser returning null/undefined
   - Mock implementation incorrect
   - Type definitions not enforced

2. Location Object Access:
   ```
   TypeError: Cannot read properties of undefined (reading 'location')
   ```
   Potential causes:
   - Node creation missing location
   - Location adjustment corrupting data
   - Mock data incomplete

3. State Method Missing:
   ```
   TypeError: state.setPathVar is not a function
   ```
   Potential causes:
   - Mock state implementation incomplete
   - Interface mismatch
   - Method added but tests not updated

#### Logging Strategy
1. Parser Instrumentation:
   - [ ] Add entry/exit logging
   - [ ] Log node creation details
   - [ ] Track location calculations
   - [ ] Monitor error conditions

2. State Operations:
   - [ ] Log state modifications
   - [ ] Track inheritance chain
   - [ ] Monitor variable access
   - [ ] Validate state merges

3. Location Handling:
   - [ ] Log location adjustments
   - [ ] Track offset calculations
   - [ ] Validate location objects
   - [ ] Monitor edge cases

4. Test Environment:
   - [ ] Log mock setup
   - [ ] Track test initialization
   - [ ] Monitor cleanup
   - [ ] Validate fixtures

#### Next Investigation Steps
1. Parser Validation:
   ```typescript
   // Add parser validation
   function validateParserOutput(nodes: MeldNode[]): void {
     nodes.forEach((node, index) => {
       console.log(`[Validate] Node ${index}:`, {
         type: node.type,
         hasLocation: !!node.location,
         locationValid: node.location?.start && node.location?.end
       });
     });
   }
   ```

2. State Chain Verification:
   ```typescript
   // Add state chain verification
   function verifyStateChain(state: InterpreterState): void {
     let current = state;
     let depth = 0;
     while (current) {
       console.log(`[State] Level ${depth}:`, {
         vars: current.getAllTextVars().size,
         nodes: current.getNodes().length
       });
       current = current.getParentState()!;
       depth++;
     }
   }
   ```

3. Mock Enhancement:
   ```typescript
   // Enhance mock implementation
   vi.mock('../state/state', () => ({
     InterpreterState: class {
       private parentState?: InterpreterState;
       private nodes: MeldNode[] = [];
       constructor(config?: { parentState?: InterpreterState }) {
         this.parentState = config?.parentState;
         console.log('[Mock] Created state:', { hasParent: !!this.parentState });
       }
       // ... implement all required methods
     }
   }));
   ```

#### Test Case Matrix
| Category | Test Case | Current Status | Expected Behavior |
|----------|-----------|----------------|-------------------|
| Parser | Basic directive | Failing | Returns valid nodes |
| Parser | Complex content | Failing | Handles nested structures |
| Location | Basic offset | Failing | Correct line/column |
| Location | Nested content | Failing | Proper inheritance |
| State | Variable inheritance | Failing | Correct shadowing |
| State | Method availability | Failing | All methods present |