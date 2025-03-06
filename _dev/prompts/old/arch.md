You are an expert in building reliable and maintainable DSL systems, particularly in structuring state interpreters.

You are passionate about SOLID architecture, taking methodical approaches, and making incremental and testable changes.

We want to create a thoughtfully structured plan for addressing some complex issues we have encountered. We are now asking for your help preparing a detailed plan which is written in order to maximize success based on it being carried out by an LLM developer.

I am going to provide you with some context:

- Architecture documentation (slightly outdated)
- Test setup
- Issues we encountered
- Our completed plan to fix these issues
- The subsequent test failures we encountered as we reached the point of finishing that plan
- The advice you provided for strategically approaching resolving these issues

\======= CONTEXT

\=== ARCHITECTURE

# Meld Architecture

## INTRODUCTION

Meld is a specialized, directive-based scripting language designed for embedding small "@directives" inside an otherwise plain text (e.g., Markdown-like) document. The code in this repository implements:

• Meld grammar rules and token types (e.g., text directives, path directives, data directives).
• The parsing layer that converts Meld content into an AST (Abstract Syntax Tree).
• A directive interpretation layer that processes these AST nodes and manipulates internal "states" to store variables and more.
• A resolution layer to handle variable references, path expansions, data manipulations, etc.
• Testing utilities and an in-memory FS (memfs) to simulate filesystems for thorough testing.

The main idea:
1. Meld code is parsed to an AST.
2. Each directive node is validated and interpreted, updating a shared "state" (variables, data structures, commands, etc.).
3. Optional transformations (e.g., output formatting) generate final representations (Markdown, LLM-friendly XML, etc.).

Below is an overview of the directory and service-level architecture, referencing code from this codebase.

## DIRECTORY & FILE STRUCTURE

At a high level, the project is arranged as follows (select key entries included):

project-root/
 ├─ api/                    ← High-level API and tests
 │   ├─ api.test.ts
 │   └─ index.ts
 ├─ bin/                    ← CLI entry point
 │   └─ meld.ts
 ├─ cli/                    ← CLI implementation
 │   ├─ cli.test.ts
 │   └─ index.ts
 ├─ core/                   ← Core utilities and types
 │   ├─ config/            ← Configuration (logging, etc.)
 │   ├─ errors/            ← Error class definitions
 │   ├─ types/             ← Core type definitions
 │   └─ utils/             ← Logging and utility modules
 ├─ services/              ← Core service implementations
 │   ├─ CLIService/
 │   ├─ CircularityService/
 │   ├─ DirectiveService/
 │   │   ├─ handlers/
 │   │   │   ├─ definition/   ← Handlers for definition directives
 │   │   │   └─ execution/    ← Handlers for execution directives
 │   │   └─ errors/
 │   ├─ FileSystemService/
 │   ├─ InterpreterService/
 │   ├─ OutputService/
 │   ├─ ParserService/
 │   ├─ PathService/
 │   ├─ ResolutionService/
 │   │   ├─ resolvers/       ← Individual resolution handlers
 │   │   └─ errors/
 │   ├─ StateService/
 │   └─ ValidationService/
 │       └─ validators/      ← Individual directive validators
 ├─ tests/                  ← Test infrastructure
 │   ├─ fixtures/          ← Test fixture data
 │   ├─ mocks/             ← Test mock implementations
 │   ├─ services/          ← Service-specific tests
 │   └─ utils/             ← Test utilities and helpers
 │       ├─ FixtureManager.ts
 │       ├─ MemfsTestFileSystem.ts
 │       ├─ ProjectBuilder.ts
 │       ├─ TestContext.ts
 │       └─ TestSnapshot.ts
 ├─ docs/                   ← Documentation
 ├─ package.json
 ├─ tsconfig.json
 ├─ tsup.config.ts
 └─ vitest.config.ts

Key subfolders:
• services/: Each service is a self-contained module with its implementation, interface, tests, and any service-specific utilities
• core/: Central types, errors, and utilities used throughout the codebase
• tests/utils/: Test infrastructure including the memfs implementation, fixture management, and test helpers
• api/: High-level public API for using Meld programmatically
• cli/: Command line interface for Meld

## CORE LIBRARIES & THEIR ROLE

### meld-ast
   • parse(content: string): MeldNode[]
   • Basic parsing that identifies directives vs. text nodes.
   • Produces an AST which other services manipulate.

### llmxml
   • Converts content to an LLM-friendly XML format or can parse partially.
   • OutputService may call it if user requests "llm" format.

### meld-spec
   • Contains interface definitions for MeldNode, DirectiveNode, TextNode, etc.
   • Contains directive kind enumerations.

## HIGH-LEVEL FLOW

Below is a simplified flow of how Meld content is processed:

   ┌─────────────────────────────┐
   │   Meld Source Document      │
   └─────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────┐
   │ ParserService.parse(...)    │
   │   → uses meld-ast to parse  │
   └─────────────────────────────┘
                │ AST (MeldNode[])
                ▼
   ┌─────────────────────────────────────────────────┐
   │ InterpreterService.interpret(nodes, options)   │
   │   → For each node, pass to DirectiveService     │
   └─────────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ DirectiveService                        │
   │   → For each directive, route to        │
   │     the correct directive handler       │
   └──────────────────────────────────────────┘
                │
                ▼
   ┌───────────────────────────────────────────────┐
   │ StateService + ResolutionService + Others    │
   │   → Where variables are stored/resolved      │
   │   → Path expansions, data lookups, etc.      │
   └───────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ OutputService (optional)                │
   │   → Convert final AST/State to markdown,│
   │     LLM XML, or other formats.          │
   └──────────────────────────────────────────┘

## MAJOR SERVICES (OVERVIEW)

Below are the key "services" in the codebase. Each follows the single responsibility principle:

### CLIService
   - Provides command-line interface for running Meld
   - Handles file watching and reprocessing
   - Manages format selection and output options
   - Routes to appropriate services based on CLI flags

### ParserService
   - Wraps the meld-ast parse(content) function
   - Adds location information with file paths (parseWithLocations)
   - Produces an array of MeldNode objects

### DirectiveService
   - Routes directives to the correct directive handler
   - Validates directives using ValidationService
   - Calls ResolutionService for variable resolution
   - Updates StateService with directive execution results

### InterpreterService
   - Orchestrates the main interpret(nodes) pipeline
   - For each AST node:
       a) If it's text, store it or pass it along
       b) If it's a directive, calls DirectiveService
   - Maintains the top-level process flow

### StateService
   - Stores variables in maps:
       • textVars (for @text)
       • dataVars (for @data)
       • pathVars (for @path)
       • commands (for @define)
   - Tracks MeldNodes for final structure
   - Provides child states for nested imports
   - Supports immutability toggles

### ResolutionService
   - Handles all variable interpolation:
       • Text variables ("${var}")
       • Data references ("#{data.field}")
       • Path expansions ("$HOMEPATH/path")
       • Command references
   - Context-aware resolution
   - Circular reference detection
   - Sub-fragment parsing support

### CircularityService
   - Prevents infinite import loops
   - Detects circular variable references
   - Maintains dependency graphs

### PathService
   - Validates and normalizes paths
   - Enforces path security constraints
   - Handles path joining and manipulation
   - Supports test mode for path operations

### ValidationService
   - Validates directive syntax and constraints
   - Provides extensible validator registration
   - Throws MeldDirectiveError on validation failures
   - Tracks available directive kinds

###  FileSystemService
    - Abstracts file operations (read, write)
    - Supports both real and test filesystems
    - Handles path resolution and validation

### OutputService
    - Converts final AST and state to desired format
    - Supports markdown and LLM XML output
    - Integrates with llmxml for LLM-friendly formatting
    - Handles format-specific transformations

## TESTING INFRASTRUCTURE

All tests are heavily reliant on a memory-based filesystem (memfs) for isolation and speed. The major testing utilities include:

### MemfsTestFileSystem
   – Thin wrapper around memfs
   – Offers readFile, writeFile, mkdir, etc. with in-memory data
   – Provides an ephemeral environment for all test IO

### TestContext
   – Central test harness that creates a new MemfsTestFileSystem
   – Provides references to all major services (ParserService, DirectiveService, etc.)
   – Allows writing files, snapshotting the FS, and comparing

### TestSnapshot
   – Takes "snapshots" of the current Memfs FS, storing a Map<filePath, content>
   – Compares snapshots to detect added/removed/modified files

### ProjectBuilder
   – Creates mock "projects" in the in-memory FS from JSON structure
   – Useful for complex, multi-file tests or large fixture-based testing

### Node Factories
   – Provides helper functions for creating AST nodes in tests
   – Supports creating directive, text, and code fence nodes
   – Includes location utilities for source mapping

Testing Organization:
• tests/utils/: Core test infrastructure (MemFS, snapshots, contexts)
• tests/mocks/: Minimal mocks and test doubles
• tests/fixtures/: JSON-based test data
• tests/services/: Service-specific integration tests

Testing Approach:
• Each test uses a fresh TestContext or recreates MemfsTestFileSystem
• Direct imports from core packages (meld-ast, meld-spec) for types
• Factory functions for creating test nodes and data
• Snapshots for tracking filesystem changes

## SERVICE RELATIONSHIPS

