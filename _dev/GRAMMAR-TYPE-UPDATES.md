2. "The grammar creates variablereference nodes with an alias property, but the VariableReferenceNode type doesn't include this property." <-- we actually should remove the `alias` import feature in the grammar as we don't intend to use it.

3. "The grammar produces text directives with content as node arrays (e.g., line 42-60), but the types expect content to be either ContentNodeArray | DirectiveNode. The grammar seems to be missing the ability to produce DirectiveNode instances for nested directives." <-- this is a problem if so; we'll need to investigate it. It's possible we're just handling this differently than what the older types expect?

9. "The grammar produces text directives with content as array of nodes, but doesn't properly create nested DirectiveNode instances when text content is a directive (e.g., @text foo = @run [command])." <-- related to #3; we need to investigate.
13. The grammar outputs `headerLevel` as an array of Number nodes with `value` and `raw`, but the AddValues interfaces use a plain `number`.
14. RunCommand and Exec directive metadata include a `hasVariables` flag (and Exec directives also inherit `language`, `isMultiLine`, and `isBracketed` from RunCode), none of which exist in RunMeta or ExecMeta. (remove isBracketed, add the others)

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
