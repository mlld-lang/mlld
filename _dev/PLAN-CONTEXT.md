# Plan Context

This file summarizes the structure of the current code relevant to the `TYPE-RESTRUCTURE.md` and `STATE-UPDATES.md` plans.  The information here should help codex locate the files referenced in those plans and understand how the existing types and services are arranged.

## AST Type Locations

- **`core/ast/types/`** – New grammar based node definitions.  Files include:
  - `base.ts`, `text.ts`, `import.ts`, `add.ts`, `exec.ts`, `path.ts`, `data.ts`, `variables.ts`, `values.ts`, `guards.ts`, `raw.ts`, `meta.ts`, and `index.ts`.
  - Many of these import foundational interfaces from `core/syntax/types/nodes`.
- **`core/syntax/types/`** – Legacy node and helper types such as `MeldNode`, `DirectiveNode`, `TextNode`, etc.  These remain heavily referenced across services (e.g., ParserService and StateService) but are slated for removal.
- **`core/types/` and `core/types-old/`** – Runtime types.  `core/types/` contains the newer versions used by services.  `core/types-old` contains previous definitions kept temporarily for compatibility.

At present most services still import from `@core/syntax/types`.  A repo‑wide search reveals roughly 330 such imports.

## Key Services Referencing AST Types

- **ParserService** – `services/pipeline/ParserService/ParserService.ts`
  - Imports `MeldNode`, `DirectiveNode`, `TextNode`, etc. from `@core/syntax/types`.
  - Calls `parse` from `core/ast/parser.ts` which also relies on these types.
- **StateService** – `services/state/StateService/StateService.ts`
  - Uses `MeldNode` and `TextNode` for document node storage and creation (`appendContent`).
  - Interface defined in `services/state/StateService/IStateService.ts` and `services/state/StateService/types.ts` also depend on these legacy types.
- **InterpreterService** and various directive handlers also consume the legacy types.

## Current AST Parsing Flow

1. `core/ast/parser.ts` wraps the Peggy grammar parser and outputs an array of legacy `MeldNode` objects.
2. `ParserService` exposes this functionality, returning the same legacy types.
3. `InterpreterService` switches over `node.type` to call directive handlers.
4. `StateService` stores nodes generically without needing knowledge of specific subtypes.

## Planned Direction

Both `TYPE-RESTRUCTURE.md` and `STATE-UPDATES.md` propose moving to discriminated unions defined from the new files in `core/ast/types`.  The goal is to expose a unified `ASTNode` union covering every interface in that directory so that all services can import from `@core/ast/types` and eventually remove the old `core/syntax/types` package.