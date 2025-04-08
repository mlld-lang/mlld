# Plan: Context-Aware Variable Parsing in AST

## Goal

Refactor the `@core/ast` parser to be context-aware regarding variable interpolation syntax (`{{...}}`). The parser should generate an AST that accurately reflects whether `{{...}}` represents a variable reference needing resolution or literal text, based on Meld's language rules.

## Problem Statement

Currently, the parser outputs literal strings containing `{{...}}` syntax even within directive values/templates where interpolation is expected (e.g., `@data config = { "greeting": "Hello {{user}}" }`). This forces downstream services (`ResolutionService`, directive handlers) to:

1.  **Re-parse** these strings during the resolution phase.
2.  **Carry context** about the string's origin to determine *if* interpolation should even occur (since `{{...}}` in plain text should be literal).
3.  **Risk inconsistency** if the secondary parsing logic (like the now-removed fallback in `ResolutionService`) differs from the main parser.

This violates the principle of the AST fully representing the parsed structure and pushes syntactic concerns into the semantic resolution phase, increasing complexity and fragility.

## Proposed Solution: Context-Aware Parsing

1.  **Parser Logic Modification:**
    *   The parser must track the context it's currently in (e.g., plain text, directive string literal, directive path, directive template, command template).
    *   When `{{...}}` syntax is encountered:
        *   **In an Interpolation Context** (Directive string values like `@text`/`@data`, paths in `@path`/`@embed`, templates in `@embed`, commands in `@run`/`@define`): Parse `{{...}}` into a distinct `VariableReferenceNode`. Any surrounding literal text within the same string should be parsed into adjacent `TextNode`s.
        *   **In a Non-Interpolation Context** (Regular paragraph text, code fences, etc.): Parse `{{...}}` as literal text, incorporating it into the content of a single `TextNode`.

2.  **AST Structure Changes:**
    *   Evaluate the `value` (or equivalent) property types for directives where interpolated strings are possible (`@text`, `@data` string values, `@run` command, `@embed` path/template, `@path` path).
    *   If these currently store a simple `string`, change the type to `MeldNode[]` (or potentially a more specific `(TextNode | VariableReferenceNode)[]`) to accommodate the sequence of text and variable nodes parsed from the interpolated string.

## Impact & Benefits

*   **Accurate AST:** The AST will correctly represent the parsed structure, distinguishing literal `{{...}}` from variable references.
*   **Simplified Resolution:** `ResolutionService` and directive handlers will receive pre-parsed node sequences, eliminating the need for re-parsing strings or context-tracking for interpolation rules.
*   **Reduced Complexity:** Removes logic duplication and potential inconsistencies between the main parser and any secondary parsing attempts.
*   **Improved Robustness:** Reduces the surface area for bugs related to string parsing during resolution.

## Implementation Steps

1.  **Analyze Grammar/Parser:** Investigate `core/ast/parser.ts` and any underlying grammar files (e.g., PeggyJS grammar if used) to determine how to implement context tracking and conditional parsing of `{{...}}`.
2.  **Update AST Types:** Modify relevant interface definitions in `core/ast/types.ts` (or related type files) to change directive value properties from `string` to `MeldNode[]` where necessary.
3.  **Implement Parser Changes:** Modify the parser logic to generate the new AST structure based on context.
4.  **Refactor Consumers:** Update `ResolutionService` (specifically `resolveNodes` if it processes directive values) and relevant directive handlers (`TextDirectiveHandler`, `DataDirectiveHandler`, `RunDirectiveHandler`, `EmbedDirectiveHandler`, `PathDirectiveHandler`) to expect and handle `MeldNode[]` values instead of simple strings in the affected directive properties.
5.  **Update Tests:**
    *   Refactor existing unit/integration tests for the parser, `ResolutionService`, and affected directive handlers to align with the new AST structure and expectations.
    *   Implement the AST snapshot test suite (`_plans/AST-SNAPSHOT.md`) to provide comprehensive regression testing for the parser's output.

## Priority

**High.** This is a foundational fix to correctly represent the language's semantics in the AST and significantly simplify the downstream resolution pipeline. 