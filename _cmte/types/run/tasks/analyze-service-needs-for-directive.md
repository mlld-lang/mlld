# Simplify {{ item.key }} Code with Stronger '@{{ directiveName }}' Types

## Context

You are the lead developer for the **{{ item.key }}** service.
The Meld language is improving its TypeScript type system for the `@{{ directiveName }}` directive, which handles shell command execution, language script execution, and defined command invocation.

**CRITICAL NOTE:** The '@{{ directiveName }}' directive has distinct subtypes (BasicCommand, LanguageCommand, DefinedCommand). Base your analysis on how your service interacts with *any* of these `@run` forms and their parameters/outputs.

Review the following:
1.  **Overall Architecture:** {{ overallArchitecture }}
2.  **`@{{ directiveName }}` Documentation:** {{ directiveClarityContent }}
3.  **Your Service Code (`{{ item.key }}`)**: {{ item.codeContent }}

---

## Task: Propose & Justify '@{{ directiveName }}' Type Improvements for Your Code

Examine your service's code (`{{ item.codeContent }}`) where it interacts with `@{{ directiveName }}` directives, command execution, parameter handling, or state related to command definitions.

1.  **Identify areas of complexity, manual validation, type casting, or edge-case handling** in your code related to executing commands, passing parameters, or managing command state/definitions via `@{{ directiveName }}`.
2.  **Propose specific TypeScript type features** (e.g., stricter types for command parameters/arguments, clearer interfaces for command definitions, discriminated unions for run subtypes) that would simplify or eliminate these complexities.
3.  **Crucially, make a clear case for *why* each proposed feature is needed.** Explain how it would tangibly benefit the `{{ item.key }}` service by making the code simpler, safer, or easier to maintain when interacting with `@run` directives. 