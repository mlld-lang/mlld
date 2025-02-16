# Meld Architecture

───────────────────────────────────────────────────────────
1. INTRODUCTION
───────────────────────────────────────────────────────────

Meld is a specialized, directive-based scripting language designed for embedding small “@directives” inside an otherwise plain text (e.g., Markdown-like) document. The code in this repository implements:

• Meld grammar rules and token types (e.g., text directives, path directives, data directives).  
• The parsing layer that converts Meld content into an AST (Abstract Syntax Tree).  
• A directive interpretation layer that processes these AST nodes and manipulates internal “states” to store variables and more.  
• A resolution layer to handle variable references, path expansions, data manipulations, etc.  
• Testing utilities and an in-memory FS (memfs) to simulate filesystems for thorough testing.  

The main idea:  
1. Meld code is parsed to an AST.  
2. Each directive node is validated and interpreted, updating a shared “state” (variables, data structures, commands, etc.).  
3. Optional transformations (e.g., output formatting) generate final representations (Markdown, LLM-friendly XML, etc.).  

Below is an overview of the directory and service-level architecture, referencing code from this codebase.

───────────────────────────────────────────────────────────
2. DIRECTORY & FILE STRUCTURE
───────────────────────────────────────────────────────────

At a high level, the project is arranged as follows (select key entries included):

project-root/  
 ├─ services/  
 │   ├─ PathService/  
 │   ├─ FileSystemService/  
 │   ├─ CircularityService/  
 │   ├─ ValidationService/  
 │   ├─ StateService/  
 │   ├─ InterpolationService/ (in code: “ResolutionService/” covers interpolation, variable resolution, etc.)  
 │   ├─ DirectiveService/  
 │   ├─ ParserService/  
 │   ├─ InterpreterService/  
 │   ├─ OutputService/  
 │   └─ …  
 ├─ tests/  
 │   ├─ integration/  
 │   ├─ unit/  
 │   ├─ fixtures/  
 │   ├─ utils/  ← Contains MemfsTestFileSystem.ts, ProjectBuilder.ts, TestContext.ts, etc.  
 │   └─ …  
 ├─ parser/  
 │   └─ ParserService.ts  ← Wraps meld-ast parsing  
 ├─ interpreter/  
 │   └─ InterpreterService.ts ← Orchestrates main interpretation pipeline  
 ├─ output/  
 │   └─ OutputService.ts  ← For final format conversions to Markdown, LLM XML, etc.  
 ├─ cli/  
 │   └─ CLIService.ts     ← Command-line interface logic  
 ├─ sdk/  
 │   └─ index.ts          ← High-level API (runMeld, parseMeld, etc.)  
 ├─ core/  
 │   ├─ errors/  
 │   ├─ config/  
 │   ├─ types/  
 │   └─ utils/            ← Logging, basic utility modules  
 ├─ MeldDirectiveError.ts, MeldError.ts, etc.  ← Central error classes  
 └─ package.json  

Key subfolders:  
• services/: Each major feature or subsystem is placed in a dedicated subfolder, with a main service class and possibly test code in the tests subfolder.  
• tests/utils/: The fixture manager, memfs-based filesystem, test contexts, and snapshot-based testing approach all live here.  
• parser/, interpreter/, output/, etc.: May contain top-level classes that create or coordinate the underlying service classes.  

───────────────────────────────────────────────────────────
3. CORE LIBRARIES & THEIR ROLE
───────────────────────────────────────────────────────────

1) meld-ast (Inlined or Imported)  
   • parse(content: string): MeldNode[]  
   • Basic parsing that identifies directives vs. text nodes.  
   • Produces an AST which other services manipulate.  

2) llmxml (Inlined or a utility)  
   • Converts content to an LLM-friendly XML format or can parse partially.  
   • OutputService may call it if user requests “llm” format.  

3) meld-spec (In code, references the grammar rules, directive structures, etc.)  
   • Contains interface definitions for MeldNode, DirectiveNode, TextNode, etc.  
   • Contains directive kind enumerations.  

───────────────────────────────────────────────────────────
4. HIGH-LEVEL FLOW
───────────────────────────────────────────────────────────

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

───────────────────────────────────────────────────────────
5. MAJOR SERVICES (OVERVIEW)
───────────────────────────────────────────────────────────

Below are the key “services” in the codebase. Each follows the single responsibility principle:

1) ParserService  
   – Wraps the meld-ast parse(content) function.  
   – Possibly merges location info with file paths (parseWithLocations).  
   – Produces an array of MeldNode objects.

2) DirectiveService  
   – Routes directives to the correct directive handler (e.g., text, data, import, embed).  
   – Validates each directive using ValidationService.  
   – Calls ResolutionService for variable resolution as needed.  
   – Updates StateService with results of directive execution (e.g., setting text or data variables).  

3) InterpreterService  
   – Orchestrates the main interpret(nodes) pipeline.  
   – For each AST node:
       a) If it’s text, store it or pass it along.  
       b) If it’s a directive, calls DirectiveService.  
   – Maintains the top-level process flow.

4) StateService  
   – Stores variables in maps:
       • textVars (for @text),  
       • dataVars (for @data),  
       • pathVars (for @path),  
       • commands (for @define or custom commands).  
   – Also tracks a list of MeldNodes that represent the final structure.  
   – Provides child states for nested imports or embedded content.  
   – Has immutability toggles to freeze the state after finalization.  

