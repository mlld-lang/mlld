---
description: Generate a starter mlld orchestrator for your use case
---

**IMMEDIATELY AFTER READING THIS DOCUMENT, YOU MUST RUN `mlld howto intro` before writing any mlld code.** The intro covers syntax, gotchas, built-in methods, file loading, and common traps. Skipping it leads to inventing non-existent features and writing code that validates but fails at runtime.

```bash
mlld howto intro              # Language fundamentals — read this first
```

It is *strongly* encouraged to view at least one of the examples in `plugins/mlld/examples/` before scaffolding — `audit/`, `research/`, and `development/` each demonstrate a complete archetype.

Generate a new mlld orchestrator by asking the user four questions, then creating a complete working scaffold.

## Questions to Ask

1. **Archetype**: Which pattern?
   - **audit** — Parallel fan-out over items with invalidation. Best for: file review, data extraction, batch classification.
   - **research** — Multi-phase pipeline with decision agent and invalidation. Best for: document analysis, research synthesis, multi-step processing.
   - **development** — Decision loop with GitHub Issues and adversarial verification. Best for: project automation, feature development, open-ended tasks.

2. **Domain**: What does this orchestrator do? (e.g., "review pull requests for security issues", "analyze customer feedback", "automate documentation updates")

3. **Inputs**: What data does it process? (e.g., "TypeScript files in src/", "PDF documents in docs/", "GitHub issues with label:bug")

4. **Outputs**: What does it produce? (e.g., "JSON report of findings", "summary document", "GitHub issues with implementation")

## Generation

After gathering answers, generate the canonical file layout based on the chosen archetype. Use the examples in this plugin as reference:

- `examples/audit/` for the audit archetype
- `examples/research/` for the research archetype
- `examples/development/` for the development archetype

### What to generate

1. **`index.mld`** — Main orchestrator adapted to the user's domain
   - Argument parsing for their inputs
   - Appropriate loop structure for the archetype
   - Worker dispatch with domain-specific prompt templates

2. **`lib/context.mld`** — State management
   - `@logEvent`, `@loadRecentEvents`, `@loadRunState`, `@saveRunState`
   - Domain-specific context builders

3. **Decision prompt** (research and development only)
   - `prompts/decision/core.att` with actions appropriate to the domain
   - Phase guidance tailored to their workflow

4. **Worker prompts** — One `.att` file per worker type, including:
   - An invalidation worker (required for all archetypes)
   - Domain-specific workers based on inputs/outputs

5. **JSON schemas** — For decision output and worker results

6. **Shared prompt fragments** — Evidence rules, output format

### Prerequisites

Before the generated orchestrator can run, ensure:

```bash
mlld init                          # If not already initialized
mlld install @mlld/claude-poll     # Required for all orchestrators
```

### Guidelines

- Fill prompts with domain-specific content, not generic placeholders
- Set parallelism defaults appropriate to the domain (20 for file processing, 10 for API-heavy work)
- Use sonnet for routine work, opus for judgment calls
- Include idempotency checks in all parallel loops
- Include file-based output protocol in all LLM calls
- Validate generated `.mld` files with `mlld validate`
