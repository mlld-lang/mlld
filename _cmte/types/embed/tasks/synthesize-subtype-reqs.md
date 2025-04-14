# Synthesize Subtype/Parameter Requirements for '@{{ directiveName }}'

## Context

You are the **System Architect**. You have received feedback from component leads regarding the structure and parameters of the different `@{{ directiveName }}` subtypes (Path, Variable, Template).

**CRITICAL NOTE:** Focus *only* on the structure and parameters needed to *represent* the different subtypes of the `@{{ directiveName }}` directive (e.g., how to represent a path vs. a variable reference vs. template content).

### Feedback on Subtypes/Parameters:

**CoreDirective Feedback:**
{{ CoreDirectiveFeedback }}

**EmbedHandler Feedback:**
{{ EmbedHandlerFeedback }}

**ParserCore Feedback (Syntax Aspects):**
{{ ParserCoreFeedback }}

---

## Task: Synthesize Subtype & Parameter Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to defining the TypeScript types for the different `@{{ directiveName }}` subtypes and their parameters.

*   Identify common needs (e.g., discriminated union based on embed type).
*   Note requirements for representing path, variable reference, or template content.
*   Prioritize clear and type-safe representations.

**Output Format:** Produce concise notes outlining the synthesized requirements for `@{{ directiveName }}` subtypes and parameters.

### Synthesized Requirements: @{{ directiveName }} Subtypes & Parameters

*   Requirement 1: (e.g., Use discriminated union on `embedType: 'path' | 'variable' | 'template'`)
*   Requirement 2: (e.g., Define `EmbedPathParams` interface with `path: string | StructuredPath`)
*   Requirement 3: (e.g., Define `EmbedVariableParams` interface with `variableRef: string`)
*   Requirement 4: (e.g., Define `EmbedTemplateParams` interface with `templateContent: string`)
*   (List other key structural/parameter requirements) 