# Synthesize Validation Requirements for '@run'

## Context

You are the **System Architect**. You have received feedback from component leads regarding the validation rules needed for the `@run` directive.

**CRITICAL NOTE:** Focus *only* on validation requirements (static and runtime) for `@run` directive parameters, structure, and execution.

### Feedback on Validation:

**RunValidation Feedback:**
{{ RunValidationFeedback }}

**RunHandlerCore Feedback (Implicit Validation Needs):**
{{ RunHandlerCoreFeedback }}

---

## Task: Synthesize Validation Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to the validation of `@run` directives.

*   Identify necessary static checks (e.g., syntax, parameter counts).
*   Note required runtime checks (e.g., command existence for defined commands, language support).
*   Consolidate rules for parameter validation (types, formats).

**Output Format:** Produce concise notes outlining the synthesized validation requirements for the `@run` directive.

### Synthesized Requirements: @run Validation

*   Requirement 1: (e.g., Validate correct bracket usage for basic commands (`[]` vs `[[...]]`).)
*   Requirement 2: (e.g., Validate `language` specified in language commands is supported.)
*   Requirement 3: (e.g., Check existence of `$commandName` in state when `@run $commandName` is used.)
*   Requirement 4: (e.g., Runtime check for parameter type compatibility for defined commands?)
*   (List other key validation requirements) 