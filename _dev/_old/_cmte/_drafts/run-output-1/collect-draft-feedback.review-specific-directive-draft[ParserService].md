# Feedback on Run Draft Specification (from ParserService)

## 1. Accuracy Assessment

The draft specification for the `run` directive accurately captures most of the core properties needed for the ParserService to properly parse and represent run directives. The type structure with a base interface and specialized extensions aligns well with how we'd need to represent these directives in our AST. The discriminated union approach will help us maintain type safety throughout the parser pipeline.

However, I do see some areas where the specification could be better aligned with how the ParserService would need to process directives.

## 2. Completeness Assessment

* **Missing Property/Type**: `sourceText` - As the ParserService, we need to store the original directive text as it appeared in the source file. This helps with error reporting, debugging, and potentially with source mapping.

* **Missing Property**: `sourcePath` - The file path where this directive was found would be valuable for the ParserService to track, especially for error reporting and cross-file references.

* **Missing Context**: The specification doesn't include how nested code blocks within run directives should be represented. For language-specific commands, we often need to parse multi-line code blocks.

* **Missing Interface**: A dedicated interface for run directive AST nodes that extends our base AST node interface would be helpful for integration with our existing parser infrastructure.

## 3. Clarity & Usability Assessment

* The naming conventions are generally clear and consistent, which will make implementation in the ParserService straightforward.

* The distinction between different types of run directives using discriminated unions is well-designed and will help with type checking during parsing.

* Suggested Renaming: `MeldRunDirective` -> `RunDirectiveNode` to better align with our existing AST node naming conventions in the ParserService.

* The TSDoc comments are helpful, but could be enhanced with examples that would guide our parser implementation.

## 4. Potential Issues / Edge Cases

* **Issue 1**: The specification doesn't address how to handle malformed run directives. The ParserService needs clear guidance on error recovery strategies for partial or invalid directives.

* **Issue 2**: For language-specific commands, we'll need to recursively parse the embedded code. The current spec doesn't define how this nested code should be represented in the AST.

* **Issue 3**: The `Range` interface might conflict with our existing source mapping structures. We should ensure compatibility or provide a mapping function.

* **Issue 4**: There's no clear indication of how to handle directives with both `language` specified and `commandType` not set to 'language', which could lead to inconsistent parsing.

## 5. Validation Concerns

* **Concern 1**: While type validation is well-defined, the ParserService would benefit from knowing which validations should happen during parsing versus later stages. For example, should we validate that `id` is unique during parsing, or is that the responsibility of a later service?

* **Concern 2**: For properties like `errorHandling` that can be a function, we need to clarify how these should be represented in the AST, as functions can't be directly serialized.

* **Concern 3**: The validation for `args` as either an array or record object might be challenging during parsing. We should define clear syntax rules for how these different formats are represented in the source.

## 6. Specific Improvement Suggestions

* **Suggestion 1**: Add a `parseErrors` property to the directive node interface to capture any non-fatal parsing issues encountered while processing the directive.

* **Suggestion 2**: Define a clearer structure for how embedded code blocks should be represented in language-specific directives, perhaps as:
  ```typescript
  codeBlock?: {
    content: string;
    language: RunLanguage;
    range: Range;
  }
  ```

* **Suggestion 3**: Consider adding a `raw` property to store the unparsed directive text, which would help with debugging and error reporting.

* **Suggestion 4**: Include an explicit `isValid` flag that the ParserService can set based on structural validation during parsing, which downstream services can use to quickly filter out malformed directives.

* **Suggestion 5**: Define how multi-line commands should be handled in the parsing stage, particularly regarding line continuations and escaping.

* **Suggestion 6**: Add integration guidance for how these directive types connect with our existing AST node hierarchy, to ensure we maintain consistency across all directive types.

Overall, the specification provides a solid foundation, but could benefit from these enhancements to better support the ParserService's specific needs in accurately representing run directives in our AST.