5) ResolutionService  
   – Central logic for variable interpolation:
       • Text variables (“${var}”),  
       • Data references (“#{data.field}”),  
       • Path expansions (“$HOMEPATH/path”, etc.),  
       • Command references.  
   – Offers context-based resolution (some directives disallow data variables, etc.).  
   – Checks for circular references via CircularityService.  
   – Ties in with the parser to parse sub-fragments that contain variables.

6) CircularityService  
   – Tracks imports to prevent infinite loops (A imports B, B imports A).  
   – Also helps detect variable-based circular references in advanced usage.

7) PathService  
   – Focuses on validating and normalizing paths.  
   – Checks absolute vs. relative, ensures no disallowed “..”, etc.  

8) ValidationService  
   – Houses validators for directives: @text, @data, @import, @embed, etc.  
   – Each directive has a corresponding validator function.  
   – Throws MeldDirectiveError if validation fails.  

9) FileSystemService  
   – Abstracts file operations (read, write), used by the code to avoid direct fs calls.  
   – Possibly uses MemfsTestFileSystem in test mode.  

10) OutputService  
   – Takes final AST plus a state, converts to desired format (markdown or llm).  
   – Potentially calls llmxml to produce LLM-friendly XML.  

───────────────────────────────────────────────────────────
6. TESTING INFRASTRUCTURE
───────────────────────────────────────────────────────────

All tests are heavily reliant on a memory-based filesystem (memfs) for isolation and speed. The major testing utilities include:

1) MemfsTestFileSystem  
   – Thin wrapper around memfs.  
   – Offers readFile, writeFile, mkdir, etc. with in-memory data.  
   – Provides an ephemeral environment for all test IO.  

2) TestContext  
   – Central test harness that creates a new MemfsTestFileSystem, plus references to all major services (ParserService, DirectiveService, etc.).  
   – Allows writing files, snapshotting the FS, and comparing.  

3) TestSnapshot  
   – Takes “snapshots” of the current Memfs FS, storing a Map<filePath, content>.  
   – Compares snapshots to detect added/removed/modified files.  

4) ProjectBuilder  
   – Creates mock “projects” in the in-memory FS (e.g., directories and files) from a JSON structure.  
   – Useful for complex, multi-file tests or large fixture-based testing.  

Testing Approach Summarized:
• Each test either uses a fresh TestContext or recreates MemfsTestFileSystem.  
• The test can write files, run the Meld interpreter pipeline, then assert results.  
• Snapshots can be used to see exactly which files changed.  

───────────────────────────────────────────────────────────
7. DETAILED ASCII SERVICE RELATION
───────────────────────────────────────────────────────────

Below is a more expanded ASCII diagram showing services with references:

                                 +---------------------+
                                 |    ParserService    |
                                 | meld-ast parsing    |
                                 +----------+----------+
                                            |
                                            v
 +------------+                 +---------------------+
 | Circularity|  <----------->  |  ResolutionService  |
 |  Service   |                 |(also does variable, |
 +------------+                 | path, data resol.)  |
                                            |
                                            v
 +------------+  +---------------------+  +-----------+
 | Validation|-> | DirectiveService   |->|StateService|
 +------------+  +---------+-----------+  +-----------+
                              |   |
                              v   v
                   +---------------+--------------+
                   |   Handler(s): text, data,   |
                   |   embed, import, etc.       |
                   +---------------+--------------+
                                   |
                                   v
                        +---------------------+
                        | InterpreterService |
                        +---------------------+
                                   |
                                   v
                        +---------------------+
                        | OutputService (opt)|
                        +---------------------+

Key relationships:
• InterpreterService orchestrates directives → DirectiveService → uses Validation & Resolution.  
• ResolutionService consults CircularityService for import cycles, etc.  
• DirectiveService updates or reads from StateService.  

───────────────────────────────────────────────────────────
8. EXAMPLE USAGE SCENARIO
───────────────────────────────────────────────────────────

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

───────────────────────────────────────────────────────────
9. ERROR HANDLING
───────────────────────────────────────────────────────────

• MeldDirectiveError thrown if a directive fails validation or interpretation.  
• MeldParseError if the parser cannot parse content.  
• PathValidationError for invalid paths.  
• ResolutionError for variable resolution issues.  
• MeldError as a base class for other specialized errors.  

These errors typically bubble up to the caller or test.  

───────────────────────────────────────────────────────────
10. CONCLUSION
───────────────────────────────────────────────────────────

This codebase implements the entire Meld language pipeline:  
• Parsing Meld documents into an AST.  
• Validating & interpreting directives.  
• Storing data in a hierarchical state.  
• Resolving references (text, data, paths, commands).  
• (Optionally) generating final formatted output.  

Plus, it has a robust test environment with an in-memory FS, snapshots, and a test harness (TestContext) for integration and unit tests. Everything is layered to keep parsing, state management, directive logic, and resolution separate, adhering to SOLID design principles.  

The ASCII diagrams, modules, and file references in this overview represent the CURRENT code as it is: multiple specialized services collaborating to parse and interpret Meld scripts thoroughly—test coverage is facilitated by the in-memory mocking and snapshot-based verification.
