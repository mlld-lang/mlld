
> This session is being continued from a previous conversation that ran out of
  context. The conversation is summarized below:
  <analysis>
  Let me analyze the conversation so far to create a comprehensive summary:

  1. Initial Context:
     - The conversation involves fixing an issue with command references in @run
  directives
     - The issue is that parameters in command references (e.g.,
  $commandName("arg1", "arg2")) aren't being properly handled
     - When using command references with arguments, they're not processed
  correctly, resulting in the arguments being passed verbatim

  2. Problem Identification:
     - Commands defined with @define directives should be reusable with parameters
     - When using $commandName(args) syntax, the arguments aren't properly extracted
   and substituted
     - Example failing cases include quoted strings, variable references, and
  strings with commas
     - Current output shows e.g. ("hello","world") instead of the expected "hello
  world"

  3. Code Analysis:
     - Examined RunDirectiveHandler.ts which handles @run directives
     - The handler uses string manipulation and regex to handle command references
     - Reviewed CommandResolver.ts which properly handles parameters in other
  contexts
     - Analyzed the AST grammar file meld.pegjs to understand how command references
   are parsed

  4. Root Cause Identification:
     - The AST (Abstract Syntax Tree) doesn't properly parse command references with
   arguments
     - It treats $commandName("arg1", "arg2") as a single string rather than parsing
   the command and arguments separately
     - RunDirectiveHandler attempts to compensate with regex and string manipulation
     - This approach is prone to errors with complex arguments (quotes, commas,
  variable references)

  5. Initial Solution Attempt:
     - Modified RunDirectiveHandler.ts to better handle argument parsing
     - Added functions to parse and sanitize arguments with proper quote handling
     - Implemented special handling for echo commands
     - Created unit tests to verify the solution

  6. Testing and Refinement:
     - Created test files to verify the solution works
     - Discovered additional issues with parameter handling
     - Made iterative improvements to the solution
     - Ran into limitations with the current approach

  7. Long-term Solution Planning:
     - Analyzed the AST grammar file to identify necessary changes
     - Created a detailed issue document outlining the problem and proposed solution
     - Proposed new grammar rules for parsing command references and their arguments
     - Outlined immediate workarounds and long-term architectural fixes

  8. Current Status:
     - Implemented a workaround that handles basic cases
     - Created a comprehensive issue document with detailed technical analysis
     - Identified limitations of the current approach
     - Proposed the correct long-term solution involving AST grammar changes

  9. Key Files Examined/Modified:
     - RunDirectiveHandler.ts - Modified with improved parameter handling
     - meld.pegjs - Analyzed for AST grammar changes (not modified)
     - CommandResolver.ts - Examined for understanding parameter resolution
     - Various test files created to verify the solution

  10. Next Steps Identified:
      - Improve error handling for edge cases in current workaround
      - Add comprehensive tests for edge cases
      - Consider warnings for complex command structures
      - Plan for proper AST grammar updates in the future
  </analysis>

  <summary>
  1. Primary Request and Intent:
     The primary request was to fix an issue with command references in @run
  directives. Specifically, when using a command reference like `@run
  $commandName("arg1", "arg2")`, the arguments weren't being properly extracted and
  substituted, resulting in output like `("hello","world")` instead of `hello
  world`. The intent was to enable proper parameter substitution in command
  references, allowing for reusable command definitions with parameterization while
  handling complex argument types correctly (quoted strings, variable references,
  and strings with commas).

  2. Key Technical Concepts:
     - AST (Abstract Syntax Tree) parsing of directives and command references
     - PEG.js grammar for defining parsing rules (meld.pegjs)
     - Command reference resolution using $ prefix notation ($commandName)
     - Parameter substitution using {{param}} template syntax
     - Quoted string handling in command arguments
     - Regular expression-based argument parsing
     - Variable reference resolution in command arguments
     - String sanitization and quote stripping
     - Directive handler implementation patterns
     - Service-based architecture with dependency injection
     - Test mocking and validation strategies
     - Grammar rule extension and modification

  3. Files and Code Sections:
     - `/Users/adam/dev/claude-meld/services/pipeline/DirectiveService/handlers/exec
  ution/RunDirectiveHandler.ts` - Modified to improve command reference handling
  with better argument parsing and parameter substitution
     - `/Users/adam/dev/claude-meld/services/resolution/ResolutionService/resolvers/
  CommandResolver.ts` - Examined to understand proper command reference resolution
     - `/Users/adam/dev/claude-meld/core/ast/grammar/meld.pegjs` - Analyzed to
  understand current AST parsing rules and identify necessary changes
     - `/Users/adam/dev/claude-meld/services/pipeline/DirectiveService/handlers/defi
  nition/DefineDirectiveHandler.ts` - Examined to understand command definition
  storage
     - `/Users/adam/dev/claude-meld/tests/run-directive-fix.test.ts` - Created to
  test command reference parameter handling
     - `/Users/adam/dev/claude-meld/test-command-reference.mld`,
  `/Users/adam/dev/claude-meld/test-command-reference-debug.mld` - Created test
  files to verify the solution
     - `/Users/adam/dev/claude-meld/ISSUE-command-reference-args.md` - Created a
  detailed issue document outlining the problem and solution

  4. Problem Solving:
     Several problems were identified and addressed during the implementation:

     - **Parameter Parsing**: Implemented a sophisticated parameter parser that
  properly handles quoted strings, commas within quotes, and variable references:
       ```typescript
       const parseArgs = (argsString: string): string[] => {
         // Parse arguments respecting quotes and commas
         // ...
       };
       ```

     - **Quote Handling**: Created a quote-stripping function to sanitize arguments:
       ```typescript
       const sanitizeArg = (arg: string): string => {
         // Remove surrounding quotes if present
         // ...
       };
       ```

     - **Special Case Handling**: Added special handling for echo commands to
  directly construct the command:
       ```typescript
       if (commandString.startsWith('echo ') && sanitizedArgs.length > 0) {
         commandToExecute = `echo ${strippedArgs.join(' ')}`;
         // ...
       }
       ```

     - **Test Mocking**: Updated tests to properly mock the ResolutionService for
  command references:
       ```typescript
       resolutionService.resolveInContext.mockImplementation((input, context) => {
         // Mock different behavior based on input
         // ...
       });
       ```

     - **Root Cause Analysis**: Identified that the AST grammar doesn't properly
  parse command references with arguments, treating them as a single string rather
  than extracting the command name and arguments separately.

  5. Pending Tasks:
     - Implement more robust error handling for edge cases in the current workaround
     - Add comprehensive tests covering edge cases like nested quotes, escaped
  quotes, complex variable references
     - Consider adding warnings when complex command structures are detected
     - Document limitations of command references in the current implementation
     - Plan for updating the AST grammar to properly handle command references with
  a dedicated rule structure
     - Ensure backward compatibility when implementing the AST grammar changes
     - Create integration tests to verify the entire resolution pipeline works
  correctly

  6. Current Work:
     The most recent work was analyzing the AST grammar file (meld.pegjs) to
  understand how command references are currently parsed and to define the changes
  needed for proper parsing. We created a detailed issue document
  (ISSUE-command-reference-args.md) that outlines:

     1. The current behavior and its limitations
     2. Implemented workarounds in RunDirectiveHandler.ts
     3. Edge cases not fully handled by the current approach
     4. Detailed analysis of the grammar file
     5. Proposed AST changes with specific grammar rule additions
     6. Immediate next steps and long-term fix requirements

     The document provides a complete roadmap for both short-term improvements to
  the current workaround and the proper long-term solution involving AST grammar
  changes.

  7. Next Step Recommendation:
     The most logical next step would be to implement more robust error handling for
   edge cases in the current workaround. Specifically:

     1. Enhance the argument parsing function to handle nested quotes (e.g., `"He
  said 'hello'"`) and escaped quotes (e.g., `"Hello \"World\""`)
     2. Add validation for complex command structures and provide helpful error
  messages
     3. Create comprehensive tests for the identified edge cases to ensure they're
  properly handled
     4. Update the RunDirectiveHandler documentation to clearly explain the current
  limitations and recommended practices

     This would make the current solution more robust while planning for the proper
  AST grammar updates in the future. Additionally, the implementation of these
  improvements would provide valuable insights for the eventual grammar updates.
  </summary>.
  Please continue the conversation from where we left it off
