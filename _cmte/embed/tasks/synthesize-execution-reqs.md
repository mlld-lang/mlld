# Synthesize Execution Requirements for '@{{ directiveName }}'

## Context

You are the **System Architect**. You have received feedback from component leads regarding the runtime execution of the `@{{ directiveName }}` directive, focusing on path/variable resolution and content embedding.

**CRITICAL NOTE:** Focus *only* on the requirements for the *runtime execution* of `@{{ directiveName }}` (Path, Variable, Template subtypes). Ignore static type definitions for now.

### Feedback on Execution/Runtime:

# NOTE: Inputs adjusted for @embed context

**EmbedHandler Feedback:**
{{ EmbedHandlerFeedback }}

**ResolutionCore Feedback (Path/Variable Resolution):**
{{ ResolutionCoreFeedback }}

**VariableResolution Feedback (Variable Details):**
{{ VariableResolutionFeedback }}

**ContentResolution Feedback (Template Variables):**
{{ ContentResolutionFeedback }}

**FileSystemCore Feedback (Reading Files):**
{{ FileSystemCoreFeedback }}

**StateCore Feedback (Accessing Variables):**
{{ StateCoreFeedback }}

**InterpreterCore Feedback (General Context):**
{{ InterpreterCoreFeedback }}

# Removed CommandExecutionServiceFeedback

---

## Task: Synthesize Execution & Runtime Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to the runtime execution of `@{{ directiveName }}` directives.

*   Identify needs for path resolution (including `$PROJECTPATH`, etc.).
*   Note requirements for variable resolution (including field access, special context for variable embeds).
*   Consolidate needs for template variable processing.
*   List requirements for file reading (encoding, error handling).
*   Outline context needed for distinguishing subtypes at runtime.

**Output Format:** Produce concise notes outlining the synthesized requirements for the `@{{ directiveName }}` execution environment and runtime behavior.

### Synthesized Requirements: @{{ directiveName }} Execution & Runtime

*   Requirement 1: (e.g., Path embeds must resolve relative paths correctly...)
*   Requirement 2: (e.g., Variable embeds require specific resolution context to prevent path prefixing...)
*   Requirement 3: (e.g., Template embeds must resolve variables within the template content...)
*   Requirement 4: (e.g., File reading must handle specified encodings...)
*   (List other key execution/runtime requirements) 