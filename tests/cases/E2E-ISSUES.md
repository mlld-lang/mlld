# Issues:

## 1. Circularity imports ✅ FIXED
Circular imports (A imports B which imports A) are now properly detected with clear error messages showing the import chain. The fix includes multiple detection mechanisms for robustness.

## 2. Problematic syntax working
Many examples using inline {{variables}} are invalid and work! `This is a {{variable}}` examples should not be valid -- interpolation should only happen in @directives. This shouldn't work in our grammar at all and if there's something interpolating these somewhere else, it's an ugly hack. There is likely some test example pointing the wrong direction toward this functionality.

**Investigation Notes:**
- The core issue is that variable interpolation in plain text (outside of directives) is handled by the `VariableReferenceResolver`
- The `parseContent` method in `VariableReferenceResolver` (line 532) uses the parser service to extract variable references from any content, including plain text
- The `InterpreterService` processes both text nodes and variable reference nodes, and applies variable resolution to both
- Text nodes with variable references like `{{variable}}` are being parsed and converted to variable reference nodes during interpretation
- The grammar does appear to support this syntax (variables in plain text), as seen in the proper parsing of variable references
- Expected behavior according to the issue is that variable references should only be interpolated within directives, not in plain text
- Even when creating expected output files (e.g., `simple-variables.expected.md`), the expectation shows variables being interpolated in plain text

**Potential Fix:**
- If this behavior is truly unwanted, the fix would be to modify the `InterpreterService` to only process variable references within directives
- Alternatively, add a configuration option to control whether variables are interpolated in plain text
- Another approach would be to update the parser to not recognize variable references outside of directive contexts
- However, the fact that there are tests and expected output files that rely on this behavior suggests it may be intentional design, not a bug