Below is a more expanded ASCII diagram showing services with references:

                                 +---------------------+
                                 |    CLIService      |
                                 |   Entry point      |
                                 +----------+----------+
                                            |
                                            v
                                 +---------------------+
                                 |    ParserService    |
                                 | meld-ast parsing    |
                                 +----------+----------+
                                            |
                                            v
 +------------+                 +---------------------+
 | Circularity|  <----------->  |  ResolutionService  |
 |  Service   |                 |   Variable/Path     |
 +------------+                 |    Resolution       |
      ^                                   |
      |                                   v
 +------------+  +---------------------+  +-----------+
 | Validation|-> | DirectiveService   |->|StateService|
 |  Service  |   +---------+-----------+  +-----------+
 +------------+            |   |
      ^                    v   v
      |         +---------------+--------------+
      +---------|   Handler(s): text, data,   |
                |   embed, import, etc.       |
                +---------------+--------------+
                                   |
                                   v
                        +---------------------+
                        | InterpreterService |
                        +----------+----------+
                                   |
                                   v
                        +---------------------+
                        |   OutputService    |
                        +---------------------+

Key relationships:
• InterpreterService orchestrates directives → DirectiveService → uses Validation & Resolution.
• ResolutionService consults CircularityService for import cycles, etc.
• DirectiveService updates or reads from StateService.

## EXAMPLE USAGE SCENARIO

1) Input: A .meld file with lines like:
   @text greeting = "Hello"
   @data config = { "value": 123 }
   @import [ path = "other.meld" ]

2) We load the file from disk.
3) ParserService → parse the content → AST.
4) InterpreterService → interpret(AST).
   a) For each directive, DirectiveService → validation → resolution → update StateService.
   b) If an import is encountered, CircularityService ensures no infinite loops.
5) Once done, the final StateService has textVars.greeting = "Hello", dataVars.config = { value: 123 }, etc.
6) OutputService can generate the final text or an LLM-XML representation.

## ERROR HANDLING

• MeldDirectiveError thrown if a directive fails validation or interpretation.
• MeldParseError if the parser cannot parse content.
• PathValidationError for invalid paths.
• ResolutionError for variable resolution issues.
• MeldError as a base class for other specialized errors.

These errors typically bubble up to the caller or test.

## CONCLUSION

This codebase implements the entire Meld language pipeline:
• Parsing Meld documents into an AST.
• Validating & interpreting directives.
• Storing data in a hierarchical state.
• Resolving references (text, data, paths, commands).
• (Optionally) generating final formatted output.

Plus, it has a robust test environment with an in-memory FS, snapshots, and a test harness (TestContext) for integration and unit tests. Everything is layered to keep parsing, state management, directive logic, and resolution separate, adhering to SOLID design principles.

The ASCII diagrams, modules, and file references in this overview represent the CURRENT code as it is: multiple specialized services collaborating to parse and interpret Meld scripts thoroughly—test coverage is facilitated by the in-memory mocking and snapshot-based verification.

\=== TEST SETUP

# Testing in Meld

This document outlines the testing infrastructure and best practices for the Meld codebase. It serves as a practical guide for writing and maintaining tests.

## Directory Structure

Tests are organized following these conventions:

```
project-root/
├─ tests/                    # Test infrastructure and shared resources
│  ├─ utils/                # Test utilities and factories
│  ├─ mocks/                # Shared mock implementations
│  ├─ fixtures/             # Test fixture data
│  └─ setup.ts             # Global test setup
└─ services/               # Service implementations with co-located tests
   └─ ServiceName/
      ├─ ServiceName.test.ts           # Unit tests
      ├─ ServiceName.integration.test.ts # Integration tests
      └─ handlers/
         └─ HandlerName.test.ts        # Handler-specific tests
```

## Test Infrastructure

### Core Testing Utilities

1. **TestContext**
   - Central test harness providing access to all test utilities
   - Manages test state and cleanup
   - Available globally in tests as `testContext`

2. **Test Factories**
   - Located in `tests/utils/testFactories.ts`
   - Provides helper functions for creating test nodes and mocks
   - Ensures consistent test data creation

Example usage:
```typescript
import {
  createDefineDirective,
  createLocation,
  createMockStateService
} from '@tests/utils/testFactories';

const node = createDefineDirective(
  'greet',
  'echo "Hello"',
  [],
  createLocation(1, 1, 1, 20)
);

const mockState = createMockStateService();
```

### Mock Services

The test factories provide mock implementations for all core services:

```typescript
const mockServices = {
  stateService: createMockStateService(),
  validationService: createMockValidationService(),
  resolutionService: createMockResolutionService(),
  fileSystemService: createMockFileSystemService(),
  // ... etc
};
```

Each mock service implements the corresponding interface and provides sensible defaults.

## Writing Tests

### Service Tests

Service tests should follow this structure:

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let dependencies: {
    stateService: IStateService;
    // ... other dependencies
  };

  beforeEach(() => {
    dependencies = {
      stateService: createMockStateService(),
      // ... initialize other dependencies
    };
    service = new ServiceName(dependencies);
  });

  describe('core functionality', () => {
    it('should handle basic operations', async () => {
      // Arrange
      const input = // ... test input

      // Act
      const result = await service.operation(input);

      // Assert
      expect(result).toBeDefined();
      expect(dependencies.stateService.someMethod)
        .toHaveBeenCalledWith(expectedArgs);
    });
  });

  describe('error handling', () => {
    it('should handle errors appropriately', async () => {
      // ... error test cases
    });
  });
});
```

### Directive Handler Tests

Directive handler tests should cover:

1. Value Processing
   - Basic value handling
   - Parameter processing
   - Edge cases

2. Validation Integration
   - Integration with ValidationService
   - Validation error handling

3. State Management
   - State updates
   - Command/variable storage

4. Error Handling
   - Validation errors
   - Resolution errors
   - State errors

Example structure:
```typescript
describe('HandlerName', () => {
  let handler: HandlerName;
  let dependencies: {
    validationService: IValidationService;
    stateService: IStateService;
    resolutionService: IResolutionService;
  };

  beforeEach(() => {
    dependencies = {
      validationService: createMockValidationService(),
      stateService: createMockStateService(),
      resolutionService: createMockResolutionService()
    };
    handler = new HandlerName(dependencies);
  });

  describe('value processing', () => {
    // Value processing tests
  });

  describe('validation', () => {
    // Validation tests
  });

  describe('state management', () => {
    // State management tests
  });

  describe('error handling', () => {
    // Error handling tests
  });
});
```

### Integration Tests

Integration tests should focus on real-world scenarios and service interactions:

```typescript
describe('Service Integration', () => {
  let services: {
    directiveService: DirectiveService;
    stateService: StateService;
    // ... other real service instances
  };

  beforeEach(() => {
    services = {
      directiveService: new DirectiveService(),
      stateService: new StateService(),
      // ... initialize other services
    };

    // Initialize service relationships
    services.directiveService.initialize(
      services.validationService,
      services.stateService,
      services.resolutionService
    );
  });

  it('should process complex scenarios', async () => {
    // Test end-to-end flows
  });
});
```

## Best Practices

1. **Test Organization**
   - Co-locate tests with implementation files
   - Use clear, descriptive test names
   - Group related tests using `describe` blocks
   - Follow the Arrange-Act-Assert pattern

2. **Mock Usage**
   - Use the provided mock factories
   - Set up specific mock implementations in beforeEach
   - Clear all mocks between tests
   - Be explicit about mock expectations

3. **Error Testing**
   - Test both expected and unexpected errors
   - Verify error messages and types
   - Test error propagation
   - Include location information in errors

4. **Location Handling**
   - Always include location information in test nodes
   - Use `createLocation` helper for consistency
   - Test location propagation in errors

5. **State Management**
   - Test state immutability
   - Verify state cloning
   - Test parent/child state relationships
   - Validate state updates

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test services/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Test Coverage

The project maintains high test coverage through:
- Unit tests for all services and handlers
- Integration tests for service interactions
- Error case coverage
- Edge case testing

Coverage reports can be generated using:
```bash
npm test -- --coverage
```

## Debugging Tests

1. Use the `debug` logger in tests:
```typescript
import { debug } from '@core/utils/logger';

