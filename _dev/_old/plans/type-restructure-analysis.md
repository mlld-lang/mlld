# Type Restructure Step 1 Analysis

## Mapping of AST types to runtime equivalents

The following table lists the AST node interfaces defined in `core/ast/types` and the current runtime type that corresponds to each. In many cases the runtime equivalent still lives under `core/syntax/types`.

| AST node file | AST interfaces | Runtime equivalent(s) |
| --- | --- | --- |
| add.ts | AddDirectiveNode and related Raw/Meta/Values types | No runtime equivalent yet. Logic handled directly in directive handlers |
| base.ts | DirectiveNode, TypedDirectiveNode | runtime: DirectiveNode in `core/types/ast-nodes.ts` |
| data.ts | DataDirectiveNode, DataAssignmentDirectiveNode, DataObjectValue, etc. | none (runtime uses generic structures in services) |
| exec.ts | ExecDirectiveNode, ExecCommandDirectiveNode, ExecCodeDirectiveNode | minimal runtime usage via `embed`/`define` types |
| import.ts | ImportDirectiveNode and subtypes | older runtime equivalents in `core/syntax/types/legacy` |
| meta.ts | DirectiveMeta, PathMeta, etc. | scattered runtime interfaces in `core/types` |
| path.ts | PathDirectiveNode and subtype | Path related runtime types in `core/types/paths.ts` |
| raw.ts | ImportRaw, TextRaw, etc. | No runtime equivalent (parser only) |
| run.ts | RunDirectiveNode and subtypes | run directive structures in `core/types/embed.ts` |
| text.ts | TextDirectiveNode, TextAssignmentDirectiveNode, TextTemplateDirectiveNode | Text variable interfaces in `core/types/variables.ts` |
| values.ts | PathNodeArray, ContentNodeArray, etc. | Some appear in `core/types/embed.ts` or `core/types/paths.ts` |
| variables.ts | Field, VariableReferenceNode | runtime variable interfaces in `core/types/variables.ts` |

## Overlapping fields

Many node interfaces share these common properties:
- `type: string`
- `nodeId: string`
- optional `location: SourceLocation`
- directive nodes share `kind`, `subtype`, `values`, `raw`, `meta`

These correspond to the proposed `BaseMeldNode` interface.

## Transformation patterns

Currently the parser outputs legacy `core/syntax/types` nodes. These are almost identical to the new AST types but with slight naming differences. During parsing we can simply cast each parsed object to the corresponding interface in `core/ast/types` and assemble the union `MeldNode[]`.

Runtime services mostly rely on generic fields (`type`, `nodeId`, `kind`, `subtype`) and rarely access directive-specific structures. We can therefore unify the types by extending the AST interfaces with optional runtime fields (metadata, resolvedValue, etc.).

## Unified type specification draft

```typescript
interface BaseMeldNode {
  type: string;
  nodeId: string;
  location?: SourceLocation;
}

interface ProcessedNode extends BaseMeldNode {
  raw?: string;
  metadata?: Record<string, unknown>;
  resolvedValue?: unknown;
}
```

All node interfaces in `core/ast/types` will extend `BaseMeldNode`. Runtime services will use the discriminated union `MeldNode` that re-exports every interface from that directory.

## Import patterns

`PLAN-CONTEXT.md` shows ~330 imports from `@core/syntax/types`. Services like `ParserService`, `InterpreterService`, and `StateService` rely on these paths. During restructuring these imports will be updated to `@core/ast/types` and `@core/types`.
