# Synthesize Variable Structure Requirements

## Context

You are the **System Architect**. You have received feedback from component leads regarding the internal TypeScript types needed to represent variables in the Meld state (Text, Data, Path, Command definitions).

**CRITICAL NOTE:** Focus *only* on the *structure* of how variables and command definitions are stored and typed internally. Ignore runtime resolution logic for now.

### Feedback on Variable/State Structure:

**StateManagement Feedback:**
{{ StateManagementFeedback }}

**VariableHandler Feedback (Type Representation Needs):**
{{ VariableHandlerFeedback }}

**CoreDirective Feedback (Command Definition Structure):**
{{ CoreDirectiveFeedback }}

**ParserCore Feedback (Syntax -> Type Mapping):**
{{ ParserCoreFeedback }}

---

## Task: Synthesize Variable Structure Requirements

Review the provided feedback. Consolidate the requirements related *specifically* to defining the TypeScript types for representing different variable kinds (Text, Data, Path, CommandDef) in the state.

*   Identify common needs (e.g., interfaces for `MeldVariable`, `CommandDefinition`).
*   Note requirements for representing variable values (e.g., `string`, `any`, specific JSON types).
*   Consolidate needs for metadata associated with variables (e.g., type tags, source location?).

**Output Format:** Produce concise notes outlining the synthesized requirements for internal variable type structures.

### Synthesized Requirements: Internal Variable Structures

*   Requirement 1: (e.g., Define base `MeldVariable` interface with `kind: 'text'|'data'|'path'`)
*   Requirement 2: (e.g., Define `TextVariable extends MeldVariable` with `value: string`)
*   Requirement 3: (e.g., Define `DataVariable extends MeldVariable` with `value: any` or stricter JSON types)
*   Requirement 4: (e.g., Define `CommandDefinition` structure based on @define)
*   (List other key structural requirements) 