it('should handle complex case', () => {
  debug('Test state:', someObject);
});
```

2. Use Node.js debugger:
   - Add `debugger` statement in test
   - Run `npm test -- --inspect-brk`
   - Connect Chrome DevTools

3. Use Vitest UI:
```bash
npm test -- --ui
```

\=== ISSUES ENCOUNTERED

# Meld Output Processing Issues

## Overview

During the first production run of Meld, we've identified several critical issues with output processing. These issues prevent Meld from correctly processing directives and generating clean output as specified in the grammar.

## Issue 1: Directive Definitions Appearing in Output

### Description
The output currently includes the raw directive definitions themselves instead of just their processed results.

### Expected Behavior
- Plain text/markdown content should appear in output
- Results of 'run' and 'embed' directives should appear in output
- Directive definitions should NOT appear in output
- Definition/import directives (@path, @text, @data, @import, @define) should NOT appear in output
- Comment lines (>>) should NOT appear in output

### Actual Behavior
Looking at example.xml/example.md, we see:
- Directive definitions are being included verbatim
- Directive metadata (kind, identifier, etc.) is being exposed
- XML/MD structure is being created around the directives themselves

### Steps to Reproduce
1. Create a file example.meld with directives
2. Run `meld example.meld`
3. Observe output contains raw directive definitions

### Investigation Notes
- Need to examine OutputService's transformation logic
- Check if AST/State transformation is happening before output generation
- Review how directive results are being stored in state

## Issue 2: Directives Not Being Processed

### Description
The directives' content is not being processed - raw directive content appears instead of processed results.

### Expected Behavior
- @run directives should execute commands and include output
- @embed directives should include file contents
- Variable interpolation should occur
- Results should be properly formatted in output

### Actual Behavior
- Raw directive content appears in output
- Commands are not being executed
- Files are not being embedded
- Variables are not being interpolated

### Steps to Reproduce
1. Create example.meld with @run and @embed directives
2. Run `meld example.meld`
3. Observe raw directives in output instead of processed results

### Investigation Notes
- Need to examine InterpreterService directive processing
- Check DirectiveService handler execution
- Review how results are being stored in State
- Compare with prototype implementation in dev/meld-cli/src

## Issue 3: @embed Variable Input

### Description
The @embed directive is not accepting variables as input, forcing use of @text directives as a workaround.

### Expected Behavior
```meld
@embed [${role_text}]
@embed [#{task.code_review}]
```
Should work as expected, embedding the content referenced by the variables.

### Actual Behavior
Variables in @embed directives are not being processed, requiring workaround:
```meld
@text role_text = `#{role.architect}`
@embed [${role_text}]
```

### Steps to Reproduce
1. Create file with @embed directive using variable input
2. Run meld on the file
3. Observe variable not being processed

### Investigation Notes
- Not a parser limitation (parser supports this functionality)
- Need to examine DirectiveService/handlers for @embed
- Check variable resolution in ResolutionService
- Review how @embed handler processes its input

### Root Cause
After examining the EmbedDirectiveHandler and ResolutionService, the issue appears to be in the variable resolution flow:

1. **EmbedDirectiveHandler Processing**
   ```typescript
   // 1. Get path from directive
   const { path, section } = node.directive;

   // 2. Create resolution context
   const resolutionContext = {
     currentFilePath: context.currentFilePath,
     state: context.state,
     allowedVariableTypes: {
       text: true,
       data: true,
       path: true,
       command: false
     }
   };

   // 3. Resolve variables in path
   const resolvedPath = await this.resolutionService.resolveInContext(
     path,
     resolutionContext
   );
   ```

2. **Resolution Flow**
   - EmbedDirectiveHandler correctly attempts to resolve variables
   - ResolutionService has proper variable resolution support
   - The issue is in the node transformation gap:
     1. Directive is processed and path is resolved
     2. Content is read and parsed
     3. But no node replacement happens
     4. Original directive remains in AST

3. **Variable Resolution Support**
   - ResolutionService supports:
     - Text variables (${var})
     - Data variables (#{data})
     - Path variables ($path)
   - Resolution context allows all variable types
   - Variable resolution itself works correctly

4. **Missing Transformation**
   ```typescript
   // Current flow:
   1. Process directive -> resolve path -> read content
   2. Store in state
   3. Keep original directive node

   // Needed flow:
   1. Process directive -> resolve path -> read content
   2. Create new text/content node
   3. Replace directive node with content node
   ```

### Required Changes for @embed

1. **Node Transformation**
   ```typescript
   class EmbedDirectiveHandler {
     async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
       // ... existing resolution code ...

       // Create content node to replace directive
       const contentNode = {
         type: 'Text',
         content: processedContent
       };

       // Replace node in AST
       context.state.replaceNode(node, contentNode);

       return newState;
     }
   }
   ```

2. **State Service Enhancement**
   - Add node replacement capability
   - Track node relationships
   - Support AST modifications

3. **Handler Interface Update**
   ```typescript
   interface IDirectiveHandler {
     execute(node: DirectiveNode, context: DirectiveContext): Promise<{
       state: IStateService;
       replacement?: MeldNode;  // Optional replacement node
     }>;
   }
   ```

4. **Integration Changes**
   - Update InterpreterService to handle node replacements
   - Modify DirectiveService to pass replacements
   - Update OutputService to use transformed nodes

### Testing Strategy

1. **Variable Resolution Tests**
   ```typescript
   it('should handle variable input in embed path', async () => {
     const node = createEmbedDirective('${docPath}', undefined, createLocation(1, 1));
     const context = {
       state: stateService,
       currentFilePath: 'test.meld'
     };

     stateService.getTextVar.mockReturnValue('doc.md');
     fileSystemService.exists.mockResolvedValue(true);
     fileSystemService.readFile.mockResolvedValue('Test content');

     const result = await handler.execute(node, context);
     expect(result.replacement?.type).toBe('Text');
     expect(result.replacement?.content).toBe('Test content');
   });
   ```

2. **Node Replacement Tests**
   ```typescript
   it('should replace directive node with content', async () => {
     const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1));
     const context = { state: stateService };

     const result = await handler.execute(node, context);
     expect(stateService.replaceNode).toHaveBeenCalledWith(
       node,
       expect.objectContaining({ type: 'Text' })
     );
   });
   ```

### Implementation Plan

1. **Phase 1: Node Replacement**
   - Add node replacement to StateService
   - Update handler interface
   - Modify InterpreterService

2. **Phase 2: Variable Resolution**
   - Verify resolution context
   - Add variable resolution tests
   - Update error handling

3. **Phase 3: Integration**
   - Connect with OutputService changes
   - Update pipeline flow
   - Add end-to-end tests

## Prototype Implementation Analysis

The prototype in dev/meld-cli/src takes a fundamentally different approach to processing and output:

### Key Differences

1. **Direct AST Transformation**
   - Uses remark/unified pipeline for markdown processing
   - Transforms nodes in-place during processing
   - Replaces directive nodes with their output content
   - No separate state management or output transformation

2. **Processing Pipeline**
   ```typescript
   unified()
     .use(remarkParse)                  // Parse markdown to AST
     .use(remarkMeldDirectives)         // Identify directives
     .use(remarkProcessMeldNodes)       // Process & replace nodes
     .use(remarkMeldDirectiveHandler)   // Final handling
     .use(remarkStringify)              // Output as markdown
   ```

3. **Node Replacement Strategy**
   - When processing a directive node:
     ```typescript
     parent.children[index] = {
       type: 'html',
       value: processedContent
     } as Node;
     ```
   - Original directive node is completely replaced
   - No trace of directive in final output

4. **Command Execution**
   - Synchronous execution during processing
   - Output captured and inserted directly
   - Both stdout/stderr collected in order
   - ANSI codes stripped from output

5. **Import/Embed Handling**
   - Direct file reading and processing
   - Content immediately inserted into AST
   - Supports both markdown and code files
   - Handles section extraction

### Insights for Current Implementation

1. **AST Transformation**
   - Current implementation may be preserving nodes instead of replacing
   - Need to check if DirectiveService is transforming nodes or just processing them
   - OutputService may be seeing original nodes instead of results

2. **State Management**
   - Prototype has no separate state
   - Our StateService might be storing results but not affecting AST
   - Need to verify how state connects to output generation

3. **Processing Flow**
   - Prototype processes synchronously, top-to-bottom
   - Our pipeline may be deferring execution or storing results separately
   - Need to check if InterpreterService is actually executing commands

4. **Output Generation**
   - Prototype's output is a direct result of AST transformation
   - Our OutputService may need similar node replacement strategy
   - Consider adding pre-output transformation step

### Action Items

1. Check DirectiveService implementation:
   - Are we replacing nodes with their results?
   - How are results being stored?
   - Is AST being modified during processing?

2. Review InterpreterService:
   - Verify command execution timing
   - Check how results are being handled
   - Compare with prototype's direct replacement

3. Examine OutputService:
   - Add pre-output AST transformation
   - Consider adopting prototype's replacement strategy
   - Ensure state results are properly integrated

4. Consider Pipeline Changes:
   - May need additional processing step before output
   - Could add node transformation phase
   - Might need to modify how state affects AST

## Next Steps

1. **Investigation Priority**
   - Issue 1: Output processing (most fundamental)
   - Issue 2: Directive processing
   - Issue 3: @embed variable handling

2. **Investigation Approach**
   - Compare with prototype implementation
   - Review service interactions
   - Add logging/debugging
   - Create minimal test cases

3. **Service Focus Areas**
   - OutputService: Issue 1
   - InterpreterService: Issue 2
   - DirectiveService (@embed handler): Issue 3
   - StateService: All issues (state management)

4. **Questions to Answer**
   - How is the prototype handling output processing differently?
   - Where in the pipeline are directive results being lost?
   - How is state being transformed for output?
   - What assumptions were made during architecture design that need revision?

## Current Implementation Analysis

After examining the current implementation, here are the key findings for each issue:

### Issue 1: Directive Definitions in Output

**Root Cause**: The OutputService's `nodeToMarkdown` method is directly converting directive nodes to markdown without transformation:

```typescript
private async nodeToMarkdown(node: MeldNode, options: OutputOptions): Promise<string> {
  switch (node.type) {
    case 'Directive':
      const directiveNode = node as DirectiveNode;
      // Formats directive as JSON instead of processing its result
      return `### ${directiveNode.directive.kind} Directive\n${JSON.stringify(directiveNode.directive, null, 2)}\n\n`;
    // ...
  }
}
```

This shows that:
1. Directive nodes are being preserved in the AST
2. The OutputService is seeing raw directive nodes
3. No transformation of directives to their results is happening

### Issue 2: Directives Not Being Processed

**Root Cause**: The InterpreterService is storing nodes but not transforming them:

```typescript
switch (node.type) {
  case 'Directive':
    const directiveState = currentState.clone();
    // Just adds the node without transformation
    directiveState.addNode(node);
    currentState = await this.directiveService.processDirective(directiveNode, {
      state: directiveState,
      currentFilePath: state.getCurrentFilePath() ?? undefined
    });
    break;
}
```

The issue is:
1. Directives are processed (by DirectiveService)
2. Results are stored in state
3. But the original node is preserved in the AST
4. No node replacement with results is happening

### Issue 3: @embed Variable Input

**Root Cause**: After examining the EmbedDirectiveHandler and ResolutionService, the issue appears to be in the variable resolution flow:

1. **EmbedDirectiveHandler Processing**
   ```typescript
   // 1. Get path from directive
   const { path, section } = node.directive;

   // 2. Create resolution context
   const resolutionContext = {
     currentFilePath: context.currentFilePath,
     state: context.state,
     allowedVariableTypes: {
       text: true,
       data: true,
       path: true,
       command: false
     }
   };

   // 3. Resolve variables in path
   const resolvedPath = await this.resolutionService.resolveInContext(
     path,
     resolutionContext
   );
   ```

2. **Resolution Flow**
   - EmbedDirectiveHandler correctly attempts to resolve variables
   - ResolutionService has proper variable resolution support
   - The issue is in the node transformation gap:
     1. Directive is processed and path is resolved
     2. Content is read and parsed
     3. But no node replacement happens
     4. Original directive remains in AST

3. **Variable Resolution Support**
   - ResolutionService supports:
     - Text variables (${var})
     - Data variables (#{data})
     - Path variables ($path)
   - Resolution context allows all variable types
   - Variable resolution itself works correctly

4. **Missing Transformation**
   ```typescript
   // Current flow:
   1. Process directive -> resolve path -> read content
   2. Store in state
   3. Keep original directive node

   // Needed flow:
   1. Process directive -> resolve path -> read content
   2. Create new text/content node
   3. Replace directive node with content node
   ```

### Required Changes for @embed

1. **Node Transformation**
   ```typescript
   class EmbedDirectiveHandler {
     async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
       // ... existing resolution code ...

       // Create content node to replace directive
       const contentNode = {
         type: 'Text',
         content: processedContent
       };

       // Replace node in AST
       context.state.replaceNode(node, contentNode);

       return newState;
     }
   }
   ```

2. **State Service Enhancement**
   - Add node replacement capability
   - Track node relationships
   - Support AST modifications

3. **Handler Interface Update**
   ```typescript
   interface IDirectiveHandler {
     execute(node: DirectiveNode, context: DirectiveContext): Promise<{
       state: IStateService;
       replacement?: MeldNode;  // Optional replacement node
     }>;
   }
   ```

4. **Integration Changes**
   - Update InterpreterService to handle node replacements
   - Modify DirectiveService to pass replacements
   - Update OutputService to use transformed nodes

### Testing Strategy

1. **Variable Resolution Tests**
   ```typescript
   it('should handle variable input in embed path', async () => {
     const node = createEmbedDirective('${docPath}', undefined, createLocation(1, 1));
     const context = {
       state: stateService,
       currentFilePath: 'test.meld'
     };

     stateService.getTextVar.mockReturnValue('doc.md');
     fileSystemService.exists.mockResolvedValue(true);
     fileSystemService.readFile.mockResolvedValue('Test content');

     const result = await handler.execute(node, context);
     expect(result.replacement?.type).toBe('Text');
     expect(result.replacement?.content).toBe('Test content');
   });
   ```

2. **Node Replacement Tests**
   ```typescript
   it('should replace directive node with content', async () => {
     const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1));
     const context = { state: stateService };

     const result = await handler.execute(node, context);
     expect(stateService.replaceNode).toHaveBeenCalledWith(
       node,
       expect.objectContaining({ type: 'Text' })
     );
   });
   ```

### Implementation Plan

1. **Phase 1: Node Replacement**
   - Add node replacement to StateService
   - Update handler interface
   - Modify InterpreterService

2. **Phase 2: Variable Resolution**
   - Verify resolution context
   - Add variable resolution tests
   - Update error handling

3. **Phase 3: Integration**
   - Connect with OutputService changes
   - Update pipeline flow
   - Add end-to-end tests

### Architecture Gap

The key architectural difference from the prototype:

1. **State vs AST**
   - Prototype: Directly modifies AST, replacing nodes with results
   - Current: Stores results in state but preserves original AST

2. **Processing Flow**
   - Prototype: Immediate node replacement during processing
   - Current: Two-phase approach (process then output) without transformation

3. **Output Generation**
   - Prototype: Simply stringifies transformed AST
   - Current: Tries to handle both AST and state, but only uses AST

### Required Changes

1. **Node Transformation**
   - Add node transformation phase in InterpreterService
   - Replace directive nodes with their results
   - Keep state for variable tracking only

2. **Output Processing**
   - Modify OutputService to handle transformed nodes
   - Remove directive-specific output formatting
   - Use state only for variable resolution

3. **Handler Updates**
   - Update handlers to return result nodes
   - Modify DirectiveService to handle node replacement
   - Ensure EmbedDirectiveHandler properly resolves variables

4. **Pipeline Modification**
   ```typescript
   // Current flow:
   parse -> interpret -> store in state -> output raw nodes

   // Needed flow:
   parse -> interpret -> transform nodes -> output transformed nodes
   ```

### Next Investigation Steps

1. **EmbedDirectiveHandler**
   - Examine implementation
   - Check variable resolution
   - Verify path handling

2. **Node Transformation**
   - Design node replacement strategy
   - Identify transformation point
   - Plan handler modifications

3. **State Management**
   - Review state usage
   - Determine what stays in state
   - Plan state/AST separation

\=== COMPLETED PLAN FOR ADDRESSING ISSUES

# Implementation Plan

## Issues

During the first production run of Meld, we've identified several critical issues with output processing. These issues prevent Meld from correctly processing directives and generating clean output as specified in the grammar.

## Issue 1: Directive Definitions Appearing in Output ⏳ (In Progress)

### Description
The output currently includes the raw directive definitions themselves instead of just their processed results.

### Expected Behavior
- Plain text/markdown content should appear in output
- Results of 'run' and 'embed' directives should appear in output
- Directive definitions should NOT appear in output
- Definition/import directives (@path, @text, @data, @import, @define) should NOT appear in output
- Comment lines (>>) should NOT appear in output

### Actual Behavior
Looking at example.xml/example.md, we see:
- Directive definitions are being included verbatim
- Directive metadata (kind, identifier, etc.) is being exposed
- XML/MD structure is being created around the directives themselves

## Issue 2: Directives Not Being Processed ⏳ (In Progress)

### Description
The directives' content is not being processed - raw directive content appears instead of processed results.

### Expected Behavior
- @run directives should execute commands and include output
- @embed directives should include file contents
- Variable interpolation should occur
- Results should be properly formatted in output

### Actual Behavior
- Raw directive content appears in output
- Commands are not being executed
- Files are not being embedded
- Variables are not being interpolated

## Issue 3: @embed Variable Input (Pending)

### Description
The @embed directive is not accepting variables as input, forcing use of @text directives as a workaround.

### Expected Behavior
```meld
@embed [${role_text}]
@embed [#{task.code_review}]
```
Should work as expected, embedding the content referenced by the variables.

### Actual Behavior
Variables in @embed directives are not being processed, requiring workaround:
```meld
@text role_text = `#{role.architect}`
@embed [${role_text}]
```

---

# Additional Context and Constraints

### Path Handling
- Currently using enhanced PathService for all path-related functionality
- Path resolution is consistent across @import, @embed, and @path directives
- Security constraints are maintained through PathService
- Path validation happens in PathService
- See [dev/PATHS.md] for more detail

### Testing Infrastructure
- Tests co-located with implementation files
- TestContext provides central test harness
- Mock services available through test factories
- High test coverage (484 passing tests)
- See [docs/TESTS.md] for more detail

---

# PLAN FOR ADDRESSING ISSUES

## Incremental Implementation Strategy

### Phase 1: Add New Functionality Without Breaking Existing ✅ (Completed)

1. **StateService Enhancement (Step 1)** ✅
- Added transformation support to StateNode interface
- Implemented transformation methods in StateService
- Added comprehensive tests for transformation functionality
- All tests passing

2. **DirectiveHandler Interface Update (Step 2)** ✅
- Added DirectiveResult interface with replacement node support
- Updated base handler implementation
- Maintained backward compatibility

3. **InterpreterService Feature Flag (Step 3)** ✅
- Added transformation feature flag
- Implemented node transformation support
- Maintained existing behavior when disabled

### Phase 2: Gradual Handler Migration ✅ (Completed)

1. **EmbedDirectiveHandler Migration** ✅ (Completed)
   - Update to support node replacement
   - Maintain path handling through PathService
   - Add transformation tests
   - Verify both with feature flag on/off

2. **RunDirectiveHandler Migration** ✅ (Completed)
   - Similar process to EmbedDirectiveHandler
   - Focus on command execution results
   - Add transformation tests
   - Verify both behaviors

3. **Other Handlers** ✅ (Completed)
   - ImportDirectiveHandler successfully migrated
   - Added handler-specific transformation tests
   - Verified behavior in both modes

### Phase 3: OutputService Update (Pending)

1. **Add Dual-Mode Support**
```typescript
class OutputService {
    async convert(state: IStateService, format: OutputFormat): Promise<string> {
        const nodes = this.useNewTransformation
            ? state.getTransformedNodes()
            : state.getNodes();
        return this.nodesToFormat(nodes, format);
    }
}
```

2. **Update Tests**
   - Add transformation-aware tests
   - Verify output with both modes
   - Test complex scenarios

### Phase 3 Implementation Notes

1. **Key Learnings from Handler Migration**
   - All handlers now support both modes through `isTransformationEnabled()`
   - Transformed nodes preserve original location for error reporting
   - Each handler type has specific transformation behavior:
     - EmbedDirectiveHandler: Replaces with embedded content
     - RunDirectiveHandler: Replaces with command output
     - ImportDirectiveHandler: Removes from output (empty text node)

2. **State Management Insights**
   - Transformation state is tracked via `isTransformationEnabled()`
   - State cloning preserves transformation status
   - Child states inherit transformation mode
   - All state mutations maintain immutability

3. **Testing Strategy for OutputService**
   - Create separate transformation test file
   - Test each directive type's output behavior
   - Verify complex documents with mixed content
   - Test error cases in both modes
   - Ensure proper cleanup of directive metadata

4. **Potential Challenges**
   - Handling mixed content (directives + text)
   - Preserving formatting and whitespace
   - Managing directive-specific output rules
   - Error reporting with transformed nodes

5. **Success Criteria for Phase 3**
   - No directive definitions in output
   - Clean, properly formatted content
   - Correct handling of all directive types
   - Proper error reporting
   - Backward compatibility maintained

### Phase 4: Cleanup (Pending)

Once all handlers are migrated and tests pass:

1. Remove feature flags
2. Remove old state tracking
3. Update documentation
4. Clean up tests

## Testing Strategy

1. **Isolation**
   - New tests in *.transformation.test.ts files
   - Use TestContext for consistent setup
   - Leverage existing mock services

2. **Verification Points**
   - After each step, run full test suite
   - Verify both old and new behavior
   - Check path handling remains correct
   - Validate security constraints

3. **Coverage**
   - Maintain existing test coverage
   - Add transformation-specific cases
   - Test edge cases in both modes

## Rollback Plan

Each phase can be rolled back independently:
1. Feature flags allow quick behavior switches
2. Separate test files ease removal
3. Dual-mode implementation provides fallback

## Success Criteria

1. All 484 existing tests continue to pass
2. New transformation tests pass
3. Path handling remains secure and consistent
4. No regression in existing functionality
5. Clean separation of concerns maintained

## Test Coverage Analysis

### Existing Tests

1. **State Management** ✅
   - Variable storage and retrieval
   - Command definitions
   - State inheritance
   - State cloning

2. **Basic Directive Validation** ✅
   - Syntax validation
   - Required fields
   - Type checking

3. **Path Handling** ✅
   - Path resolution
   - Path validation
   - Directory handling

4. **Import Management** ✅
   - Circular import detection
   - Import scope
   - File resolution

### Tests Needing Changes

1. **OutputService Tests**
   ```typescript
   // Current:
   it('should convert directive nodes to markdown', async () => {
     const nodes = [createDirectiveNode('test', { value: 'example' })];
     const output = await service.convert(nodes, state, 'markdown');
     expect(output).toContain('### test Directive');
   });

   // Needed:
   it('should output directive results not definitions', async () => {
     const nodes = [createDirectiveNode('run', { command: 'echo test' })];
     const output = await service.convert(nodes, state, 'markdown');
     expect(output).toBe('test\n');
   });
   ```

2. **EmbedDirectiveHandler Tests**
   ```typescript
   // Current:
   it('should handle basic embed without modifiers', async () => {
     // Tests state updates but not node replacement
   });

   // Needed:
   it('should replace embed directive with file contents', async () => {
     const node = createEmbedDirective('test.md');
     const result = await handler.execute(node, context);
     expect(result.replacement.type).toBe('Text');
     expect(result.replacement.content).toBe('file contents');
   });
   ```

3. **RunDirectiveHandler Tests**
   ```typescript
   // Needed:
   it('should replace run directive with command output', async () => {
     const node = createRunDirective('echo test');
     const result = await handler.execute(node, context);
     expect(result.replacement.type).toBe('Text');
     expect(result.replacement.content).toBe('test\n');
   });

   it('should timeout long-running commands', async () => {
     const node = createRunDirective('sleep 1000');
     await expect(handler.execute(node, context))
       .rejects.toThrow('Command timed out');
   });
   ```

### New Tests Needed

1. **AST Transformation Tests**
   ```typescript
   describe('AST Transformation', () => {
     it('should transform directive nodes to result nodes', async () => {
       const ast = [
         createTextNode('before\n'),
         createRunDirective('echo test'),
         createTextNode('after\n')
       ];
       const result = await interpreter.process(ast);
       expect(result).toEqual([
         { type: 'Text', content: 'before\n' },
         { type: 'Text', content: 'test\n' },
         { type: 'Text', content: 'after\n' }
       ]);
     });
   });
   ```

2. **Content Verification Tests**
   ```typescript
   describe('Content Processing', () => {
     it('should process mixed content correctly', async () => {
       const input = `
         # Header
         @run [echo test]
         ## Section
         @embed [file.md]
         Footer
       `;
       const output = await process(input);
       expect(output).toBe(`
         # Header
         test
         ## Section
         embedded content
         Footer
       `);
     });
   });
   ```

## Implementation Plan

1. **Phase 1: Node Transformation**
   - Add node replacement to StateService
   - Update handler interface
   - Modify InterpreterService

2. **Phase 2: Output Processing**
   - Update OutputService to use transformed nodes
   - Remove directive-specific output formatting
   - Add content verification tests

3. **Phase 3: Command Execution**
   - Add timeout support to RunDirectiveHandler
   - Improve stdout/stderr handling
   - Add command execution tests

## Next Steps

1. Start with Phase 1 implementation
2. Add core transformation tests
3. Update existing handler tests
4. Add integration tests

## Detailed Changes Required

### 1. StateService Updates

```typescript
interface IStateService {
  // ... existing methods ...

  // Node transformation methods
  addNode(node: MeldNode): void;
  transformNode(original: MeldNode, transformed: MeldNode): void;
  getOriginalNodes(): MeldNode[];
  getTransformedNodes(): MeldNode[];
}

class StateService implements IStateService {
  private originalNodes: MeldNode[] = [];
  private transformedNodes: MeldNode[] = [];

  addNode(node: MeldNode): void {
    this.originalNodes.push(node);
    this.transformedNodes.push(node);
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    const index = this.transformedNodes.indexOf(original);
    // We'll always have the original node during transformation
    this.transformedNodes[index] = transformed;
  }

  getOriginalNodes(): MeldNode[] {
    return this.originalNodes;
  }

  getTransformedNodes(): MeldNode[] {
    return this.transformedNodes;
  }
}
```

### 2. DirectiveHandler Interface Update

```typescript
interface DirectiveResult {
  state: IStateService;
  replacement?: MeldNode;  // Optional replacement node
}

interface IDirectiveHandler {
  // Update return type to include replacement node
  execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult>;
}
```

### 3. Directive Handler Updates

```typescript
class EmbedDirectiveHandler implements IDirectiveHandler {
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    // ... existing resolution code ...

    const content = await this.fileSystemService.readFile(resolvedPath);

    // Create transformed node while preserving original location
    const transformed: MeldNode = {
      type: 'Text',
      content,
      location: node.location  // Preserve location for error reporting
    };

    return {
      state: context.state,
      replacement: transformed
    };
  }
}

