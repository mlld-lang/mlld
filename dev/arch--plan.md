Below is a consolidated list of concrete changes needed to make the architecture design documents cohesive and to align the codebase with the new, services-based approach. It also specifies which existing code/tests should be kept, modified, or deleted. There is no need for backward compatibility, so we can remove or refactor anything that does not serve the updated design.

─────────────────────────────────────────────────────────────────────────
1. Consolidate and Rename Folders to Match the Services-Based Layout [IN PROGRESS]
─────────────────────────────────────────────────────────────────────────
✓ Create "services" folder at project root. Inside it:
  ✓ ParserService/  
  ✓ InterpreterService/  
  ✓ DirectiveService/  
  ✓ ValidationService/  
  ✓ StateService/  
  ✓ PathService/  
  ✓ FileSystemService/  
  ✓ OutputService/  
  • ResolutionService/  
✓ Within each service folder, have exactly:
  ✓ A main service file (e.g., PathService.ts)  
  ✓ A matching test file (e.g., PathService.test.ts)  
  ✓ (Optional) a small README or subfiles if the service is complex  
• [TODO] Remove/distribute "utils.ts,", "fs.ts,", "fs-extra.ts,", "fs-promises.ts,", "fs-utils.ts,", etc.:
  – Merge their logic into FileSystemService (or a single FileSystemAdapter) if needed.  
  – Delete any leftover or redundant FS-mocking code once FileSystemService covers it.  
• [TODO] Move the "validators" subfolder inside ValidationService (e.g. "ValidationService/validators/"), as described in the design docs.  
• [TODO] Eliminate the "__mocks__" directories if redundant. The new FileSystemService or test adapters should replace them.  

─────────────────────────────────────────────────────────────────────────
2. Adopt the New "ParserService" to Call meld-ast [COMPLETED]
─────────────────────────────────────────────────────────────────────────
✓ In "services/ParserService" folder, created ParserService.ts that:
  ✓ Wraps meld-ast's parse() function.  
  ✓ Removes all direct usage of parseMeld in random places.  
✓ Added proper error handling with MeldParseError.
✓ Added location tracking support.
✓ Created comprehensive test suite.

• Delete or refactor the old "meld-ast.ts" file that duplicates parse logic:
  – Keep the meld-ast library references and type definitions, but remove any custom code we wrote that partially replicates meld-ast's behavior.  
• Remove the parse methods from "parser.ts" in the root if they conflict or are redundant. Migrate needed logic into ParserService.  

─────────────────────────────────────────────────────────────────────────
3. Introduce "InterpreterService" for Node Iteration [80% -- WAITING ON DIRECTIVES TO BE COMPLETED]
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-interpreter.md]

• Create "InterpreterService.ts" (or rename "interpreter/interpreter.js"):
  – Orchestrates reading each MeldNode (Text vs. Directive), then calling DirectiveService.  
  – Cleans up old references to "interpret" scattered in "interpreter.test.ts" or "meld.ts."  
• Keep relevant tests from "interpreter.test.ts" but re-scope them to the new InterpreterService class. Delete any legacy bits referencing old partial logic we no longer need.  

─────────────────────────────────────────────────────────────────────────
4. Create "DirectiveService" with a Registry + Handlers [PARTIAL -- SEE BELOW]
─────────────────────────────────────────────────────────────────────────
• In "DirectiveService/" folder:
  – A main DirectiveService.ts that routes DirectiveNode → correct handler (Text, Data, Import, etc.).  
  – A "handlers/" subfolder with each directive's logic:
    • e.g., TextDirectiveHandler.ts, DataDirectiveHandler.ts, EmbedDirectiveHandler.ts, ImportDirectiveHandler.ts, etc.  
• Move the existing directive logic from "define.ts," "data.ts," "text.ts," "embed.ts," "import.ts," "run.ts," etc. into these smaller directive handler files.  
• Delete old "cmd.ts," "cli.test.ts," or "cli.md" references if they are specific to the old CLI approach:
  – Or, if we still want a CLI, keep a small "cli/" folder that just calls the new services.  

─────────────────────────────────────────────────────────────────────────
5. Add a "ValidationService" for Directive Checking [COMPLETED]
─────────────────────────────────────────────────────────────────────────
✓ Created ValidationService with:
  ✓ Core validators for text, data, import, and embed directives
  ✓ Extensible validator registration system
  ✓ Proper error handling with location information
  ✓ Comprehensive test coverage
