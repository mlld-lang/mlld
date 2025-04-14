# Synthesize Validation Requirements for '@{{ directiveName }}'

## Context

You are the **System Architect**. You have received feedback from component leads regarding the validation rules needed for the `@{{ directiveName }}` directive.

**CRITICAL NOTE:** Focus *only* on validation requirements (static and runtime) for `@{{ directiveName }}` subtypes (Path, Variable, Template), parameters, and syntax.

### Feedback on Validation:

# NOTE: Inputs adjusted for @embed context
**EmbedHandler Feedback (Subtype/Usage Validation):**
{{ EmbedHandlerFeedback }}

**ParserCore Feedback (Syntax Validation):**
{{ ParserCoreFeedback }}

# Removed RunValidationFeedback, RunHandlerCoreFeedback

---

## Task: Synthesize Validation Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to the validation of `@{{ directiveName }}` directives.

*   Identify necessary static checks (e.g., syntax for `[...]`, `\{{...}}`, `[[...]]`).
*   Note required runtime checks (e.g., path existence for path embeds, variable existence for variable embeds).
*   Consolidate rules for validating variable reference syntax within variable/template embeds.

**Output Format:** Produce concise notes outlining the synthesized validation requirements for the `@{{ directiveName }}` directive.

### Synthesized Requirements: @{{ directiveName }} Validation

*   Requirement 1: (e.g., Validate correct syntax for path vs. variable vs. template embeds.)
*   Requirement 2: (e.g., Runtime check for file existence for path embeds.)
*   Requirement 3: (e.g., Runtime check for variable existence for variable/template embeds.)
*   Requirement 4: (e.g., Validate field/index access syntax in variable embeds.)
*   (List other key validation requirements) 