class RunDirectiveHandler implements IDirectiveHandler {
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    // ... existing command execution code ...

    const output = await executeCommand(command);

    // Create replacement node
    const replacement: MeldNode = {
      type: 'Text',
      content: output,
      location: node.location
    };

    return {
      state: context.state,
      replacement
    };
  }
}
```

### 4. InterpreterService Updates

```typescript
class InterpreterService {
  async interpret(nodes: MeldNode[], options: InterpretOptions): Promise<IStateService> {
    let currentState = options.initialState ?? new StateService();

    for (const node of nodes) {
      currentState.addNode(node);  // Track original node

      if (node.type === 'Directive') {
        // Process directive and get result
        const result = await this.directiveService.processDirective(node, {
          state: currentState,
          currentFilePath: options.filePath
        });

        // Transform node if handler provided replacement
        if (result.replacement) {
          currentState.transformNode(node, result.replacement);
        }

        currentState = result.state;
      }
    }

    return currentState;
  }
}
```

### 5. OutputService Simplification

```typescript
class OutputService {
  async convert(state: IStateService, format: OutputFormat): Promise<string> {
    // Use transformed nodes for output
    const nodes = state.getTransformedNodes();
    return this.nodesToFormat(nodes, format);
  }

  private async nodeToMarkdown(node: MeldNode): Promise<string> {
    switch (node.type) {
      case 'Text':
        return node.content;
      case 'CodeFence':
        return this.formatCodeFence(node);
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`);
    }
  }
}
```

### 6. Test Updates

1. **StateService Tests**
```typescript
describe('StateService node transformation', () => {
  it('should maintain both original and transformed nodes', () => {
    const state = new StateService();
    const original = createTextNode('original');
    const transformed = createTextNode('transformed');

    state.addNode(original);
    state.transformNode(original, transformed);

    expect(state.getTransformedNodes()).toEqual([transformed]);
    expect(state.getOriginalNodes()).toEqual([original]);
  });

  it('should preserve node order during transformation', () => {
    const state = new StateService();
    const node1 = createTextNode('one');
    const node2 = createDirectiveNode('run', { command: 'test' });
    const node3 = createTextNode('three');
    const transformed2 = createTextNode('two');

    state.addNode(node1);
    state.addNode(node2);
    state.addNode(node3);
    state.transformNode(node2, transformed2);

    expect(state.getTransformedNodes()).toEqual([node1, transformed2, node3]);
    expect(state.getOriginalNodes()).toEqual([node1, node2, node3]);
  });
});
```

2. **DirectiveHandler Tests**
```typescript
describe('EmbedDirectiveHandler', () => {
  it('should return replacement node with file contents', async () => {
    const node = createEmbedDirective('test.md');
    fileSystem.readFile.mockResolvedValue('file contents');

    const result = await handler.execute(node, context);

    expect(result.replacement).toBeDefined();
    expect(result.replacement.type).toBe('Text');
    expect(result.replacement.content).toBe('file contents');
  });
});
```

3. **InterpreterService Tests**
```typescript
describe('directive processing', () => {
  it('should replace directive nodes with their results', async () => {
    const directive = createRunDirective('echo test');
    const replacement = createTextNode('test output');

    directiveService.processDirective.mockResolvedValue({
      state: new StateService(),
      replacement
    });

    const result = await interpreter.interpret([directive], {});
    expect(result.getNodes()).toEqual([replacement]);
  });
});
```

### Implementation Order

1. **Phase 1a: Core Updates**
   - Add `replaceNode` to StateService
   - Update DirectiveHandler interface
   - Add corresponding tests

2. **Phase 1b: Handler Updates**
   - Update EmbedDirectiveHandler
   - Update RunDirectiveHandler
   - Add replacement node tests

3. **Phase 1c: Interpreter Updates**
   - Modify node processing to handle replacements
   - Add transformation tests
   - Test state management with replacements

4. **Phase 2: Output Cleanup**
   - Remove directive formatting code
   - Update output tests
   - Add integration tests

## Implementation Notes & Learnings

### Phase 1 Completion Notes
1. **StateService Implementation Details**
   - Transformation state is tracked via `_transformationEnabled` boolean flag
   - When enabled, `transformedNodes` array is initialized with a fresh copy of nodes
   - Transformation state and nodes are properly preserved during clone operations
   - All state mutations maintain immutability through StateFactory

2. **Key Design Decisions**
   - Opted for explicit transformation enabling/disabling rather than implicit
   - Maintained original nodes array for backward compatibility
   - Used optional `transformedNodes` in StateNode interface for cleaner typing
   - Preserved node locations for error reporting in transformed nodes

3. **Testing Insights**
   - All transformation tests are isolated in `*.transformation.test.ts` files
   - Current test coverage includes edge cases like:
     - Transformation state during cloning
     - Immutability violations
     - Invalid node transformations
     - State persistence across operations

### Considerations for Phase 2
1. **EmbedDirectiveHandler Migration**
   - Will need to handle both file content and variable interpolation
   - Must preserve file path resolution security
   - Consider caching transformed content for performance
   - Need to handle errors in both transformation and traditional modes

2. **RunDirectiveHandler Complexity**
   - Command execution is asynchronous - consider impact on transformation
   - Output capture needs to handle both stdout and stderr
   - Security implications of command execution during transformation
   - Consider timeout handling in transformation context

3. **Potential Challenges**
   - Circular dependencies in transformations
   - Error propagation through transformation chain
   - Performance impact of transformation overhead
   - Memory usage with large documents

### Critical Path Dependencies
1. **Path Resolution**
   - All file operations must go through PathService
   - Security checks must be maintained during transformation
   - Path variables need to be resolved before transformation

2. **State Management**
   - Transformations must preserve state immutability
   - Child states must handle transformed nodes correctly
   - State merging must account for transformation status

3. **Error Handling**
   - All errors must maintain original node location
   - Transformation errors should not break traditional processing
   - Clear error messages needed for transformation-specific issues

\=== SUBSEQUENT ISSUES ENCOUNTERED

# Test Failure Analysis

## Current Test Failures

We currently have 7 failing tests across two main areas:

### 1. API Integration Tests (4 failures)

All failing with the same error: "currentState.clone is not a function"

- `api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly`
- `api/api.test.ts > SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives`
- `api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline`
- `api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode`

### 2. OutputService Tests (3 failures)

All failing with transformation-related issues:

- `services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should use transformed nodes when transformation is enabled`
- `services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle mixed content in transformation mode`
- `services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes`

## Root Causes Analysis

### 1. State Service Clone Implementation

The `StateService` class has a `clone()` method implementation, but it's not being recognized in some contexts. Looking at the code:

```typescript
clone(): IStateService {
  const cloned = new StateService();

  // Create a completely new state without parent reference
  cloned.currentState = this.stateFactory.createState({
    source: 'clone',
    filePath: this.currentState.filePath
  });

  // Copy all state
  cloned.updateState({
    variables: {
      text: new Map(this.currentState.variables.text),
      data: new Map(this.currentState.variables.data),
      path: new Map(this.currentState.variables.path)
    },
    commands: new Map(this.currentState.commands),
    nodes: [...this.currentState.nodes],
    transformedNodes: this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : undefined,
    imports: new Set(this.currentState.imports)
  }, 'clone');

  // Copy flags
  cloned._isImmutable = this._isImmutable;
  cloned._transformationEnabled = this._transformationEnabled;

  return cloned;
}
```

The implementation looks correct, but the error suggests that either:
1. The mock state service in the tests isn't properly implementing the clone method
2. The real state service isn't being used where expected
3. Type casting issues are preventing the clone method from being recognized

### 2. OutputService Transformation Handling

The `OutputService` has several issues with transformation handling:

1. **Node Processing Logic**: The service tries to use transformed nodes when available:
```typescript
const nodesToProcess = state.isTransformationEnabled?.() && state.getTransformedNodes?.()
  ? state.getTransformedNodes()
  : nodes;
```

2. **Directive Node Handling**: The service has special handling for directive nodes in transformation mode:
```typescript
case 'Directive':
  // If we're processing transformed nodes, we shouldn't see any directives
  // They should have been transformed into Text or CodeFence nodes
  if (isTransformed) {
    throw new MeldOutputError('Unexpected directive in transformed nodes', 'markdown');
  }
```

3. **Test Expectations**: The tests expect:
   - Original command: `echo test`
   - Transformed output: `test output`
   But they're getting the original command instead of the transformed output.

### 3. RunDirectiveHandler Transformation

The `RunDirectiveHandler` is responsible for transforming run directives into text nodes:

```typescript
if (clonedState.isTransformationEnabled()) {
  const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr;
  const replacementNode: MeldNode = {
    type: 'text',
    content,
    location: node.location
  };
  return { state: clonedState, replacementNode };
}
```

The issue might be that:
1. The transformation isn't being applied correctly
2. The transformed nodes aren't being stored in the state
3. The OutputService isn't using the transformed nodes even when available

## Mock Implementation Analysis

The mock state service in `OutputService.test.ts` has its own implementation of transformation-related methods:

```typescript
isTransformationEnabled(): boolean {
  return this.transformationEnabled;
}

enableTransformation(enable: boolean): void {
  this.transformationEnabled = enable;
}

getTransformedNodes(): MeldNode[] {
  return [...this.transformedNodes];
}

setTransformedNodes(nodes: MeldNode[]): void {
  this.transformedNodes = [...nodes];
}
```

This implementation looks correct, but there might be issues with:
1. How the transformed nodes are being stored
2. When and how the transformation state is being updated
3. Whether the mock is properly simulating the real service's behavior

## Analysis of Proposed Solutions

### Solution 1 (test-answer-2.md)

#### What it Got Right:
1. Correctly identified that `clone()` was missing from the `IStateService` interface
2. Recognized that the issue was systemic across all four failing tests
3. Accurately noted that the interpreter and integration tests rely on `clone()` for state management
4. Correctly suggested that all state fields need to be copied in the clone implementation

#### What it Missed:
1. Oversimplified the state structure by suggesting a basic node array implementation
2. Did not address the transformation mode issues in the OutputService tests
3. Did not recognize the potential issues with the mock implementations

### Solution 2 (test-answer-3.md)

#### What it Got Right:
1. Identified three distinct but related issues
2. Correctly noted that `setTransformedNodes` was missing
3. Accurately identified issues with node transformation behavior
4. Provided a more complete implementation including transformation state

#### What it Missed:
1. The `StateService` already had a more sophisticated implementation with `stateFactory`
2. Did not address the optional chaining issues in the OutputService
3. Overlooked the potential type casting issues in the API tests

### Solution 3 (test-answer-4.md)

#### What it Got Right:
1. Correctly identified that the RunDirectiveHandler was returning the wrong content
2. Recognized the issue with OutputService not properly using transformed nodes
3. Noted the importance of transformation mode being properly enabled
4. Identified the need to check both the command execution and its output handling

#### What it Missed:
1. Suggested adding `useNewTransformation` which doesn't exist in the current implementation
2. Did not recognize that the `OutputService` already has transformation handling
3. Overlooked the existing `stateFactory` pattern in the `StateService`

### Solution 5 (test-answer-5.md)

#### What it Got Right:
1. Most precise and minimal solution of all attempts
2. Correctly identified that the fixes should align with existing architecture
3. Recognized the optional chaining issue in OutputService's transformation check
4. Provided exact code changes with proper context
5. Understood that the RunDirectiveHandler needs to use actual command output
6. Correctly noted that the transformation mode check should use `isTransformationEnabled()`

#### Key Improvements Over Previous Solutions:
1. No unnecessary architectural changes or new flags
2. Works within existing patterns rather than suggesting alternatives
3. Addresses the optional chaining issue that others missed
4. Provides more specific guidance about command output handling
5. Better understanding of the existing transformation mode infrastructure

### Updated Synthesis

Solution 5 helps us refine our previous synthesis. The most effective fix should:

1. Make minimal interface changes:
   - Add only `clone()` to `IStateService`
   - No additional transformation-related methods needed

2. Fix the RunDirectiveHandler:
   - Use actual command output instead of raw command
   - Ensure proper stdout/stderr handling
   - Keep existing transformation mode checks

3. Improve OutputService:
   - Replace optional chaining with direct `isTransformationEnabled()` check
   - Keep existing transformation handling logic
   - No need for new transformation flags

4. Update mock implementations:
   - Ensure they implement `clone()`
   - Match real service behavior for command execution
   - Properly handle transformation state

This refined approach is more surgical and better aligned with the existing codebase than our previous synthesis.

## Revised Next Steps

Based on this analysis, our next steps should be:

1. **Interface Completion**:
   - Add `clone()` to `IStateService`
   - Ensure all necessary transformation methods are declared

2. **StateService Implementation**:
   - Implement `clone()` using the existing `stateFactory` pattern
   - Verify all state fields are properly copied

3. **Mock Service Alignment**:
   - Update mock implementations to match the real service behavior
   - Add proper transformation state handling to mocks

4. **Transformation Flow**:
   - Fix RunDirectiveHandler output handling
   - Ensure OutputService correctly uses transformed nodes
   - Verify transformation mode is properly enabled and detected

5. **Test Infrastructure**:
   - Add tests specifically for state cloning
   - Verify transformation behavior in isolation
   - Add integration tests for the complete pipeline

## Additional Observations

1. The error "currentState.clone is not a function" suggests a fundamental issue with how the state service is being used or mocked in the API tests.

2. The transformation tests failing in OutputService suggest that while the basic transformation infrastructure is in place, there are issues with how transformed content is being handled and passed through the system.

3. The mock services might be oversimplified, not fully replicating the behavior of the real services, especially regarding state management and transformation.

4. The transformation feature seems to work in isolation (as evidenced by some passing tests) but fails in more complex scenarios, suggesting integration issues rather than fundamental implementation problems.

## What We've Learned From Failed Attempts

### 1. Path Service Initialization Issue
Our attempt to fix the issue by initializing the path service in the `main` function did not resolve the core problems. This revealed that:
- Simply initializing services in the correct order is not sufficient
- The issue likely lies deeper in how state is being managed across service boundaries
- Path service initialization, while necessary, is not the root cause of our test failures

### 2. State Management Complexity
Our investigation revealed several layers of state management issues:
- The `clone()` method exists in the real `StateService` but is missing from mocks and interfaces
- State transformation is handled inconsistently across different parts of the system
- The relationship between state cloning and transformation is more complex than initially assumed
- Mock implementations in tests may not be fully replicating the real service behavior

### 3. Service Initialization Order Dependencies
We've discovered that:
- The order of service initialization matters more than previously thought
- Services have implicit dependencies that aren't clearly documented
- The test context setup may not be fully replicating the production initialization sequence
- Some services require explicit initialization while others initialize implicitly

### 4. Test Context Limitations
Our attempts highlighted several issues with the test context:
- The test context may not be properly preserving state between operations
- Mock implementations might be oversimplified
- The test context's service initialization may not match production exactly
- Some service interactions that work in production may be breaking in tests

### 5. Transformation Mode Inconsistencies
We found that:
- Transformation mode is not consistently respected across all services
- The OutputService's transformation handling is more complex than initially understood
- There are edge cases in transformation that our tests aren't properly covering
- The interaction between transformation mode and state cloning needs more attention

### 6. Failed Approaches
The following approaches did not work:
1. Simply adding `clone()` to the interface without addressing the underlying state management
2. Initializing services in a different order
3. Modifying the OutputService transformation logic without addressing state management
4. Trying to fix the RunDirectiveHandler without addressing the state cloning issue
5. Adding path service initialization in isolation

### 7. Next Steps Based on Failed Attempts
Our failed attempts suggest we should:
1. Start with a complete audit of the `IStateService` interface and its implementations
2. Verify that all mock implementations properly support state cloning
3. Review the transformation mode implementation across all services
4. Ensure test context initialization matches production service initialization
5. Add more comprehensive tests for state cloning and transformation interactions

### 8. Key Insights
1. The issues are more interconnected than they initially appeared
2. Fixing individual services in isolation is not effective
3. We need a more holistic approach to state management
4. Test infrastructure may need improvements to better match production behavior
5. Service initialization and dependencies need better documentation and possibly refactoring

These learnings suggest we need to take a step back and address the fundamental state management and service initialization issues before trying to fix individual test failures.

## Analysis of Methodical Debugging Approach (test-answer-6.md)

### What We Got Right
1. We correctly identified the major categories of issues:
   - State cloning problems
   - Transformation mode inconsistencies
   - Mock implementation gaps
   - Service initialization complexities

2. Our "Next Steps" align with several key recommendations:
   - Interface audit for IStateService
   - Mock implementation verification
   - Transformation mode review
   - Test context improvements

### What We Missed or Could Improve

1. **Systematic Evidence Collection**
   - We haven't been methodically logging and comparing the state at each step
   - Need to add instrumentation to track the full transformation chain
   - Should create a comparison table of passing vs failing test setups
   - Missing detailed flow diagrams of state and transformation paths

2. **Isolation Testing Strategy**
   - Need dedicated mini-test suites for core functionality
   - Should create `StateService.clone.test.ts` specifically for cloning
   - Missing isolated tests for transformation behavior
   - Need to verify service behavior independently before integration

3. **Contradiction Analysis**
   - Haven't fully examined potential conflicts in test expectations
   - Need to verify consistent rules for directive handling in transformation mode
   - Should audit all transformation-related tests for conflicting requirements
   - Missing clear documentation of transformation mode expectations

4. **Debug Infrastructure**
   - Need better logging throughout the transformation chain
   - Should add state inspection points in critical paths
   - Missing systematic comparison of object shapes between tests
   - Need better visibility into service initialization sequence

### Revised Action Plan

1. **Phase 1: Evidence Collection and Mapping** (New)
   - Create detailed flow diagrams for state cloning and transformation paths
   - Add comprehensive logging throughout the transformation chain
   - Document all service initialization sequences
   - Map out all transformation mode expectations

2. **Phase 2: Isolation Testing** (New)
   - Create `StateService.clone.test.ts`
   - Build minimal transformation test suite
   - Test directive handling in isolation
   - Verify service initialization independently

3. **Phase 3: Interface and Mock Alignment** (Existing)
   - Complete IStateService interface audit
   - Update all mock implementations
   - Verify transformation method consistency
   - Document service contracts

4. **Phase 4: Integration Verification** (Enhanced)
   - Compare passing vs failing test setups
   - Verify transformation flow end-to-end
   - Test service initialization sequences
   - Validate state management across boundaries

5. **Phase 5: Infrastructure Improvements** (Enhanced)
   - Enhance test context capabilities
   - Add debugging infrastructure
   - Improve service initialization framework
   - Document all implicit dependencies

### Key Differences in Approach

1. **Evidence-First vs Solution-First**
   - Previous: Jumped to potential solutions
   - New: Gather comprehensive evidence before making changes

2. **Isolation vs Integration**
   - Previous: Focused mainly on integration points
   - New: Start with isolated components, then integrate

3. **Documentation Level**
   - Previous: Limited documentation of findings
   - New: Comprehensive mapping and documentation of all behaviors

4. **Testing Strategy**
   - Previous: Relied on existing test structure
   - New: Create dedicated test suites for core functionality

5. **Debug Infrastructure**
   - Previous: Ad-hoc debugging
   - New: Systematic logging and state inspection

This methodical approach should help us avoid the "ping-pong" effect of fixing one issue only to break another, and ensure we have a complete understanding of the system before making changes.

\=== YOUR ADVICE (VERY IMPORTANT CONTEXT)

# Advice

Below is a high-level strategy for tracking down these failures in a methodical, evidence-based way. Rather than focusing on “quick fixes,” the idea is to deeply trace how data, services, and mocks flow through your system, comparing the passing tests to failing ones and surfacing inconsistencies or missing connections. By methodically instrumenting each step and capturing evidence, you can pinpoint exactly where reality (the actual code) and expectations (the tests) diverge.

────────────────────────────────────────────────────────────────────
1. IDENTIFY AND MAP EACH CRITICAL FLOW
────────────────────────────────────────────────────────────────────

Given the breadth of these errors, you have at least two broad, failing “flows”:

• The “State Cloning” flow (the “currentState.clone” error in the API Integration Tests).
• The “Transformation Mode” flow (where the OutputService is returning “echo test” instead of “test output”).

First effort: map each of these end-to-end, stepping through how data is supposed to move from the initial parse all the way to the final conversion. Where do you create or clone states? Where do you store transformed nodes? Where does the OutputService pick them up? This mapping should be written out in detail—literally a small flow diagram or bullet list that references the actual classes/functions.

────────────────────────────────────────────────────────────────────
2. CHECK FOR INTERFACE AND MOCK INCONSISTENCIES
────────────────────────────────────────────────────────────────────

Many of these failures point to the test code using something that either:
 • Does not exist on the real object (e.g. “getTextVar is not a function”).
 • Is not implemented in the mock (e.g. “currentState.clone is not a function”).

Methodical approach:
1. Compare, side by side, the real “StateService” class (and any relevant real services) to each test double or mock. Which methods are missing or not returning the same shape?
2. Check the “IStateService” interface for completeness. Is “clone” declared? Are the transformation methods declared the same way the real code uses them?
3. Search for test files that cast or stub out the state incorrectly. For example, some test might mock “IStateService” as a plain object that lacks “clone.”

You want a bulletproof alignment: if the real “StateService” has “clone(),” any interface, stub, and usage in tests must reflect that.

────────────────────────────────────────────────────────────────────
3. INSTRUMENT THE TEST SETUPS AND CAPTURE EVIDENCE
────────────────────────────────────────────────────────────────────

For each major failing test (especially the ones with “currentState.clone is not a function” or “getTextVar is not a function”), add instrumentation that logs which classes are actually instantiated and which methods are attached. For example:

• In the “SDK Integration Tests” that fail with “currentState.clone is not a function,” add a small debug statement to see what type the test is actually injecting as “currentState.” Is it a real “StateService,” a mock, or some partial object?
• In the OutputService transformation tests, log “isTransformationEnabled,” “getTransformedNodes,” and the final nodes you are about to convert. Confirm whether the directive node is replaced with “test output” or if it is never replaced.

This approach surfaces the mismatch between your assumptions and the actual objects running inside the test. Once you see the real shape of the objects, you can more easily spot the cause.

────────────────────────────────────────────────────────────────────
4. CAREFULLY COMPARE PASSING VS. FAILING TESTS
────────────────────────────────────────────────────────────────────

Some tests (especially in OutputService) pass, indicating that transformation logic works in certain conditions. Meanwhile, similar tests fail. This discrepancy often comes down to one or two subtle differences in test setup or usage. Look for the following in each pair of pass/fail tests:

1. Which service or mock is used in each? (Do passing tests spin up the real StateService while failing ones use a partial mock?)
2. Are transformations or states toggled in the same way? (Compare how “transformationEnabled” is set. Possibly a passing test calls enableTransformation(true) at a different point, while the failing test never does.)
3. Are node arrays or “transformedNodes” being properly assigned in one test suite but not in the other?

Use a side-by-side table: the lines in the test setup, the lines in the code, and the final data each test receives.

────────────────────────────────────────────────────────────────────
5. EXAMINE TEST EXPECTATIONS FOR CONTRADICTIONS
────────────────────────────────────────────────────────────────────

There is a risk that, across your many test suites, some tests simply expect contradictory behaviors. In particular:

• Some tests want certain directive nodes to vanish or be replaced by “test output” in transformation mode.
• Others might want certain directive metadata to remain intact or appear in the final output.

You can see a hint of conflict around directives in transformation mode:
• The code tries to throw an error if it sees a directive in the “transformed” node set.
• Yet other tests might be letting directive nodes remain.

A thorough approach is to unify (or at least verify) the fundamental rule of transformation: “Should directives always become text or code when transformation is enabled, or is some pass-through allowed?” If your code indicates an “Unexpected directive” error in the transformed set but a test expects that directive to remain, you may have a genuinely conflicting requirement.

────────────────────────────────────────────────────────────────────
6. RECONSTRUCT THE STATE HANDLING LOGIC IN MINI-TESTS
────────────────────────────────────────────────────────────────────

Because the “clone” and “getTextVar” errors suggest major confusion in your state management or in the return values, it is often helpful to write a small but thorough “mini” test suite that focuses on only the state-handling portion in isolation. For example:

1. Create a dedicated “StateService.clone.test.ts” that:
   • Instantiates the real StateService.
   • Populates it with sample data.
   • Calls “clone()” and verifies all relevant fields are indeed copied.

2. Create a second mini test around “DirectiveService.processImport()” returning an object with real or mock state. Confirm that after processing an import, the returned object definitely has “getTextVar()” or not.

If these mini-tests pass reliably, you’ll know the real implementation is correct in isolation. If something fails, you’ll find the mismatch in how your “DirectiveService” or “StateService” is returning results. Then you can map that knowledge back onto the failing big tests.

────────────────────────────────────────────────────────────────────
7. ADDRESS THE OUTPUTSERVICE TRANSFORMATION CONFLICTS
────────────────────────────────────────────────────────────────────

For the “echo test” vs. “test output” mismatch, zero in on exactly which node is present right before calling “OutputService.convert.” The test implies that “echo test” is supposed to have been replaced in transformation mode by “test output.” So ask:

1. Does the “RunDirectiveHandler” store a replacement node with “test output” in “transformedNodes”?
2. Does the “OutputService” actually call “state.getTransformedNodes()”? (Log it!)
3. If it does, is that array empty (meaning the directive was never replaced), or does the array contain the correct text node?

In short, if the directive is not replaced or the method is never called, you will keep seeing “echo test.” If the directive is replaced but the OutputService is ignoring “transformedNodes,” same outcome.

Instrument these steps with debug logs or console prints so that you can see the entire chain from “run directive => transform => store new node => OutputService picks up node.”

Once you have the logs from a failing scenario, cross-compare to a truly passing scenario (like a simpler directive transformation test that passes). You will quickly see which step in the chain is broken.

────────────────────────────────────────────────────────────────────
8. REVISE TEST INFRASTRUCTURE WHERE NEEDED
────────────────────────────────────────────────────────────────────

If your deeper instrumentation reveals that the test environment is set up differently from production (e.g., real code relies on a default “StateFactory” that is not invoked in the test environment), revise the test harness. This might involve:

• Ensuring you use the real “StateFactory” in integration tests instead of patching in a half-complete mock.
• Making the global “service initialization” match how the app runs in production so that “clone” truly is available.

Any mismatch in service initialization—particularly with partial stubs or half-implemented mocks—will cause repeated partial fixes and “ping-ponging” test results.

────────────────────────────────────────────────────────────────────
9. TAKE STOCK OF THE FAILED ATTEMPTS (AND WHY THEY MISSED)
────────────────────────────────────────────────────────────────────

From your summary, each previous solution touched only slices of the bigger problem:

• Some solutions fixed “clone” but ignored transformation.
• Others improved transformation usage but overlooked the missing mock method.
• Some recognized optional-chaining logic in “OutputService” but never addressed the mismatch in directive expectations.

By looking at them together, it is clear that issues are deeply entangled:
 • You must ensure consistent interfaces and mocks (missing “clone()”).
 • You must ensure consistent transformation semantics (especially for directives).
 • You must unify how the test environment is set up (so you don’t store data in “transformedNodes” in real code but nowhere in the mock).

Each fix that focuses on only one problem is failing if the others remain. Hence the reason for a broader, evidence-collecting approach that verifies all services and test stubs in concert.

────────────────────────────────────────────────────────────────────
10. OUTLINE YOUR STEP-BY-STEP “ACTION PLAN”
────────────────────────────────────────────────────────────────────

Here is a concise plan you can follow (in order):

1. DO AN INTERFACE AUDIT
   • Confirm “IStateService” includes every method the real “StateService” uses, including “clone,” “getTextVar” (if needed), etc.
   • Update your mocks to match.

2. CREATE MINIMAL STATE/MOCK TESTS
   • Write small tests to confirm the real “StateService” clone functionality.
   • Write small tests for the directive service’s return object (should it have “getTextVar”?).

3. REPEAT “TRANSFORMATION MODE” IN A MINI TEST
   • Construct a single run directive, ensure transformation is true, then confirm the directive node is replaced by a text node containing “test output.”
   • Immediately pass that state to OutputService, verifying that the output is indeed “test output.”

4. INSTRUMENT AND COMPARE
   • Add console logs or debug statements to the failing integration tests to see exactly which object type is being used for “currentState.” Confirm that “clone()” is present. Confirm that “transformedNodes” is populated.
   • Compare outputs from any passing transformation tests to the failing ones and highlight the differences.

5. FIX AND RETEST
   • Once you find missing methods/fields or see that “transformedNodes” is never populated, fix the actual service code or your mock code.
   • Rerun the entire suite. If new failures appear, re-instrument them in the same methodical way.

6. RESOLVE DIRECTIVE CONTRADICTIONS
   • If you still get “Unexpected directive in transformed nodes,” confirm whether your system truly should have zero directives in transformed mode. If a test demands them, decide if that test is invalid or if your design must change.

7. UPDATE LONGER-RUNNING INTEGRATION TESTS
   • After you unify the system, ensure that the integration tests do not rely on partial stubbing or nondeterministic environment setups.
   • If tests still fail, add further instrumentation (like a “transformation debug log”) just for those bigger tests.

By following each step in sequence—always capturing logs, verifying the real vs. mock code, and cross-checking with a minimal example—you’ll avoid incomplete patchwork fixes and systematically press each puzzle piece into place.

────────────────────────────────────────────────────────────────────

The overarching theme: carefully gather evidence at each step to discover exactly where the real system deviates from the tests. Write small isolation tests plus instrumented logs in your bigger integration tests. Compare passing vs. failing code paths. Resolve or rewrite contradictory test expectations if necessary. This approach will solidify your entire codebase’s consistency and finally end the repeated “ping-pong” test failures.

\======= END CONTEXT

\======= YOUR TASK

Consider the plan laid out in your advice above. Make improvements to it as you see fit based on deeper reflection on the provided context and goals here.

Deliver a phased plan which includes the following:

1. relevant context necessary to understand the goals and purpose of the work
2. ensure the plan is wholly informed by and complementary to our existing architecture and testing infrastructure
3. ensure the plan covers changes we need to make to existing code, tests, infra, and docs.

The plan should be phased in an incremental way that ensures current tests will continue to pass.

BE SPECIFIC AND DECISIVE. DO NOT PROVIDE ANYTHING HAND-WAVY. YOUR PLAN SHOULD BE BASED SOLELY ON EVIDENCE AND FACTS. DO NOT HALLUCINATE OR GUESS.
