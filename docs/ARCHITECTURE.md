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
 │   │   ├─ MeldError.ts
 │   │   ├─ ServiceInitializationError.ts   ← Service initialization errors
 │   │   └─ ... other errors
 │   ├─ types/             ← Core type definitions  
 │   │   ├─ dependencies.ts  ← Service dependency definitions
 │   │   └─ index.ts
 │   └─ utils/             ← Logging and utility modules  
 │       ├─ logger.ts
 │       ├─ serviceValidation.ts  ← Service validation utilities
 │       └─ simpleLogger.ts
 ├─ services/              ← Core service implementations  
 │   ├─ pipeline/          ← Main transformation pipeline  
 │   │   ├─ ParserService/     ← Initial parsing  
 │   │   ├─ InterpreterService/← Pipeline orchestration  
 │   │   ├─ DirectiveService/  ← Directive handling  
 │   │   │   ├─ handlers/  
 │   │   │   │   ├─ definition/   ← Handlers for definition directives  
 │   │   │   │   └─ execution/    ← Handlers for execution directives  
 │   │   │   └─ errors/  
 │   │   └─ OutputService/    ← Final output generation  
 │   ├─ state/             ← State management  
 │   │   ├─ StateService/      ← Core state management  
 │   │   └─ StateEventService/ ← Core event system  
 │   ├─ resolution/        ← Resolution and validation  
 │   │   ├─ ResolutionService/ ← Variable/path resolution  
 │   │   ├─ ValidationService/ ← Directive validation  
 │   │   └─ CircularityService/← Circular dependency detection  
 │   ├─ fs/                ← File system operations  
 │   │   ├─ FileSystemService/ ← File operations  
 │   │   ├─ PathService/      ← Path handling  
 │   │   └─ PathOperationsService/ ← Path utilities  
 │   └─ cli/               ← Command line interface  
 │       └─ CLIService/    ← CLI entry point  
 ├─ tests/                  ← Test infrastructure   
 │   ├─ fixtures/          ← Test fixture data  
 │   ├─ mocks/             ← Test mock implementations  
 │   └─ utils/             ← Test utilities and helpers  
 │       ├─ debug/         ← Test debug utilities  
 │       │   ├─ StateDebuggerService/  
 │       │   ├─ StateVisualizationService/  
 │       │   ├─ StateHistoryService/  
 │       │   └─ StateTrackingService/  
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
• services/pipeline/: Core transformation pipeline services (parsing, interpretation, directives, output)  
• services/state/: State management and event services  
• services/resolution/: Resolution, validation, and circularity detection services  
• services/fs/: File system, path handling, and operations services  
• services/cli/: Command line interface services  
• core/: Central types, errors, and utilities used throughout the codebase  
• tests/utils/: Test infrastructure including debug utilities, memfs implementation, fixture management, and test helpers  
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
   │ InterpreterService.interpret(nodes, options)    │
   │   → For each node, pass to DirectiveService     │
   │   → Handles node transformations                │
   └─────────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ DirectiveService                         │
   │   → Routes to correct directive handler  │
   │   → Handlers can provide replacements    │
   └──────────────────────────────────────────┘
                │
                ▼
   ┌───────────────────────────────────────────────┐
   │ StateService + ResolutionService + Others     │
   │   → Stores variables and transformed nodes    │
   │   → Path expansions, data lookups, etc.       │
   └───────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ OutputService                            │
   │   → Uses transformed nodes for output    │
   │   → Generates clean, directive-free      │
   │     markdown, LLM XML, or other formats  │
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
   - Supports node transformation through DirectiveResult interface
   - Handlers can provide replacement nodes for transformed output

### InterpreterService  
   - Orchestrates the main interpret(nodes) pipeline  
   - For each AST node:
       a) If it's text, store it or pass it along  
       b) If it's a directive:
          - Calls DirectiveService for processing
          - Handles node transformations if provided
          - Updates state with transformed nodes
   - Maintains the top-level process flow
   - Supports transformation mode through feature flags

### StateService  
   - Stores variables in maps:
       • textVars (for @text)  
       • dataVars (for @data)  
       • pathVars (for @path)  
       • commands (for @define)  
   - Tracks both original and transformed MeldNodes
   - Provides transformation capabilities for directive processing
   - Maintains transformation state during cloning
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
    - Uses transformed nodes when available
    - Supports markdown and LLM XML output  
    - Integrates with llmxml for LLM-friendly formatting  
    - Handles format-specific transformations
    - Provides clean output without directive definitions

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

## DEBUGGING INFRASTRUCTURE

The codebase includes specialized debugging services located in `tests/utils/debug/` that help diagnose and troubleshoot state-related issues:

### StateDebuggerService
   - Provides debug session management and diagnostics
   - Tracks state operations and transformations
   - Offers operation tracing and analysis
   - Helps identify state manipulation issues

### StateVisualizationService
   - Generates visual representations of state
   - Creates Mermaid/DOT graphs of state relationships
   - Visualizes state metrics and transformations
   - Aids in understanding complex state changes

### StateHistoryService
   - Records chronological state changes
   - Maintains operation history
   - Tracks transformation chains
   - Enables state change replay and analysis

### StateTrackingService
   - Monitors state relationships and dependencies
   - Tracks state lineage and inheritance
   - Records metadata about state changes
   - Helps debug scope and inheritance issues

Debugging Approach:
• Services can be enabled selectively in tests
• Debug output includes detailed state snapshots
• Visual representations help understand complex states
• History tracking enables step-by-step analysis

These debugging services are particularly useful for:
• Troubleshooting complex state transformations
• Understanding directive processing chains
• Analyzing variable resolution paths
• Debugging scope inheritance issues
• Visualizing state relationships

## SERVICE RELATIONSHIPS

Services in Meld follow a strict initialization order and dependency graph:

1. Base Services:
   - FileSystemService (no dependencies)
   - PathService (depends on FS)

2. State Management:
   - StateEventService (no dependencies)
   - StateService (depends on events)

3. Core Pipeline:
   - ParserService (independent)
   - ResolutionService (depends on State, FS)
   - ValidationService (depends on Resolution)
   - CircularityService (depends on Resolution)

4. Pipeline Orchestration:
   - DirectiveService (depends on multiple services)
   - InterpreterService (orchestrates others)

5. Output Generation:
   - OutputService (depends on State)

6. Debug Support:
   - DebuggerService (optional, depends on all)

Service initialization and validation is handled through the core/types/dependencies.ts system,
which ensures services are created in the correct order and all dependencies are satisfied.

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
