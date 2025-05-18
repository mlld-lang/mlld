# Base Node Interfaces and Field Mapping

The existing definitions span both `core/syntax/types` (legacy) and
`core/ast/types` (new). To avoid gaps in the unified type system the following
interfaces should be considered the minimal base set.

## Legacy Base Types (`core/syntax/types/nodes.ts`)
- `SourceLocation` – `{ start: { line, column }, end: { line, column } }`
- `MeldNode` (old) – `{ type: NodeType; location?: SourceLocation; nodeId: string }` - will become `BaseMeldNode`
- `DirectiveNode` – `MeldNode` plus `kind`, `subtype`, `source?`, `values`, `raw`, `meta`
- `TextNode` – `MeldNode` plus `content` and optional `formattingMetadata`
<<<<<<< ours
=======
  (plain text between directives or inside interpolatable values; distinct from `@text` directive variables)
  Renaming this interface to `ContentNode` would require updating the grammar output and all service imports.
  
>>>>>>> theirs
- `LiteralNode` – `MeldNode` plus `value`, optional `valueType`
- `DotSeparatorNode` – `MeldNode` with fixed `value: '.'`
- `PathSeparatorNode` – `MeldNode` with fixed `value: '/'`
- `CodeFenceNode` – `MeldNode` plus `language?` and `content`
- `CommentNode` – `MeldNode` plus `content`
- `ErrorNode` – `MeldNode` plus `error`, optional `debugDetails`, `partialNode`
- `VariableReferenceNode` – `MeldNode` plus `identifier`, `valueType`, `isVariableReference`
- `StructuredPath` – `{ raw: string; values: (TextNode | VariableReferenceNode | LiteralNode | DotSeparatorNode | PathSeparatorNode)[]; ...flags }`

## New Directive Types (`core/ast/types/*`)
Each directive file (`import.ts`, `text.ts`, `add.ts`, `exec.ts`, `path.ts`,
`data.ts`, `run.ts`) defines:
- `...Raw` interfaces – parallel string values from the source
- `...Values` interfaces – arrays of `TextNode`, `VariableReferenceNode` and related nodes
- `...Meta` interfaces – directive specific metadata
- `...DirectiveNode` – extends `TypedDirectiveNode` (which extends `DirectiveNode`)

`TypedDirectiveNode<K, S>` in `core/ast/types/base.ts` narrows the `kind` and
`subtype` fields while inheriting all fields from `DirectiveNode`.

## Mapping Considerations
- Every `...DirectiveNode` ultimately includes all fields from `DirectiveNode` and
adds typed `values`, `raw` and `meta` based on its subtype.
- Plain text and basic nodes (`TextNode`, `CodeFenceNode`, etc.) remain as defined
in `core/syntax/types/nodes.ts` until they are migrated.
- When creating the unified `MeldNode` union ensure all base fields
(`type`, `nodeId`, optional `location`) are present on every interface through the `BaseMeldNode` interface.
- Directive-specific raw/value/meta structures map directly from the parser
output; no runtime‑only fields should be introduced at this stage.

This list should be used to verify that every interface in the new union either
maps to one of these base shapes or extends them without omitting required
fields.
