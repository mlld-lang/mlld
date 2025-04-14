# Synthesize Variable Resolution Requirements

## Context

You are the **System Architect**. You have received feedback from component leads regarding the runtime resolution of variables (Text, Data, Path) within Meld.

**CRITICAL NOTE:** Focus *only* on the requirements for the *runtime resolution* of variable references (`\{{var}}`, `\{{var.field}}`, `$path`), including context needed.

### Feedback on Variable Resolution:

**VariableHandler Feedback (Resolution Logic):**
{{ VariableHandlerFeedback }}

**ResolutionCore Feedback (General Context):**
{{ ResolutionCoreFeedback }}

**ContentResolution Feedback (String Interpolation):**
{{ ContentResolutionFeedback }}

**StateManagement Feedback (Accessing State):**
{{ StateManagementFeedback }}

**InterpreterCore Feedback (Context Propagation):**
{{ InterpreterCoreFeedback }}

---

## Task: Synthesize Variable Resolution Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to the runtime resolution of variable references.

*   Identify needs for the `ResolutionContext` (e.g., strict mode, allowed types, current path, state access).
*   Note requirements for handling field/array access (`.` notation).
*   Consolidate needs for type conversion and formatting (`convertToString`).
*   List requirements for handling nested references and circularity.

**Output Format:** Produce concise notes outlining the synthesized requirements for the variable resolution process and context.

### Synthesized Requirements: Variable Resolution & Context

*   Requirement 1: (e.g., `ResolutionContext` must include `strict` flag...)
*   Requirement 2: (e.g., Field access needs robust handling for objects and arrays...)
*   Requirement 3: (e.g., `convertToString` needs clear rules for inline vs. block formatting based on context...)
*   Requirement 4: (e.g., Max resolution depth must be enforced...)
*   (List other key resolution/context requirements) 