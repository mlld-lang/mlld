# Feedback on Run Directive Draft Specification (from ParserService)

## 1. Accuracy Assessment

The draft specification generally aligns with the ParserService's needs for parsing run directives. The core properties like `command`, `args`, and `sourceRange` are correctly identified as essential for our service. The inclusion of `directiveType` is appropriate for directive type discrimination. The data types appear suitable for most properties, with string arrays for arguments and record types for environment variables.

## 2. Completeness Assessment

* **Missing Property: `parser-specific metadata`**: The ParserService often needs to attach parser-specific metadata during the parsing phase. This could include information about the original source format, indentation level, or other parsing context that might be useful for later stages. Consider adding an optional `parserMetadata?: Record<string, any>` field.

* **Missing Validation Rule**: For the `command` property, we should specify that it must be parseable by our service. Currently, the validation only states it must be a non-empty string.

* **Missing Documentation**: The relationship between `commandType` and expected structure of `args` is not clearly documented. For complex command types, the args might need specific structures that the parser needs to validate.

## 3. Clarity & Usability Assessment

* The interface is generally well-structured and the TSDoc comments are clear.

* Suggested Renaming: `sourceRange` -> `location` to align with AST node terminology used elsewhere in our service. This would provide consistency across our parsing interfaces.

* The enums for various modes (RunOutputMode, RunCaptureMode, etc.) are well-defined and clearly named.

* Consider adding more specific TSDoc comments for the ParserService-specific validation requirements on each field.

## 4. Potential Issues / Edge Cases

* **Issue 1**: The `args` property is typed as `string[]`, but for complex command types (like SERVICE), arguments might need to be structured objects. The ParserService would need to handle the parsing of these potentially complex argument structures.

* **Issue 2**: The specification doesn't address how multi-line commands should be handled by the parser. This is a common case in markdown or code files.

* **Issue 3**: There's no clear indication of how variable substitution or template expressions within commands should be parsed and represented. The ParserService needs to distinguish between literals and expressions that need resolution.

## 5. Validation Concerns

* **Concern 1**: The ParserService needs to validate the syntax of command strings during parsing, but the specification doesn't provide guidance on what constitutes valid command syntax for different command types.

* **Concern 2**: For the `shell` property, which can be a boolean or string, the ParserService needs clearer validation rules about when to parse a value as a shell path versus a boolean flag.

* **Concern 3**: The relationship between `commandType` and the required/optional nature of other properties isn't specified. For example, if `commandType` is SERVICE, are there additional required properties?

## 6. Specific Improvement Suggestions

* **Suggestion 1**: Add a `syntax` property to explicitly represent the parsed structure of the command, which would help downstream services understand the command's components without re-parsing.

* **Suggestion 2**: Include an optional `rawText` property to preserve the exact original text of the directive as found in the source, which can be useful for error reporting and debugging.

* **Suggestion 3**: Add an optional `variables` array to explicitly track variables that need resolution within the command or arguments, making it easier for the ResolutionService to identify and process them.

* **Suggestion 4**: Consider adding a `parseOptions` property that could contain parser-specific flags or options that influenced how the directive was parsed, which might be relevant for later processing or error handling.

* **Suggestion 5**: The `shell` property should have a default value in the interface, as it's marked as required but might not always be explicitly set in the source text. Consider making it optional with a default value handled by the service.