✓ Removed partial validations from directive handlers
✓ Consolidated validation logic into dedicated validators
✓ Added proper logging integration

─────────────────────────────────────────────────────────────────────────
6. Migrate Variable & State Logic into "StateService" [COMPLETED]
─────────────────────────────────────────────────────────────────────────
✓ Create "StateService/StateService.ts" with the structure shown in the design docs:
  ✓ Raw variable storage (textVars, dataVars, pathVars, commands)
  ✓ No resolution logic (moved to ResolutionService)
  ✓ createChildState() for nested @import or @embed usage
  ✓ State hierarchy management
✓ Remove "state.ts," "state.test.ts," or "interpreter/state/state.js" references
✓ Migrated the best parts of "interpreter/state/state.js" into "StateService.ts"

─────────────────────────────────────────────────────────────────────────
7. Create "ResolutionService" for Variable Resolution [90% COMPLETE -- WAITING ON DIRECTIVES TO BE COMPLETED]
─────────────────────────────────────────────────────────────────────────
✓ Created ResolutionService with:
  ✓ Variable resolution (${var}, #{data}, $path)
  ✓ Command resolution ($command(args))
  ✓ Path resolution in various contexts
  ✓ Resolution context management
  ✓ Explicit cycle detection for variables
  ✓ Context validation rules
✓ Added dedicated resolvers:
  ✓ TextResolver (with nested interpolation detection)
  ✓ DataResolver (with field access validation)
  ✓ PathResolver (enforcing $HOMEPATH/$PROJECTPATH)
  ✓ CommandResolver (validating parameter types)
✓ Added ResolutionContextFactory:
  ✓ Pre-defined contexts for each directive type
  ✓ Enforces grammar rules per context
  ✓ Prevents invalid variable usage
✓ Implemented clear separation between:
  ✓ Variable reference cycles (in ResolutionService)
  ✓ File import cycles (in CircularityService)
• [TODO] Add remaining edge case tests
• [TODO] Complete integration tests with DirectiveService

─────────────────────────────────────────────────────────────────────────
8. Update DirectiveService for New Architecture [40% COMPLETE]
─────────────────────────────────────────────────────────────────────────
✓ Basic service structure and interfaces
✓ Handler registration system
• [TODO] Complete directive handlers:
  - Definition handlers (@text, @data, @path, @define)
  - Execution handlers (@run, @embed, @import)
• [TODO] Update handlers to:
  - Store raw values in StateService
  - Use ResolutionService for all resolution
  - Use ResolutionContextFactory for correct contexts
  - Handle resolution errors properly
• [TODO] Add proper error handling:
  - Validation errors from ValidationService
  - Resolution errors from ResolutionService
  - Execution errors from handlers
• [TODO] Update tests to verify:
  - Correct context usage
  - Error handling
  - Integration with ResolutionService

DETAILED IMPLEMENTATION PLAN:
1. Definition Handlers (Phase 1)
   a) TextDirectiveHandler
      • Implement core handler with ResolutionService integration
      • Add proper context validation
      • Add comprehensive tests
      • Integrate with StateService for storage
   
   b) DataDirectiveHandler
      • Implement JSON parsing and validation
      • Add field access validation
      • Add schema support (if specified)
      • Add comprehensive tests
   
   c) PathDirectiveHandler
      • Implement with PathService integration
      • Add path validation and normalization
      • Add comprehensive tests
   
   d) DefineDirectiveHandler
      • Implement command definition storage
      • Add parameter validation
      • Add metadata support (.risk, .about, etc.)
      • Add comprehensive tests

2. Execution Handlers (Phase 2)
   a) RunDirectiveHandler
      • Implement command resolution
      • Add parameter interpolation
      • Add execution context management
      • Add comprehensive tests
   
   b) EmbedDirectiveHandler
      • Implement content embedding
      • Add section extraction
      • Add header level adjustment
      • Add comprehensive tests
   
   c) ImportDirectiveHandler
      • Implement file importing
      • Add circularity detection
      • Add state inheritance
      • Add comprehensive tests

3. Integration & Error Handling (Phase 3)
   a) Resolution Integration
      • Integrate ResolutionContextFactory
      • Add context validation
      • Add cycle detection
      • Add comprehensive tests
   
   b) Error System
      • Implement DirectiveError hierarchy
      • Add location tracking
      • Add error recovery options
      • Add comprehensive tests
   
   c) State Management
      • Implement state inheritance
      • Add state merging
      • Add cleanup handling
      • Add comprehensive tests

