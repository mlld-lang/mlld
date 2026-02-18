---
updated: 2026-02-18
tags: #arch, #lsp, #tooling
related-docs: docs/dev/GRAMMAR.md
related-code: cli/commands/language-server.ts, cli/commands/language-server-impl.ts, cli/execution/CommandDispatcher.ts, services/lsp/ASTSemanticVisitor.ts, services/lsp/visitors/*.ts, services/lsp/utils/*.ts, tests/utils/token-validator/*.ts, services/lsp/*.test.ts
related-types: cli/commands/language-server { MlldLanguageServerConfig, DocumentState }
---

# LANGUAGE-SERVER

## tldr

- Start the server with `mlld language-server` (alias: `mlld lsp`).
- `vscode-languageserver` is a runtime dependency (`package.json` `dependencies`), not a dev-only dependency.
- Semantic highlighting is AST-driven via `ASTSemanticVisitor` + specialized visitors.
- Semantic token validation is also AST-driven and now documented here as canonical architecture.

## Principles

- Keep semantic tokens AST-first and context-aware.
- Keep token types mapped to current `TOKEN_TYPE_MAP` only.
- Keep validator output actionable: expectation -> emission -> match -> report.
- Keep docs aligned with real scripts and real test paths.

## Details

### Startup and Packaging

- Command entrypoint: `cli/commands/language-server.ts`.
- Command routing: `cli/execution/CommandDispatcher.ts` maps both `language-server` and `lsp`.
- Runtime implementation: `cli/commands/language-server-impl.ts`.
- Dependency category: `vscode-languageserver` is in `dependencies` in `package.json`.
- If manually installing outside normal project install flow, use `npm install vscode-languageserver`.

### Semantic Token Pipeline

- Parse document into AST.
- Traverse AST using `services/lsp/ASTSemanticVisitor.ts`.
- Emit tokens through `services/lsp/utils/TokenBuilder.ts`.
- Map visitor token names to LSP standard token types via `TOKEN_TYPE_MAP` in `cli/commands/language-server-impl.ts`.

Current `TOKEN_TYPE_MAP` highlights to keep accurate:

- `directiveDefinition -> modifier`
- `directiveAction -> property`
- `cmdLanguage -> function`
- `embedded -> property`
- `alligator`, `alligatorOpen`, `alligatorClose` -> `interface`
- `section -> namespace`

Pass-through entries currently include:

- `function`, `label`, `typeParameter`, `interface`, `namespace`, `modifier`, `enum`

### Visitor Dispatch (Current)

`ASTSemanticVisitor` registers these core visitors:

- `DirectiveVisitor`
- `VariableVisitor`
- `FileReferenceVisitor`
- `ForeachVisitor`
- `ExpressionVisitor`
- `CommandVisitor`
- `TemplateVisitor`
- `LiteralVisitor`
- `StructureVisitor`
- `ConditionalVisitor`
- `LabelVisitor`

### Helper Wiring (Current)

Active helper usage in visitor flow:

- `OperatorTokenHelper` (Directive/Variable/Command/Expression/Structure/Foreach/Label visitors)
- `CommentTokenHelper` (Directive and FileReference visitors)
- `LanguageBlockHelper` (Directive visitor)
- `EffectTokenHelper` (Directive and FileReference visitors)

`TemplateTokenHelper` exists in `services/lsp/utils/TemplateTokenHelper.ts` but is not currently wired into active visitor flow.

### Semantic Token Validator

Canonical validator architecture:

- Expectations: `tests/utils/token-validator/NodeExpectationBuilder.ts` + `NodeTokenMap.ts`
- Token emission: `ASTSemanticVisitor` + `TokenBuilder`
- Matching: `tests/utils/token-validator/TokenMatcher.ts`
- Reporting: `tests/utils/token-validator/CoverageReporter.ts`

Flow:

`AST -> expectations -> emitted tokens -> matcher -> coverage gaps -> reporter`

### Commands (Current)

Use only existing commands/scripts:

- `npm run validate:tokens`
- `npm run dump:tokens <file> -- --diagnostics`
- `npm run test:nvim-lsp <file>`

Do not document `node scripts/validate-token-mappings.mjs` (that script is not present).

### Test Targets (Current)

Language server command tests:

- `cli/commands/language-server-debounce.test.ts`
- `cli/commands/language-server-templates.test.ts`

Semantic highlighting/token tests:

- `services/lsp/semantic-tokens.test.ts`
- `services/lsp/semantic-tokens-unit.test.ts`
- `services/lsp/highlighting-rules.test.ts`

## Gotchas

- Avoid stale token map examples; always match `cli/commands/language-server-impl.ts`.
- Avoid stale test paths; keep only existing files.
- Keep dependency guidance accurate: no `--save-dev` recommendation for `vscode-languageserver`.
