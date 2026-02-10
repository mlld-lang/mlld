# INTERPRETER CORE EXTRACTION MAP

## ENTRYPOINT CONTRACTS

This map defines extraction seams around these public entrypoints:

- `evaluate(node, env, context?)`
- `interpolate(nodes, env, context?, options?)`
- `cleanNamespaceForDisplay(namespaceObject)`

The contracts stay stable:

- `evaluate` returns `{ value, env }` with optional process metadata fields used by command/code paths.
- `interpolate` returns a string and supports optional descriptor collection through options.
- `cleanNamespaceForDisplay` returns a JSON string with `frontmatter` and `exports` groups.

## MODULE OWNERSHIP MAP

### `interpreter/core/interpreter/traversal.ts`

Owns:
- Array/document traversal.
- Frontmatter-first handling.
- Non-directive intent emission for text/newline/code-fence paths.
- Node recording used for document reconstruction.

Does not own:
- Single-node dispatch routing.
- Variable-reference resolution internals.
- Interpolation descriptor merge/recording.

### `interpreter/core/interpreter/dispatch.ts`

Owns:
- Single-node dispatch routing by node type.
- Unknown-node error path.

Does not own:
- Node-family business logic.
- Document-level traversal and intent ordering.

### `interpreter/core/interpreter/resolve-variable-reference.ts`

Owns:
- Variable lookup fallback and expression-context missing-variable behavior.
- Field traversal and condensed-pipe application for variable references.
- `commandRef` execution branch handling.

Does not own:
- Global traversal emission ordering.
- Generic node-family dispatch for unrelated types.

### `interpreter/core/interpreter/handlers/*`

Owns:
- Specialized node-family handling (for example: `ExecInvocation`, `VariableReferenceWithTail`, `NewExpression`, `LabelModification`, unified expressions, control-flow, content-loader/file-reference, code, command).

Does not own:
- Entry-point orchestration.
- Cross-family routing policy.

### `interpreter/core/interpreter/interpolation-security.ts`

Owns:
- `interpolateWithSecurityRecording` adapter behavior.
- Descriptor collection, merge, and recording order.

Does not own:
- Core interpolation implementation internals.
- Dispatch or traversal responsibilities.

### `interpreter/core/interpreter/value-resolution.ts`

Owns:
- `resolveVariableValue` helper behavior across variable kinds.

Does not own:
- Display formatting.
- Dispatch and traversal orchestration.

### `interpreter/core/interpreter/namespace-display.ts`

Owns:
- `cleanNamespaceForDisplay` formatting and filtering behavior.

Does not own:
- Variable resolution.
- Interpreter traversal/dispatch orchestration.

## BEHAVIOR INVARIANTS

- Array evaluation and single-node evaluation keep baseline differences in intent emission and node recording.
- Frontmatter handling sets frontmatter aliases and keeps traversal ordering for remaining nodes.
- Expression context suppresses document intent emission and node recording.
- Unknown-node handling throws `Unknown node type: <type>`.
- Field and pipeline resolution behavior stays stable across variable-reference and variable-with-tail paths.
- Interpolation security recording preserves descriptor capture and merged label recording.
- Namespace display output keeps the same structural contract for frontmatter, variables, and executable summaries.

## CHARACTERIZATION COVERAGE

Baseline drift detection lives in:

- `interpreter/core/interpreter.characterization.test.ts`

This suite guards:

- API entrypoint stability.
- Traversal and intent ordering.
- Expression-context behavior.
- Dispatch and unknown-node behavior.
- Field/pipeline resolution behavior.
- Interpolation security recording.
- Namespace display formatting contract.
