# Plan: Context-Aware Variable Parsing in AST

## Goal

Refactor the `@core/ast` parser to be context-aware regarding variable interpolation syntax (`{{...}}`). The parser should generate an AST that accurately reflects whether `{{...}}` represents a variable reference needing resolution or literal text, based on Meld's language rules.

## Problem Statement

Currently, the parser (`@core/ast/grammar/meld.pegjs`) incorrectly parses variable syntax (`{{...}}` or `$identifier`) as `VariableReferenceNode` even in plain text contexts (outside of directives). This forces downstream services (`ResolutionService`, directive handlers) to:

1.  **Re-parse** strings during the resolution phase to find potential variables.
2.  **Carry context** about the string's origin to determine *if* interpolation should even occur (since `{{...}}` in plain text should be literal).
3.  **Risk inconsistency** if the secondary parsing logic differs from the main parser.

This violates the principle of the AST fully representing the parsed structure, pushes syntactic concerns into the semantic resolution phase, and increases complexity and fragility.

## Refined Solution: Context-Aware Parsing via Grammar

We will modify the PEG.js grammar to handle variable parsing contextually, ensuring the AST accurately reflects intent.

**1. Detailed `meld.pegjs` Modification Strategy:**

*   **Core Idea:** Introduce a dedicated grammar rule (`InterpolatableContent`) responsible for parsing strings *only* in contexts where variable interpolation is allowed (directive values, paths, templates). Plain text parsing will remain separate and treat `{{...}}`/`$var` literally.

*   **New Grammar Rules:**
    *   `LiteralTextSegment`:
        *   **Purpose:** Matches one or more characters that are *not* the start of a `Variable` rule (`{{` or `$identifier`).
        *   **Action:** Generates a `TextNode` containing the literal character sequence.
    *   `InterpolatableContent`:
        *   **Purpose:** Parses content where variables *should* be interpolated.
        *   **Structure:** Matches `(LiteralTextSegment / Variable)+`. The existing `Variable` rule (covering `TextVar`, `DataVar`, `PathVar`) will be used here.
        *   **Action:** Returns an array of `TextNode` and `VariableReferenceNode`, representing the sequence of literal text and variable references. Example: `"Hello {{user}}"` becomes `[TextNode(content='Hello '), VariableReferenceNode(identifier='user')]`.

*   **Context Handling Mechanism:**
    *   The top-level `Start` rule in `meld.pegjs` prioritizes matching directives (`@text`, `@embed`, etc.).
    *   If a directive rule matches, its *internal* parsing logic for values, paths, or templates will explicitly call the new `InterpolatableContent` rule.
    *   If no directive matches, the `TextBlock` rule (via `TextPart`) will consume input as plain text. Crucially, `TextBlock`/`TextPart` will *not* call `InterpolatableContent`. It will be modified to consume `{{...}}`/`$var` as part of its literal `TextNode` content in this non-directive context.

*   **Specific Rule Modifications (Calls to `InterpolatableContent`):**
    *   `TextValue`: Modify alternatives parsing content of `StringLiteral` (`"..."`, `'...'`, `` `...` ``) and `MultilineTemplateLiteral` (`[[...]]`).
    *   `_EmbedRHS`: Modify the `[[...]]` (template) and `[...]` (path) alternatives to parse their *content* using this rule.
    *   `_RunRHS`: Modify the `[[...]]` (template) and `[...]` (command) alternatives.
    *   `DefineValue`: Modify alternatives parsing content of `StringLiteral` and `@run [...]`.
    *   `DataValue`: Modify how `PropertyValue` handles `StringLiteral` within `DataObjectLiteral` or `ArrayLiteral` when under `@data`. The string *content* must be parsed using `InterpolatableContent`.
    *   `PathValue`: Modify the `StringLiteral` alternative to parse its content.
    *   `VarDirective` (`VarValue`): String literals assigned via `@var` currently do *not* support interpolation. This remains unchanged unless a future decision requires it.

*   **Path Handling in AST:**
    *   When directive paths (e.g., in `@embed`, `@path`, `@import`) are parsed using `InterpolatableContent`, the AST node will store the resulting array.
    *   Introduce a new property, e.g., `interpolatedValue: InterpolatableValue`, alongside `raw` and `structured` representations within the path object in the AST node. The `raw` value will still hold the original string, while `interpolatedValue` holds the parsed `[TextNode, VariableReferenceNode, ...]` sequence.

*   **Maintainability:** Isolating the interpolation logic within `InterpolatableContent` makes the grammar clearer and promotes reuse across different directive types.

**2. AST Type Updates (`@core/types/`)**

