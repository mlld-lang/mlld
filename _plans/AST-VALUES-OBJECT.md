# Plan: Refactor DirectiveNode.values to Object Structure (Test-Driven)

## Goal

Refactor the `DirectiveNode` AST structure to replace the current flat `values: Node[]` array with an object `values: Record<string, Node[]>`. This will provide a more structured way for directive handlers to access different types of input components (e.g., paths, code blocks, variable lists) parsed from the directive syntax. This addresses critical inconsistencies identified after recent grammar/AST refactors that prevent services from correctly interpreting directive inputs.

## Problem

The current `DirectiveNode` (implicitly or explicitly) uses a single, flat array (`values`) to hold all parsed nodes associated with a directive's arguments/parameters. This is insufficient because different parts of a directive's syntax represent distinct input groups with different semantics (e.g., the path in `@import`, the language and code in `@run`). Services processing these directives need a clear way to distinguish and access these specific input groups. The flat array structure forces handlers to rely on implicit order or node type checks, which is brittle and error-prone.

## Proposed Solution

Modify the `DirectiveNode` structure so that its `values` property is an object where:
*   **Keys:** Represent the semantic group of the input (e.g., `path`, `imports`, `code`, `language`).
*   **Values:** Are arrays (`Node[]`) containing the AST nodes belonging to that specific group.

This provides explicit access paths for handlers (e.g., `directiveNode.values.path`, `directiveNode.values.code`).

**Required Keys for `values` Object:**

Based on current directive syntaxes, the following keys are needed:

*   `path` (e.g., for `@import`, `@embed`)
*   `imports` (e.g., for `@import`)
*   `variables` (e.g., for `@text`, `@data`, `@path`)
*   `template` (e.g., for `@embed`, `@text`, `@define`)
*   `data` (e.g., for `@data`)
*   `content` (e.g., for content in `@text` variables)
*   `params` (e.g., for `@define`)
*   `command` (For `@run` with an inline command)
*   `arguments` (e.g., for `@run`)
*   `code` (e.g., for `@run`)
*   `language` (e.g., for `@run`)

*Note: We will consistently use arrays (`Node[]`) as values for each key, even if a group typically contains only one node (like `language`), for structural uniformity.*

## Where each of the keys are used

The value array keys are essentially the arguments for each directive. Here are the arguments for each directive:

`@text myvar = "some text"` <-- textVariable (uses 'variables', "content")
`@text myvar = [[some {{variable}}]]` <-- textTemplate (uses 'variables', 'template')
`@data myvar = { "key": "value" }` <-- dataVariable (uses 'variables', 'data')
`@path myvar = /path/to/file` <-- pathVariable (uses 'variables', 'path')
`@embed [path/to/file.md]` <-- embedPath (uses 'path')
`@embed {{variable}}` <-- embedVariable (uses 'variables')
`@embed [[Template with {{variables}}]]` <-- embedTemplate (uses 'template')
`@define mycommand (param, param2) = [echo "{{param}} and {{param2}}"]` <-- defineCommand (uses 'variables', 'params', 'template')
`@run [echo "hello world"]` <-- runCommand (uses 'command')
`@run [echo {{variable}}]` <-- runCommand (uses 'command')
`@run $mycommand ({{param}}, {{variable}})` <-- runDefined (uses 'variables', 'arguments')
`@run python [ print("Hello world") ]` <-- runCode (uses 'language', 'code')
`@run python ({{variable}}) [ print(variable) ]` <-- runCodeParams (uses 'language', 'arguments', 'code')
`@import [*] from [file.mld]` <-- importAll (uses 'imports', 'path')
`@import [variable, othervar] [file.mld]` <-- importStandard (uses 'imports', 'path')
`@import [variable as var, myvar] from [file.mld]` <-- importNamed (uses 'imports', 'path')

## Methodology: Test-First, Incremental Grammar Changes

Given the sensitivity of grammar modifications, we will follow a strict test-driven development (TDD) approach:

1.  **Tests First:** Before modifying *any* grammar code, update the relevant tests and fixtures to expect the *target* AST structure. These tests will initially fail.
2.  **Incremental Changes:** Modify the grammar one directive type at a time, focusing on a single file within `grammar/directives/`.
3.  **Build & Test Constantly:** After *every* single grammar modification, no matter how small:
    *   Run `npm run build:grammar`. Address any build errors immediately.
    *   Run `npm test core/ast`. Ensure the tests corresponding to the modified directive now pass, while others remain unaffected (or fail as expected if they depend on directives not yet updated).

## Implementation Steps

1.  **Update AST Grammar Tests & Fixtures (`core/ast/` & `core/syntax/types/fixtures/`):**
    *   Identify test files (e.g., `directive-syntax.test.ts`, `import-directive.test.ts`, etc.) corresponding to directives needing the `values` object refactor.
    *   Update the expected AST output in test fixtures (likely JSON files in `core/syntax/types/fixtures/`) to use the new `values: { key: [Nodes...], ... }` structure.
    *   Modify assertions in the `.test.ts` files to verify this new structure.
    *   **Verify:** Run `npm test core/ast`. Confirm that the updated tests now *fail* as expected.

2.  **Update AST Types (`core/syntax/types/nodes.ts`):**
    *   Locate or define the `DirectiveNode` interface.
    *   Change the type definition of its `values` property from `Node[]` (or similar) to `Record<string, MeldNode[]>`. Consider adding known optional keys for better type hinting (e.g., `path?: MeldNode[]; code?: MeldNode[]; ...`).

3.  **Incrementally Update Grammar (in `grammar/directives/`):**
    *   **Select Directive:** Choose one directive file to modify (e.g., `import.peggy`).
    *   **Modify Grammar Rules:**
        *   Adjust parsing rules to capture the raw AST nodes for each distinct input group (e.g., capture the array of nodes for the path, the array of nodes for imports).
        *   In the action block (`{ ... }`), construct the `values` object using the captured node arrays (e.g., `values: { path: pathNodes, imports: importNodes }`).
        *   Use the standard `helpers.createNode(NodeType.Directive, { kind: ..., subtype: ..., values: values }, location())` to return the final node. Ensure `kind` and `subtype` are correctly determined.
    *   **Build:** Run `npm run build:grammar`. Fix any errors.
    *   **Test:** Run `npm test core/ast`. Verify the tests for *this specific directive* now pass. Fix any failures.
    *   **Repeat:** Select the next directive file (e.g., `run.peggy`, `embed.peggy`) and repeat the Modify-Build-Test cycle until all affected directives are updated.

4.  **Update Directive Handlers (`services/pipeline/DirectiveService/handlers/`):**
    *   Once all grammar changes are complete and `npm test core/ast` passes fully.
    *   Iterate through all directive handlers.
    *   Modify handler logic to access input nodes via the new `values` object structure (e.g., `directiveNode.values.path`, `directiveNode.values.code`).

5.  **Update Handler & Integration Tests:**
    *   Update handler tests (`services/pipeline/**/*.test.ts`) and integration tests (`api/*.test.ts`) to reflect the changes in handler logic and ensure end-to-end functionality.
    *   **Build & Test:** Run `npm run build:grammar && npm test`. Ensure all tests pass.

## Pragmatism Note

This plan focuses solely on restructuring the `values` property within `DirectiveNode`. It intentionally avoids a broader refactoring of the overall AST type system at this time to prioritize fixing the immediate functional blockers. Further type strengthening can be addressed in a separate effort.
