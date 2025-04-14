# Synthesize Subtype/Parameter Requirements for '@{{ directiveName }}'

## Context

You are the **System Architect**. You have received feedback from component leads regarding the structure and parameters of the `@{{ directiveName }}` directive, which defines reusable commands.

**CRITICAL NOTE:** Focus *only* on the structure, parameters (name, type?), and template body needed to *define* a command. Ignore execution/invocation details for now.

### Feedback on Definition Structure:

**CoreDirective Feedback:**
{{ CoreDirectiveFeedback }}

**DefineHandler Feedback:**
{{ DefineHandlerFeedback }}

**ParserCore Feedback (Syntax Aspects):**
{{ ParserCoreFeedback }}

**StateCore Feedback (Storage Aspects):**
{{ StateCoreFeedback }}

---

## Task: Synthesize Definition Structure Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to defining the TypeScript types for the `@{{ directiveName }}` directive itself and the structure used to store the definition in state.

*   Identify common needs (e.g., interface for `CommandDefinition`).
*   Note requirements for parameter representation (e.g., list of strings? Typed parameters?).
*   Consolidate needs for storing the command template (string? structured?).

**Output Format:** Produce concise notes outlining the synthesized requirements for the `@{{ directiveName }}` definition structure.

### Synthesized Requirements: @{{ directiveName }} Definition Structure

*   Requirement 1: (e.g., Define `CommandDefinition` interface with `name`, `parameters: string[]`, `commandTemplate: string`)
*   Requirement 2: (e.g., Consider adding optional parameter types if feasible?)
*   Requirement 3: (e.g., Metadata storage requirements?)
*   (List other key structural/parameter requirements for the definition) 