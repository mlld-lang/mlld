# Synthesize Subtype Requirements for '@run'

## Context

You are the **System Architect**. You have received feedback from component leads regarding the structure and parameters of the different `@run` subtypes (Basic, Language, Defined).

**CRITICAL NOTE:** Focus *only* on the structure, parameters, and type definitions needed to *represent* the different subtypes of the `@run` directive. Ignore execution details for now.

### Feedback on Subtypes/Parameters:

**RunHandlerCore Feedback:**
{{ RunHandlerCoreFeedback }}

**BasicCommandHandler Feedback:**
{{ BasicCommandHandlerFeedback }}

**LanguageCommandHandler Feedback:**
{{ LanguageCommandHandlerFeedback }}

**DefinedCommandHandler Feedback:**
{{ DefinedCommandHandlerFeedback }}

---

## Task: Synthesize Subtype & Parameter Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to defining the TypeScript types for the different `@run` subtypes and their parameters.

*   Identify common needs (e.g., discriminated unions).
*   Note conflicts regarding parameter structures.
*   Prioritize clear and type-safe representations.

**Output Format:** Produce concise notes outlining the synthesized requirements for `@run` subtypes and parameters.

### Synthesized Requirements: @run Subtypes & Parameters

*   Requirement 1: (e.g., Use discriminated union on `runType: 'basic' | 'language' | 'defined'`)
*   Requirement 2: (e.g., Define `BasicCommandParams` interface with...)
*   Requirement 3: (e.g., Define `LanguageCommandParams` interface with `language`, `code`, `parameters`...)
*   Requirement 4: (e.g., Define `DefinedCommandParams` interface with `commandName`, `arguments`...)
*   (List other key structural/parameter requirements) 