4. Testing Infrastructure (Phase 4)
   a) Unit Tests
      • Add handler-specific test suites
      • Add error case coverage
      • Add edge case coverage
   
   b) Integration Tests
      • Add cross-handler tests
      • Add service integration tests
      • Add full pipeline tests
   
   c) Performance Tests
      • Add benchmarks
      • Add memory usage tests
      • Add load tests

5. Documentation & Examples (Phase 5)
   a) Handler Documentation
      • Add detailed API docs
      • Add usage examples
      • Add error handling guides
   
   b) Integration Guides
      • Add service integration docs
      • Add extension guides
      • Add troubleshooting guides

IMPLEMENTATION ORDER:
1. Start with TextDirectiveHandler as it's the simplest
2. Move to DataDirectiveHandler as it builds on similar patterns
3. Implement PathDirectiveHandler using existing PathService
4. Add DefineDirectiveHandler to support command definitions
5. Implement RunDirectiveHandler to execute commands
6. Add EmbedDirectiveHandler for content inclusion
7. Finally add ImportDirectiveHandler as it's most complex

This order ensures we:
• Build from simple to complex
• Validate core patterns early
• Have dependencies ready when needed
• Can test thoroughly at each step

─────────────────────────────────────────────────────────────────────────
9. Implement InterpreterService for Node Iteration [80% COMPLETE]
─────────────────────────────────────────────────────────────────────────
✓ Created InterpreterService with:
  ✓ Node iteration and processing
  ✓ State management
  ✓ Basic error handling
  ✓ Integration with DirectiveService
✓ Comprehensive test coverage for basic functionality
• [TODO] Add advanced error handling
• [TODO] Add edge case handling
• [TODO] Complete integration tests with all services

─────────────────────────────────────────────────────────────────────────
10. Create CLIService for Command Line Interface [70% COMPLETE]
─────────────────────────────────────────────────────────────────────────
✓ Basic CLI implementation
✓ Argument parsing
✓ Test coverage for main functionality
• [TODO] Improve error handling
• [TODO] Add more format options
• [TODO] Enhance logging
• [TODO] Add configuration options

─────────────────────────────────────────────────────────────────────────
11. Implement a Proper "PathService" [COMPLETED]
─────────────────────────────────────────────────────────────────────────
✓ Created PathService with:
  ✓ Path resolution and validation
  ✓ Variable expansion ($HOME, $PROJECTPATH, etc.)
  ✓ Base directory restrictions
  ✓ File/directory type validation
  ✓ Comprehensive test coverage
✓ Removed/distributed old path utilities:
  ✓ Consolidated path.ts, location.ts into PathService
  ✓ Migrated test coverage from path.test.ts

─────────────────────────────────────────────────────────────────────────
12. Create a Proper "FileSystemService" [COMPLETED]
─────────────────────────────────────────────────────────────────────────
✓ Created FileSystemService with:
  ✓ Core file operations (readFile, writeFile, exists, stat)
  ✓ Directory operations (readDir, ensureDir, isDirectory)
  ✓ Path operations (join, resolve, dirname, basename)
  ✓ Test mode with mocking capabilities
  ✓ Comprehensive test coverage
✓ Removed/distributed old FS utilities:
  ✓ Consolidated fs.ts, fs-extra.ts, fs-promises.ts, fs-utils.ts into FileSystemService
  ✓ Migrated test coverage from fs-utils.test.ts

─────────────────────────────────────────────────────────────────────────
13. "OutputService" to Handle Markdown vs. LLM XML
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-output.md]

• Move "converter.ts," "llmxml-utils.ts," or "toLLMXml" references into "OutputService/formats/LLMOutput.ts."  
• Keep essential tests that confirm LLM XML usage from "llmxml-utils.test.ts."  
• For markdown output, keep "toMarkdown" logic in "OutputService/formats/MarkdownOutput.ts."  
• The new OutputService just picks the correct converter:
  – e.g., outputService.convert(nodes, state, 'md' | 'llm')  
• Remove "CONVERTER.md" or unify it into a short doc in "OutputService/README.md" if desired.  