## 3. @text variable interpolation 
Weirdly adding `/path/to/` before variable interpolation (see tests/cases/valid/import-utils.o.md where for `@text imported_variable = "This is from the imported file"` followed by `@embed {{imported_variable}}` it's resulting in `tests/cases/valid/This is from the imported file`)

**Investigation Notes:**
- The issue is in the `EmbedDirectiveHandler` implementation in the `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts` file
- When processing variable reference embeds, the code is concatenating the directory path to the variable content
- The problematic behavior happens in the execution of the `@embed` directive when the content is a variable reference
- In the `import-utils.o.md` output, we can see the directory path `tests/cases/valid/` is being prepended to the text variable content
- This appears to be happening because the handler is treating the variable content as if it were a file path even though it's just regular text
- The issue may be in the way `resolvedPath` is handled in the variable reference path logic (see around line 470-648)
- The current implementation doesn't properly distinguish between path variables and text variables in certain contexts

**Potential Fix:**
- Modify the variable resolution logic in the `EmbedDirectiveHandler` to properly handle text variables without treating them as file paths
- Specifically, check for and fix the path concatenation that's happening during variable resolution
- Add logic to distinguish between variables that contain paths and variables that contain simple text content
- Update the tests to correctly expect either a path-prepended output or a clean variable output based on the desired behavior

## 4. Path resolution issues with embeds
In `path-embed.mld`, the embed directive should be embedding a file, but in the output, it shows `@embed` as raw text without the content.

**Investigation Notes:**
- The issue occurs in `path-embed.mld` where `@embed [$valid/text.mld]` is not fully processing the embedded file
- The `path-embed.o.md` output shows that the content of `text.mld` is being included, but the nested `@embed {{greet}}` directive is not being processed
- The expected output (`path-embed.expected.md`) shows that the nested `@embed {{greet}}` directive should be processed and replaced with its content
- This appears to be an issue with directive processing within embedded files
- The current implementation is treating embedded content as literal text without processing directives within it
- This behavior is explicitly mentioned in the `EmbedDirectiveHandler.ts` code around line 845-850:
  ```typescript
  /** IMPORTANT: Content handling in @embed
   * 
   * For BOTH fileEmbed and variableEmbed:
   * - Content is ALWAYS treated as literal text in the final output
   * - Content is NOT parsed for directives or other Meld syntax
   * - This ensures that embedded content appears exactly as written
   */
  ```
- The expected output in the test expects nested directives to be processed, but the implementation is designed to not do this

**Potential Fix:**
- Either change the implementation to process directives within embedded content (which would be a significant architecture change)
- Or update the expected test output to match the current implementation's behavior
- The decision depends on what behavior is actually desired for the Meld language
- If recursive directive processing is desired, this would require modifying the embedding logic to parse and process directives in embedded content

## 5. @run directive execution failing
In `directives.mld`, there's an error trying to execute `$greet` command, showing "spawn $greet ENOENT". Defined commands with `@define` aren't being properly executed. Related: we get a similar err when running `meld examples/example.mld --stdout` 

**Investigation Notes:**
- The issue is with how defined commands are being executed in the `RunDirectiveHandler`
- In `directives.mld`, line 33-34 defines a command and tries to execute it:
  ```
  @define greet(person) = @run [echo "Hello, {{person}}!"]
  @run $greet({{user.name}})
  ```
- The error occurs because the system is trying to execute `$greet` literally as a command in the shell, rather than resolving it to the defined command `echo "Hello, Test User!"`
- The command should be expanded using the defined commands stored in the state
- The `RunDirectiveHandler` appears to resolve variables in the command, but it doesn't specifically handle command references that start with `$`
- The logic in `resolveInContext` in the `ResolutionService` should be handling this, but it seems to be failing
- Looking at the error `spawn $greet ENOENT`, it's clear the `$greet` is being passed directly to the shell rather than being interpreted as a reference to a defined command

**Potential Fix:**
- Modify the `RunDirectiveHandler.execute` method to specifically recognize command references (starting with `$`)
- Before executing the command, check if it starts with `$` and if so, look up the command in the state's commands
- Add logic to expand the command with any provided arguments
- Ensure the variable resolution is applied to the expanded command template
- Add proper tests for command expansion in the `RunDirectiveHandler.test.ts` file

## 6. Path variables not being resolved
In `directives.mld`, path variables like `$temp` aren't being replaced in the output.

**Investigation Notes:**
- In `directives.mld`, line 11 defines a path variable: `@path temp = "$PROJECTPATH/tmp"`
- Line 23 uses the path variable: `Temporary files are stored at: $temp`
- The issue is that the path variable reference `$temp` in the plain text is not being resolved
- According to the `directives.expected.md` file, this path should be resolved to `/Users/adam/dev/claude-meld/tmp`
- The problem is similar to the variable interpolation issue (#2), but specifically for path variables
- When a path variable is referenced with the `$` prefix in plain text, it should be resolved
- The current implementation doesn't handle path variables in plain text the same way it handles variables in `{{...}}` syntax
- The `InterpreterService` and `VariableReferenceResolver` would need to recognize `$` prefixed variables in text nodes

**Potential Fix:**
- Modify the `VariableReferenceResolver` to recognize and resolve `$` prefixed path variables in text content
- Add a specific parsing rule in the `parseContent` method to find path variable references
- Ensure path variables are properly resolved and handled in the same way that `{{variable}}` syntax is handled
- Add tests specifically for path variable resolution in plain text
- This would be related to the fix for issue #2, as both involve variable resolution in plain text

## 7. Array access in data variables
In `data-variables.mld` test, array access with dot notation (students.0, students.1) appears to be working correctly now, in contrast to the `embed-example.o.md` where it's failing.

**Investigation Notes:**
- There's an inconsistency in how array access works between direct file processing and embedded file processing
- In `data-variables.mld`, array access with dot notation (students.0.name) works correctly when processed directly
- However, in `embed-example.mld`, which embeds `data-variables.mld`, the array access fails to resolve
- In the `embed-example.o.md` output, we see that variables aren't being resolved at all, showing empty values (`-:  ()`)
- This is related to issue #4 (Path resolution with embeds) and #13 (Embedded file directives not processed)
- The root cause is that the `EmbedDirectiveHandler` is treating embedded content as literal text
- This means that variables in embedded files are not being processed as expected
- The variables from embedded files are not being loaded into the state, so they can't be accessed
- This is by design according to the code comments in the `EmbedDirectiveHandler.ts` (around line 845-850)

**Potential Fix:**
- Either modify the `EmbedDirectiveHandler` to process variables and directives in embedded content
- OR update the expected test output to match the current behavior (not resolving variables in embedded content)
- For recursive variable processing, this would require a significant architecture change to the embedding logic
- The implementation would need to parse embedded content for variable references and resolve them
- This is related to the fixes needed for issues #4 and #13, which involve similar embedding behavior

## 8. Inconsistent file path resolution
Some file paths are being resolved relative to the project root, while others are being resolved relative to the file's location.

## 9. Empty embed directive output
In some cases, `@embed` directives are processed but leave empty output or incomplete content.

**Investigation Notes:**
- In `embed-example.mld`, the `@embed` directive is embedding `data-variables.mld` but in the output file, variable references like `{{grade}}` and `{{students.0.name}}` are not being resolved
- Looking at the `embed-example.o.md`, we see empty values (`-:  ()`) where there should be student data
- The EmbedDirectiveHandler.ts code explicitly mentions in a comment on lines 845-850 that embedded content is ALWAYS treated as literal text and is NOT parsed for directives or other Meld syntax
- This policy is implemented intentionally, but conflicts with the expected output in `embed-example.expected.md`
- The core issue is that variables in embedded content are not being resolved during embedding
- Even when variable references are correctly embedded, they appear as literal text `{{variable}}` instead of being resolved to their values
- This is a fundamental design decision regarding how embedded content should be treated

**Potential Fix:**
- There are two options:
  1. Change the implementation to process variable references in embedded content by modifying the EmbedDirectiveHandler
  2. Update the expected test outputs to match the current implementation (literal text embedding)
- If processing variables in embedded content is desired, it would require significant architecture changes to the embedding logic
- The embedding process would need to be modified to include a parsing phase for embedded content
- This change would impact multiple tests and expected outputs throughout the codebase

## 10. Undefined variables not causing proper errors
Sometimes undefined variables are silently ignored rather than producing clear error messages.

**Investigation Notes:**
- In `undefined-variable.error.mld`, there's a variable reference `{{greeting` missing the closing brackets
- The expected error message in `undefined-variable.error-message` is "Invalid syntax"
- The current implementation of VariableReferenceResolver handles undefined variables differently depending on the context:
  - In strict mode (context.strict = true), it throws an error when a variable is not found (line 714-716)
  - In non-strict mode, it returns an empty string (line 731)
- Poorly formatted variable references (missing closing brackets) are caught during the parsing phase
- The parser detects that the reference isn't valid and generates an error
- However, well-formed references to variables that don't exist don't always generate errors in non-strict mode
- This makes it confusing for users since some variable errors fail silently with empty string output

**Potential Fix:**
- Implement consistent handling of undefined variables:
  - Add a configuration option to control undefined variable behavior: error, empty string, or keep as-is
  - Make strict mode the default for better error reporting
  - Enhance error messages to clearly indicate when a variable is undefined vs. syntax error
  - Add validation that checks for undefined variables before processing begins
- Ensure that validation issues are reported with clear error messages that indicate the specific problem (undefined variable vs. syntax error)

## 11. Invalid variable names
In `invalid-variable.error.mld`, the error is not about missing quotes (which is the intended test) but about the hyphen in the variable name. The parser doesn't allow hyphens in variable names, but the error message is confusing.

**Investigation Notes:**
- In `invalid-variable.error.mld`, there's a variable definition with a hyphen: `@text invalid-variable = This value is missing quotes`
- The current error message is focusing on the invalid variable name (with hyphen) rather than the missing quotes
- The variable name validation happens first, before the validation of the value
- The parser is correctly catching the invalid variable name but is not providing a helpful error message
- Looking at the error, it's unclear if the error is about:
  1. The variable name being invalid (hyphens not allowed)
  2. The value missing quotes
- The test was likely intended to test the missing quotes scenario
- The current error message doesn't match the expected error message

**Potential Fix:**
- Improve error messages to be more specific and prioritize the most relevant issues:
  - Provide detailed validation information about variable names (what characters are allowed)
  - When multiple issues exist (invalid name AND missing quotes), report all issues
  - Create a validation hierarchy that checks the most important issues first
- Update the test case to use a valid variable name if the intent is to test missing quotes
- Ensure error messages in test expectations match the actual error messages

## 12. Directive visibility in output
In some outputs, the directives (`@text`, `@data`, etc.) are completely removed from the output, while in others they remain visible, creating inconsistency.

**Investigation Notes:**
- Comparing `directive-example.mld` and `directive-example.expected.md`, we can see that the `@data` directive is completely removed from the output
- This behavior is inconsistent across different directive types
- Some directives (like `@text`, `@data`, `@define`) are meant to be removed from the output as they only define variables
- Other directives (like `@embed`, `@run`) may be visible in the output depending on their purpose
- The output handling is determined by each directive's handler class (`TextDirectiveHandler`, `DataDirectiveHandler`, etc.)
- Each handler decides whether to return a replacement node or remove itself from the output
- The inconsistency appears when different handlers implement different logic for directive visibility

**Potential Fix:**
- Standardize the directive visibility behavior across all handlers:
  - Define a clear policy for which directives should be visible/invisible in output
  - Document the policy in code comments and user documentation
  - Implement consistent logic in all directive handlers
  - Add a configuration option to control directive visibility globally
- Review and update all directive handlers to ensure they follow the standardized behavior
- Update tests to expect the correct visibility behavior for each directive type

## 13. Embedded file directives not processed
When a file is embedded, the directives within that file are sometimes displayed as raw text instead of being processed.

**Investigation Notes:**
- This issue is closely related to issue #4 (Path resolution with embeds) and #9 (Empty embed directive output)
- In `path-embed.mld`, there's an embed directive `@embed [$valid/text.mld]` which embeds a file containing a variable reference `@embed {{greet}}`
- In the output, the nested `@embed {{greet}}` directive is not processed and appears as literal text
- The EmbedDirectiveHandler.ts clearly states in comments (lines 845-850) that embedded content is treated as literal text and not parsed for directives
- This design decision ensures "embedded content appears exactly as written" but doesn't allow for recursive directive processing
- The expected output in some tests assumes that nested directives would be processed, contradicting this design decision

**Potential Fix:**
- There are two main approaches:
  1. Change the implementation to process directives in embedded content:
     - Modify EmbedDirectiveHandler to parse embedded content for directives
     - Add recursive directive processing with proper depth limiting
     - Handle variables in the context of embedded files
  2. Update the expected test outputs to match the current implementation:
     - Acknowledge that directive literals in embedded files are intentionally preserved
     - Document this behavior clearly in the user documentation
     - Ensure tests reflect this behavior consistently
- The decision depends on the desired behavior for Meld language
- If recursive directive processing is needed, it requires a significant architecture change
- Coordinate with other related fixes (issues #4 and #9) since they stem from the same root cause

# What's not sufficiently tested e2e here?

1. **Error recovery** - How the processor handles malformed directives and continues processing the rest of the document.

2. **Path variable edge cases** - Testing relative paths, absolute paths, and path variables with special characters.

3. **Recursive embed/import depth** - Testing the maximum depth of nested imports/embeds and proper error handling.

4. **Code fence interactions** - Testing how code fences interact with directives and variables, especially when embedded.

5. **Comment handling** - Testing how comments are processed and whether they affect directive processing.

6. **Variable reassignment** - Testing what happens when variables are redefined or modified after initial definition.

7. **Multi-line variable values** - Testing more complex multi-line string handling with various formatting.