*   **Define `InterpolatableValue`:** Introduce a shared type alias:
    ```typescript
    import type { TextNode, VariableReferenceNode } from '@core/syntax/types'; // Adjust import path
    export type InterpolatableValue = (TextNode | VariableReferenceNode)[];
    ```
*   **Update Node Interfaces:** Modify relevant `DirectiveNode` interfaces (e.g., `TextDirectiveNode`, `DataDirectiveNode`, `EmbedDirectiveNode`, `PathDirectiveNode`, etc.). Change properties that previously held a potentially interpolated `string` (like `value`, `command`, `template`, `path.raw`) to instead hold or additionally hold the `InterpolatableValue` type. Ensure clear distinction between the original raw string and the parsed sequence. For paths, this means adding the `interpolatedValue` property to the path object structure within the directive node.

**3. AST Test Update Strategy (`meld-spec`, `*.test.ts`)**

*   **Role of Tests:** Tests are the primary validation tool. Expect initial failures after grammar changes; use them to guide implementation.
*   **New Test Cases (`meld-spec`):** Create specific tests covering:
    *   Plain text `{{...}}`/`$var` remaining literal.
    *   Successful interpolation in `@text`, `@data`, `@embed` (paths/templates), `@run`, `@path`, `@define`.
    *   Nested interpolation in `@data` objects/arrays.
    *   Edge Cases: Adjacent variables (`{{a}}{{b}}`), start/end of string (`{{a}}text`, `text{{a}}`), empty strings, strings with only variables (`{{a}}`), quoted `{{...}}` within interpolated strings (should remain literal within quotes).
*   **Updating Existing Tests:**
    *   Identify affected test files by searching for assertions related to string values in the affected directives.
    *   **Snapshot Tests (`*.spec.ts`):** Update snapshots. Assertions will now show the `InterpolatableValue` array structure (e.g., `[{ type: 'Text', ... }, { type: 'VariableReference', ... }]`) instead of a simple string for the relevant properties.
    *   **Assertion Tests (`*.test.ts`):** Modify assertions to check for the array structure, correct node types (`TextNode`, `VariableReferenceNode`), correct order, and correct content/identifiers within the nodes.
*   **Debugging Workflow:** Use `npm run build:grammar && npm test core/ast` frequently. Employ `test/debug-test.js` to analyze differences between expected and actual AST output for failing tests.

**4. Downstream Impact Outline (High-Level)**

*   **`ResolutionService`:**
    *   **Input Change:** Core methods processing directive content will receive `InterpolatableValue` arrays instead of raw strings needing re-parsing.
    *   **Logic Change:** Implement iteration over the `InterpolatableValue` array. For `TextNode`, append `content`. For `VariableReferenceNode`, resolve the variable using existing mechanisms and append the result.
    *   **Cleanup:** Remove any secondary/fallback `{{...}}` parsing logic.
*   **Directive Handlers (`TextDirectiveHandler`, `DataDirectiveHandler`, etc.):**
    *   **Input Change:** Will receive AST nodes with `InterpolatableValue` arrays for relevant properties.
    *   **Logic Change:** Adapt internal logic. May involve calling updated `ResolutionService` methods or performing the array iteration directly.
*   **Path Resolution Logic:**
    *   **Processing Order:** Path resolution will now first process the `interpolatedValue` array (resolving variables) to construct the target path string *before* applying filesystem/URL validation and resolution steps using services like `PathService`.
*   **General AST Consumers:** Any code directly accessing affected directive node properties (e.g., `node.value` where `value` was previously `string`) must be updated to handle the new `InterpolatableValue` array structure.

## Implementation Steps (Revised Order)

1.  **Refine Plan:** (Done) Ensure the detailed plan is agreed upon.
2.  **Update AST Types:** Define `InterpolatableValue` and modify relevant `DirectiveNode` interfaces in `@core/types/`. (Requires careful review of all affected directives).
3.  **Implement Grammar Changes (`meld.pegjs`):** Introduce `LiteralTextSegment`, `InterpolatableContent`, modify `TextPart`, and update relevant directive rules to call `InterpolatableContent`. Build and perform initial basic tests.
4.  **Update Tests:** Implement new test cases in `meld-spec` and update existing tests (`*.spec.ts`, `*.test.ts`) to expect the new AST structure. Use failing tests to drive grammar refinement. Iterate between steps 3 & 4.
5.  **Refactor Downstream Consumers:** (Separate phase/PR likely) Update `ResolutionService`, directive handlers, and any other AST consumers to work with the `InterpolatableValue` type.

## Priority

**High.** This remains a foundational fix for AST accuracy and downstream simplification. 