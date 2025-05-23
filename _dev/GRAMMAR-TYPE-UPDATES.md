## 2. Remove alias support from import references

The grammar currently creates `VariableReference` nodes with an `alias` property for import directives. However, the `VariableReferenceNode` type does not define this property and the project no longer plans to support import aliases.

**Potential change:** Drop the alias handling from `grammar/directives/import.peggy` and update related tests and documentation. Remove the alias examples from `grammar/docs/import.md` once the grammar no longer emits this field.

## 3. Text directive content should support nested directives

Text directives produce `content` as an array of nodes, but the type definition allows either a `ContentNodeArray` or a nested `DirectiveNode`. If a nested directive is used (e.g. `@text value = @add "file"`), the grammar should return the full `DirectiveNode` rather than flattening it into nodes.

**Potential change:** Review the rules in `grammar/directives/text.peggy` and the helper functions that build text directive nodes. Ensure that when a directive is parsed as the content, the resulting AST includes that directive object and sets `source: 'directive'` in metadata.

## 13. headerLevel value type mismatch

`Add` directive variants output `headerLevel` as an array containing a single `Number` node with `value` and `raw`. The `AddValues` interfaces in `core/ast/types/add.ts` currently define this property as a plain `number`.

**Potential change:** Decide on a consistent representation. Either change the grammar to return a plain numeric level or update the type definitions to use a `NumberNodeArray`. Documentation such as `grammar/docs/addTemplate.md` already shows a `NumberNode`, so aligning the types with the grammar may be preferable.

## 14. Align Run and Exec directive metadata

`RunCommand` and `Exec` directives output metadata flags like `hasVariables`, and exec directives also inherit `language` and `isMultiLine` from the run code implementation. The existing `RunMeta` and `ExecMeta` interfaces omit some of these fields.

**Potential change:** Extend `RunMeta` and `ExecMeta` (in `core/ast/types/run.ts` and `core/ast/types/exec.ts`) to include `hasVariables`, `language`, and `isMultiLine`, and remove the unused `isBracketed` field. Ensure the grammar still sets these flags in `run.peggy` and `exec.peggy`.

## COMPLETED

- Add `source` to directive nodes with a `DirectiveSource` union.
- Added `language` property to `RunCodeDirectiveNode` meta.
- Updated run directive argument types to `VariableNodeArray`.
- Extended `SourceLocation` with an optional `source` field.
- Updated import value arrays to use `ImportReferenceNode | ImportWildcardNode`.
- Ensured `nodeId` exists on all nodes via `MeldNode`.
- Expanded `PathMeta` and renamed directive-specific meta to `PathDirectiveMeta`.
- Extended `TextMeta` with source and directive details.
- Added `hasVariables` and `wrapperType` to `AddTemplateMeta`.
- Enhanced run and exec metadata with language and variable flags.