─────────────────────────────────────────────────────────────────────────
14. Remove Or Rework "runMeld," "meld.ts," "cli.test.ts," Etc.
─────────────────────────────────────────────────────────────────────────
• The old "runMeld" function in "meld.ts" or "cli.md" lumps together parse, interpret, and formatting in a single step. Under the new design:
  – We can keep a top-level "sdk/index.ts" that offers a unify function runMeld() if we want a single call. But internally, it calls:
     1) parserService.parse
     2) interpreterService.interpret
     3) outputService.convert  
  – Or we remove "runMeld" entirely if the new design doesn't want that monolithic approach.  
• "cli.test.ts," "cmd.ts," or "CLI.md" can be removed if we do not need a CLI. If we do keep a CLI, it should just be a thin wrapper calling the new services.  

─────────────────────────────────────────────────────────────────────────
15. Clean Up Tests: Keep the Good Coverage, Delete Redundancies
─────────────────────────────────────────────────────────────────────────
• Organize tests into "tests/unit/ServiceName.test.ts" and "tests/integration/...".  
• Keep coverage from "embed.test.ts," "import.test.ts," "data.test.ts," etc. if they reflect real directive logic. Move them into "DirectiveService/handlers/tests/" or "integration."  
• Remove partial or outdated tests that no longer correspond to the new services.  
• Maintain "Integration" tests that spin up the entire pipeline (ParserService → InterpreterService → OutputService).  

─────────────────────────────────────────────────────────────────────────
16. Merge or Delete Partial or Duplicate Implementation Files
─────────────────────────────────────────────────────────────────────────
• "location-helpers.ts," "location.ts," or "error-locations.test.ts" can be merged if we only need a single place to handle location adjustments.  
• "meld-spec.d.ts" and "meld-ast.d.ts" can remain if they supply needed extra definitions but remove any partial duplication of official meld-ast or meld-spec.  
• The "grammar" docs remain as reference, but integrate them into the new doc folder or remove references to old partial grammar code.  

─────────────────────────────────────────────────────────────────────────
17. Update The "DESIGN DOCS TO BE REVIEWED AND IMPROVED"
─────────────────────────────────────────────────────────────────────────
• Rewrite them to use consistent references to the new directory layout (services/ParserService, etc.).  
• Remove repeated or contradictory sections that mention old code we are deleting.  
• Reorder them so each service doc (PathService, FileSystemService, ValidationService, etc.) matches the final structure.  

─────────────────────────────────────────────────────────────────────────
18. Simplify The Logging Approach [COMPLETED]
─────────────────────────────────────────────────────────────────────────
✓ Created a centralized "logger.ts" in "core/utils/" using Winston.  
✓ Unified all logging into service-specific loggers with proper configuration.  
✓ Added structured logging with file and console output.  

─────────────────────────────────────────────────────────────────────────
19. Final Clarifications
─────────────────────────────────────────────────────────────────────────
• No backward compatibility means we are free to remove everything not used in the final approach.  
• The new architecture is fully services-based:
  – No partial leftover "run logic" or "fs logic" in random utility files.  
• Move forward with SOLID design: each directive in a separate file, each service tested in isolation.  

─────────────────────────────────────────────────────────────────────────
NEXT STEPS
─────────────────────────────────────────────────────────────────────────
The next services to implement in order of dependency should be:

1. ResolutionService - This is needed by DirectiveService for all variable resolution
   • Start with core resolvers (Text, Data, Path, Command)
   • Add ResolutionContextFactory
   • Implement cycle detection
   • Add context validation
2. Updated StateService - This needs to be modified to focus on raw storage
3. Updated DirectiveService - This needs to be reorganized to use ResolutionService
   • Use ResolutionContextFactory
   • Update error handling
4. ValidationService - This is needed by DirectiveService for validating directives
5. InterpreterService - This orchestrates the overall interpretation process
6. OutputService - This handles the final output formatting

This order ensures we build from the ground up, with each service having its dependencies available.

─────────────────────────────────────────────────────────────────────────
CONCLUSION
─────────────────────────────────────────────────────────────────────────
By applying these 19 sets of changes, we will create a cohesive, maintainable codebase that strictly follows the services-based design described in the updated architecture documents. This yields a simpler code layout, targeted tests, and a clear separation of concerns for Parsing, Interpreting, Validating, Managing State, Handling Directives, Resolving Paths, Reading Files, and Outputting results.
