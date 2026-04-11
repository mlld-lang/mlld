---
updated: 2026-04-10
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
- Inline coercion `@value as record @schema` is highlighted explicitly as a terminal postfix expression: `ExpressionVisitor` emits `as` and `record` keyword tokens, while the child value/schema nodes keep their normal semantic tokens.
- Record display maps and plain policy objects that use `role:*` keys are treated as a single property token in both semantic tokens and regex grammars.
- `@cast(...)`, `.mx.handle`, and `.mx.handles` must stay covered by both semantic-token tests and regex-highlighting tests whenever record/handle syntax changes.
- `policy.authorizations.authorizable`, `role:planner` object keys, and `<authorization_notes>`-related syntax examples must stay covered when authorization docs or policy grammar change.
- Embedded tree-sitter WASM parsing is enabled for JavaScript, Python, and Bash code blocks.
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
- For embedded code blocks, `services/lsp/embedded/EmbeddedLanguageService.ts` loads WASM parsers for `javascript`, `python`, and `bash` (alias support: `js/node`, `py/python3`, `sh/shell/zsh`).

Current `TOKEN_TYPE_MAP` highlights to keep accurate:

- `directiveDefinition -> modifier`
- `directiveAction -> property`
- `cmdLanguage -> function`
- `embedded -> property`
- `alligator`, `alligatorOpen`, `alligatorClose` -> `interface`
- `section -> namespace`

Current directive keyword grouping in `DirectiveVisitor`:

- `directiveDefinition`: `var`, `exe`, `guard`, `hook`, `policy`, `checkpoint`, `record`
- `directiveAction`: `run`, `show`, `output`, `append`, `log`, `stream`, `sign`, `verify`

Record field keys such as `facts`, `data`, `display`, nested `mask` entries, named display selectors like `role:planner`, and plain policy-object keys such as `authorizable` are highlighted through the ordinary object-key/property token path. Keep semantic-token tests aligned with both the record grammar and the plain-object grammar whenever those keys or projection forms change.
Inline coercion keywords are split across two systems and both must stay aligned:

- LSP semantic tokens: `services/lsp/ASTSemanticVisitor.ts` + `services/lsp/visitors/ExpressionVisitor.ts`
- Regex-based syntax grammars: `grammar/syntax-generator/build-syntax.js` and the generated files under `editors/`

When syntax changes hit either side, the required verification is both semantic-token coverage and regex/highlighter coverage:

- `services/lsp/semantic-tokens-unit.test.ts`
- `services/lsp/semantic-tokens.test.ts`
- `services/lsp/highlighting-rules.test.ts`
- `grammar/syntax-generator/build-syntax.test.ts`
- `npm run test:tokens`
- `npm run validate:tokens`

Authorization-permissions changes are not done until both sides cover:

- `authorizable` as a property token
- unquoted `role:*` plain-object keys such as `role:planner`
- `@cast(...)`, `.mx.handle`, and `.mx.handles` when those features are touched in the same grammar window

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

- `npm run build:wasm`
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
