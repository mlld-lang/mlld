# Plan: Refactor DirectiveNode.values to Object Structure (Test-Driven)

## Goal

Refactor the `DirectiveNode` AST structure to replace the current flat `values: Node[]` array with an object `values: Record<string, Node[]>`. This will provide a more structured way for directive handlers to access different types of input components (e.g., paths, code blocks, variable lists) parsed from the directive syntax. This addresses critical inconsistencies identified after recent grammar/AST refactors that prevent services from correctly interpreting directive inputs.

## Problem

The current `DirectiveNode` (implicitly or explicitly) uses a single, flat array (`values`) to hold all parsed nodes associated with a directive's arguments/parameters. This is insufficient because different parts of a directive's syntax represent distinct input groups with different semantics (e.g., the path in `@import`, the language and code in `@run`). Services processing these directives need a clear way to distinguish and access these specific input groups. The flat array structure forces handlers to rely on implicit order or node type checks, which is brittle and error-prone.

## Proposed Solution

Modify the `DirectiveNode` structure to:

1.  Retain `kind` and `subtype` as top-level properties.
2.  Use a `values` property that is an object where:
    *   **Keys:** Represent the semantic group of the input (e.g., `path`, `imports`, `code`, `language`).
    *   **Values:** Are arrays (`Node[]`) containing the AST nodes belonging to that specific group.
3.  Introduce a new top-level `raw` property that is also an object:
    *   **Keys:** Mirror the keys present in the `values` object for the specific directive.
    *   **Values:** Are strings (`string`) containing the raw, unparsed text segment from the original input corresponding to that semantic group.
4.  Introduce a new top-level `meta` property that is an object:
    *   **Keys:** Represent metadata flags or derived information about the directive or its parts.
    *   **Values:** Are values (`any`) containing the metadata or flags.

This provides explicit access paths for handlers (e.g., `directiveNode.values.path`, `directiveNode.values.code`) while also preserving the raw input for each part (e.g., `directiveNode.raw.path`, `directiveNode.raw.code`) and storing metadata (e.g., `directiveNode.meta.isAbsolute`, `directiveNode.meta.hasVariables`).

**Example AST Structure (`@import [name] from [file.md]`):**

```typescript
{
  type: 'Directive',
  nodeId: '...',
  location: { ... },
  kind: 'import',             // Top-level
  subtype: 'importStandard',  // Top-level
  raw: {                      // Raw segments grouped by logical part
    imports: '[name]',
    path: '[file.md]'
  },
  values: {                   // Structured nodes grouped by logical part
    imports: [ /* VariableReference for 'name' */ ],
    path: [ /* Text, DotSeparator, Text for 'file.md' */ ]
  },
  meta: {                     // Metadata flags
    isAbsolute: false,
    hasVariables: false,
    isRelativeToHome: false,
    isRelativeToWorkspace: false,
    isRelativeToCurrentFile: false,
    hasTextInterpolation: false,
    variableWarning: false
  }
}
```

**Required Keys for `values` Object (and corresponding `raw` keys):**

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

## Updated Methodology: Test-First, Incremental Grammar Changes

Given the sensitivity of grammar modifications, we are following an enhanced test-driven development (TDD) approach with dedicated test infrastructure:

1. **New Test Infrastructure:** We've created a new test environment in the `grammar/tests/` directory with:
   * `fixtures/` - Type-safe directive test fixtures
   * `snapshots/` - For AST comparison during transformation
   * `utils/` - Helper functions for common testing operations
   * Directive-specific test files (e.g., `import.test.ts`)

2. **Finalized DirectiveNode Structure:**

```typescript
// Union of all directive subtypes 
type DirectiveSubtype = 
  | 'importAll' | 'importNamed' | 'importStandard'
  | 'embedPath' | 'embedVariable' | 'embedTemplate'
  | 'textVariable' | 'textTemplate'
  | 'dataVariable'
  | 'pathVariable'
  | 'runCommand' | 'runDefined' | 'runCode' | 'runCodeParams'
  | 'defineCommand';

interface DirectiveNode extends MeldNode {
  type: 'Directive';
  kind: DirectiveKind;
  subtype: DirectiveSubtype;
  values: { [key: string]: MeldNode[] };
  raw: { [key: string]: string };
  meta: { [key: string]: unknown };
}
```

3. **Directive-by-Directive Implementation:**
   * Create fixtures and tests for one directive at a time
   * Update the grammar for that directive
   * Verify through tests before moving to the next

4. **Grammar Capture Strategy:**
   * Use Peggy's `$()` syntax to capture raw text segments
   * Create helper method `createStructuredDirective` for consistent node creation
   * Build values, raw, and meta objects with consistent structure

## Implementation Steps

1. **Created Grammar Test Infrastructure in `grammar/tests/`:**
   * Set up test utilities and fixtures
   * Created a template pattern for directive tests
   * Developed AST snapshot comparison utilities
   * Added implementation roadmap document

2. **Updated Type Definitions:**
   * Added `DirectiveSubtype` union type in `directives.ts`
   * Updated `DirectiveNode` interface with new structure:
     * Top-level kind and subtype properties
     * Structured values, raw, and meta objects
     * Removed redundant multiLine property
   * Marked old directive data interfaces as deprecated

3. **Added Grammar Helper Function:**
   ```javascript
   createStructuredDirective(kind, subtype, values, raw, meta, locationData) {
     return this.createNode(NodeType.Directive, { 
       kind, 
       subtype, 
       values, 
       raw, 
       meta 
     }, locationData);
   }
   ```

4. **Updating Import Directive Grammar:**
   * Modified each rule in `import.peggy` to:
     * Capture raw text with `$()` syntax: `pathRaw:$(pathParts:PathValue)`
     * Create structured objects: `values: { imports: [...], path: [...] }`
     * Use new helper: `return helpers.createStructuredDirective(...)`
   * Built and verified the grammar compiles

5. **Implementation Order:**
   * Import directive (current)
   * Text directive (next)
   * Path directive
   * Embed directive
   * Data directive
   * Run directive (complex)
   * Define directive (most complex)

For each directive, we follow the same pattern:
1. Create type-safe fixtures for all variants
2. Write tests that initially fail
3. Update grammar and update helpers if needed
4. Build and test until successful
5. Only then move to the next directive

4.  **Update Directive Handlers (`services/pipeline/DirectiveService/handlers/`):**
    *   Once all grammar changes are complete and `npm test core/ast` passes fully.
    *   Iterate through all directive handlers.
    *   Modify handler logic to access input nodes via the new `values` object structure (e.g., `directiveNode.values.path`, `directiveNode.values.code`).
    *   Update handlers to also utilize the `raw` property where applicable (e.g., for logging, error messages, or direct manipulation of raw input).
    *   Update handlers to also utilize the `meta` property where applicable (e.g., for conditional logic based on metadata flags).

5.  **Update Handler & Integration Tests:**
    *   Update handler tests (`services/pipeline/**/*.test.ts`) and integration tests (`api/*.test.ts`) to reflect the changes in handler logic and ensure end-to-end functionality.
    *   **Build & Test:** Run `npm run build:grammar && npm test`. Ensure all tests pass.

## Pragmatism Note

This plan focuses solely on restructuring the `values` property within `DirectiveNode`. It intentionally avoids a broader refactoring of the overall AST type system at this time to prioritize fixing the immediate functional blockers. Further type strengthening can be addressed in a separate effort.
