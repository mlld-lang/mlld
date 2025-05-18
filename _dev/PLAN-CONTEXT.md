# Plan Context

This document collects implementation notes discovered while reviewing the codebase. It is intended to provide missing context for the `TYPE-RESTRUCTURE.md` and `STATE-UPDATES.md` plans.

## High Level Architecture
- See `docs/dev/ARCHITECTURE.md` and `docs/dev/PIPELINE.md` for an overview of the service layout.
- The pipeline roughly flows: `ParserService` → `InterpreterService` → `StateService` → `OutputService`.
- Dependency injection is handled via `tsyringe` with services registered in `core/di-config.ts`.

## AST and Type Locations
- **New AST types** live under `core/ast/types/` (e.g., `text.ts`, `path.ts`).
- **Old syntax types** remain under `core/syntax/types/`. `StateService` and many services still import from here (e.g., `MeldNode` in `StateService.ts`).
- `core/types/` contains runtime oriented structures such as variables, paths and state utilities.
- There is a legacy file `core/types/ast-nodes.ts` which currently defines placeholder AST node types and is mostly unused.

## State Service Overview
- `services/state/StateService` manages document nodes, variables and transformation options. It exposes a large interface defined in `IStateService.ts` and stores data through `StateFactory`.
- Nodes are stored in `StateNode.nodes` and `StateNode.transformedNodes` (see `types.ts`). Currently these arrays use `MeldNode` from `@core/syntax/types`.
- `AlwaysTransformedStateService.ts` is a wrapper around `IStateService` enforcing transformation behaviour. It also imports `MeldNode`.

## Parser Notes
- The parser (`core/ast/parser.ts`) still returns arrays of `MeldNode` from `core/syntax/types` and performs validation accordingly.
- Fixtures under `core/ast/fixtures/` include `nodeId` fields but the types in `core/ast/types/` do not yet declare a `nodeId` property.

## Implementation Gaps
- There is no exported union type containing all new AST node interfaces. Creating an `ASTNode` union inside `core/ast/types` would simplify the state service updates.
- The runtime variable types in `core/types/variables.ts` are separate from AST node definitions; the restructure plan intends to merge these into a unified type hierarchy.

