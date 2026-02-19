---
updated: 2026-02-18
tags: #arch, #system, #interpreter
related-docs: docs/dev/INTERPRETER.md, docs/dev/GRAMMAR.md, docs/dev/AST.md, docs/dev/TYPES.md, docs/dev/MODULES.md, docs/dev/RESOLVERS.md, docs/dev/REGISTRY.md, docs/dev/PIPELINE.md, docs/dev/DATA.md, docs/dev/SECURITY.md, docs/dev/OUTPUT.md, docs/dev/STREAMING.md, docs/dev/SDK.md, docs/dev/MCP.md, docs/dev/LANGUAGE-SERVER.md, docs/dev/TESTS.md
related-code: bin/mlld.ts, cli/commands/*.ts, sdk/*.ts, grammar/*.peggy, grammar/parser/index.ts, core/types/*.ts, interpreter/index.ts, interpreter/core/interpreter.ts, interpreter/env/Environment.ts, interpreter/eval/*.ts, interpreter/eval/import/*.ts, interpreter/eval/pipeline/*.ts, interpreter/output/*.ts, interpreter/streaming/*.ts, core/resolvers/*.ts, core/policy/*.ts, services/lsp/*.ts
related-types: core/types { MlldNode, DirectiveNode, ExecInvocation, PipelineInput }, core/types/security { SecurityDescriptor }, core/types/structured-value { StructuredValue }
---

# ARCHITECTURE

## tldr

- This doc is the top-level architecture map for mlld.
- It defines layer boundaries and links to deep-dive docs that own implementation detail.
- Runtime flow is single-pass: parse AST, evaluate in `Environment`, emit effects, format output.
- CLI, SDK, MCP, and LSP reuse shared core components rather than separate execution stacks.
- Security and policy checks are part of the runtime path, not optional wrappers.
- Hooks/checkpoint/resume work is in progress; protocol decisions are locked in `docs/dev/HOOKS-CHECKPOINT-RESUME-CONTRACT.md` before grammar/runtime rollout phases.

## Principles

- Keep this document as navigation, not an implementation dump.
- One layer should have one clear responsibility boundary.
- Point to the owning deep-dive doc instead of duplicating details.
- Treat code paths as source of truth when docs conflict.
- Prefer end-to-end flow clarity over exhaustive per-feature coverage.

## Details

### System Layers

| Layer | Owns | Primary code | Deep dives |
|---|---|---|---|
| 1. Entry surfaces | Invocation and integration boundaries (CLI, SDK, MCP, LSP) | `bin/mlld.ts`, `cli/commands/*.ts`, `sdk/index.ts`, `sdk/execute.ts`, `cli/commands/mcp.ts`, `services/lsp/*.ts` | [SDK.md](SDK.md), [MCP.md](MCP.md), [LANGUAGE-SERVER.md](LANGUAGE-SERVER.md) |
| 2. Parse and type model | Grammar, AST shape, and typed runtime contracts | `grammar/*.peggy`, `grammar/parser/index.ts`, `core/types/*.ts` | [GRAMMAR.md](GRAMMAR.md), [AST.md](AST.md), [TYPES.md](TYPES.md) |
| 3. Interpreter core | Single-pass AST traversal and evaluation orchestration | `interpreter/index.ts`, `interpreter/core/interpreter.ts`, `interpreter/core/interpreter/evaluator.ts`, `interpreter/env/Environment.ts` | [INTERPRETER.md](INTERPRETER.md) |
| 4. Directive execution | Directive semantics (`/var`, `/run`, `/exe`, `/when`, `/for`, `/output`, `/show`) and exec invocation | `interpreter/eval/*.ts`, `interpreter/eval/exec/*.ts` | [INTERPRETER.md](INTERPRETER.md), [VAR-EVALUATION.md](VAR-EVALUATION.md), [ITERATORS.md](ITERATORS.md), [WHEN.md](WHEN.md) |
| 5. Data and pipelines | Structured values, pipeline execution, retries, transformers, stream bus | `interpreter/utils/structured-value.ts`, `interpreter/eval/pipeline/*.ts`, `interpreter/builtin/transformers.ts`, `interpreter/eval/pipeline/stream-bus.ts` | [DATA.md](DATA.md), [PIPELINE.md](PIPELINE.md), [STREAMING.md](STREAMING.md) |
| 6. Modules and resolution | Imports, resolver dispatch, registry and lock behavior | `interpreter/eval/import/*.ts`, `core/resolvers/*.ts`, `core/registry/*.ts` | [MODULES.md](MODULES.md), [RESOLVERS.md](RESOLVERS.md), [REGISTRY.md](REGISTRY.md), [IMPORTS.md](IMPORTS.md), [SDK.md](SDK.md) |
| 7. Security and policy | Label flow, policy enforcement, guard hooks, credential flow | `core/policy/*.ts`, `interpreter/policy/PolicyEnforcer.ts`, `interpreter/hooks/*.ts` | [SECURITY.md](SECURITY.md), [HOOKS.md](HOOKS.md), [ESCAPING.md](ESCAPING.md) |
| 8. Effects and output | Effect routing, document rendering, normalization, CLI-facing output | `interpreter/output/*.ts`, `interpreter/eval/output.ts`, `interpreter/eval/show.ts` | [OUTPUT.md](OUTPUT.md) (intent/effect/normalization), [STREAMING.md](STREAMING.md) (StreamBus/sinks/adapters/SDK stream events) |

### Runtime Flow

1. An entry surface receives input and options (`CLI`, `SDK`, or `MCP`).
2. Parser builds an AST from grammar rules and typed nodes.
3. Interpreter evaluates AST nodes in a live `Environment`.
4. Directive evaluators execute commands, expressions, imports, loops, and pipelines.
5. Policy and hook layers enforce security decisions before and after operations.
6. Resolver/import layers load modules or content and bind results into environment scope.
7. Pipeline and streaming components process stage outputs and emit stream events when enabled.
8. Effect/output components assemble final document or structured result.

### Boundary Rules

- Grammar and AST layers define syntax and node shape; they do not execute runtime behavior.
- Interpreter/eval layers execute behavior; they do not define syntax tokens.
- Resolver/import layers resolve and bind external content; they do not format output.
- Policy/hook layers gate operations; they do not replace directive semantics.
- Output layers render already-evaluated effects; they do not re-run evaluation.
- Output boundary: `OUTPUT.md` owns intent/effect/document assembly + normalization; `STREAMING.md` owns stream transport/runtime event flow.
- Checkpoint persistence contract uses manifest `version` plus atomic temp-file + rename writes; unknown fields are tolerated and unknown future versions degrade to cold-cache behavior (see `docs/dev/HOOKS-CHECKPOINT-RISK-GATES.md`).

### Deep-Dive Index

- Language core: [GRAMMAR.md](GRAMMAR.md), [AST.md](AST.md), [TYPES.md](TYPES.md)
- Runtime core: [INTERPRETER.md](INTERPRETER.md), [VAR-EVALUATION.md](VAR-EVALUATION.md), [ITERATORS.md](ITERATORS.md), [WHEN.md](WHEN.md)
- Data and execution: [DATA.md](DATA.md), [PIPELINE.md](PIPELINE.md), [STREAMING.md](STREAMING.md), [OUTPUT.md](OUTPUT.md)
- Imports and modules: [MODULES.md](MODULES.md), [RESOLVERS.md](RESOLVERS.md), [REGISTRY.md](REGISTRY.md), [IMPORTS.md](IMPORTS.md), [SDK.md](SDK.md)
- Security model: [SECURITY.md](SECURITY.md), [HOOKS.md](HOOKS.md), [ESCAPING.md](ESCAPING.md)
- Hooks/checkpoint risk gates: [HOOKS-CHECKPOINT-RESUME-CONTRACT.md](HOOKS-CHECKPOINT-RESUME-CONTRACT.md), [HOOKS-CHECKPOINT-RISK-GATES.md](HOOKS-CHECKPOINT-RISK-GATES.md)
- Integration surfaces: [SDK.md](SDK.md), [MCP.md](MCP.md), [LANGUAGE-SERVER.md](LANGUAGE-SERVER.md)
- Validation and testing: [TESTS.md](TESTS.md), [BUILD-TEST.md](BUILD-TEST.md)

## Gotchas

- Do not copy deep implementation detail into this file; link to the owning deep-dive doc.
- Keep terminology aligned with current code paths (`interpreter/eval/import/*`, not older directive-path layouts).
- Update this map when boundaries move, not when isolated implementation details change.

## Debugging

- For runtime regressions, start at [INTERPRETER.md](INTERPRETER.md) and then branch to [PIPELINE.md](PIPELINE.md), [MODULES.md](MODULES.md), or [SECURITY.md](SECURITY.md) based on failing layer.
- For syntax/parse regressions, start at [GRAMMAR.md](GRAMMAR.md) and [AST.md](AST.md).
- For surface-specific behavior, start at [SDK.md](SDK.md), [MCP.md](MCP.md), or [LANGUAGE-SERVER.md](LANGUAGE-SERVER.md).
