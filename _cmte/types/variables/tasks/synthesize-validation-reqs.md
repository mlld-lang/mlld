# Synthesize Variable Validation Requirements

## Context

You are the **System Architect**. You have received feedback from component leads regarding the validation rules needed for variable definitions and usage.

**CRITICAL NOTE:** Focus *only* on validation requirements (static and runtime) for variable definitions (`@text`,`@data`,`@path`), references (`\{{var}}`, `$path`), and state.

### Feedback on Validation:

**VariableHandler Feedback (Usage Validation):**
{{ VariableHandlerFeedback }}

**StateManagement Feedback (Definition/Storage Validation):**
{{ StateManagementFeedback }}

**ParserCore Feedback (Syntax Validation):**
{{ ParserCoreFeedback }}

---

## Task: Synthesize Variable Validation Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to the validation of variable definitions and usage.

*   Identify necessary static checks (e.g., identifier syntax, definition syntax).
*   Note required runtime checks (e.g., variable existence based on strict mode, type compatibility during access?).
*   Consolidate rules for path validation.
*   List needs for circular reference detection.

**Output Format:** Produce concise notes outlining the synthesized validation requirements for Meld variables.

### Synthesized Requirements: Variable Validation

*   Requirement 1: (e.g., Validate identifier naming conventions.)
*   Requirement 2: (e.g., Runtime check for variable existence respecting `strict` mode.)
*   Requirement 3: (e.g., Path validation rules for `@path` definitions and `$path` usage.)
*   Requirement 4: (e.g., Circular reference detection mechanism.)
*   (List other key validation requirements) 