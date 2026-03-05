# TODO: Module Updates For LLM Interface Changes

This repository now provides interpreter-side support for per-call MCP tool bridging and strict stream flag resolution. Module packages still need to adopt the new interface patterns.

## Done

1. **`(prompt, config)` convention** — `modules/claude/index.mld` implements `@claude(prompt, config)` with config.model, config.dir, config.tools, config.stream, config.system.

2. **`@toolbridge` integration** — `@claude` calls `@toolbridge(@cfg.tools, @cfg.dir)` when tools are present. Branches on `@tb.config && @tb.inBox`, `@tb.config`, and fallback `--allowedTools`.

3. **Module-owned stream adapter** — `@claudeStreamFormat` exported with full NDJSON schemas (message, thinking, tool-use, tool-result, error, metadata). Wired via `with { stream: @cfg.stream, streamFormat: @claudeStreamFormat }`.

4. **Single-arity model helpers** — `@haiku(prompt)`, `@sonnet(prompt)`, `@opus(prompt)` delegate to `@claude` with fixed model.

5. **`@claudeWithSystem` folded into `config.system`** — `--append-system-prompt` flag added when `@cfg.system` is set. No separate export.

6. **Poll exes merged** — `@claudePoll`, `@claudePollJsonl`, `@claudePollEvent` use `(prompt, config)` convention. Same config shape as `@claude` plus poll-specific fields (config.poll, config.pattern, config.event, config.itemId, config.timeout). Internal `@pollFileImpl`/`@pollJsonlImpl`/`@pollEventImpl` sh helpers handle background exec + polling.

7. **Directory-based module** — `modules/claude/` with `module.yml`, `index.mld`, `README.md`. Version 3.0.0.

## Remaining

5. Add module tests for new toolbridge/streaming paths:
- in-box VFS string tools
- out-of-box string tools (`--allowedTools`)
- function-ref tools (MCP config path)
- mixed tools + stream true/false behavior

8. Registry publishing — publish `@mlld/claude@3.0.0` from `modules/claude/`. Decide deprecation for `@mlld/claude-poll`.

## Resolved decisions

1. `--tools ""` only for in-box MCP path — yes, only when `@tb.inBox` is true.
2. Adapter schemas — 6 event types matching Claude Code CLI output format.
3. `@toolbridge` stays internal — not exposed by the module.
4. Poll config shape — flat keys (config.poll, config.timeout, config.pattern, config.event, config.itemId).
5. `@mlld/claude-poll` deprecation — deferred. Old module stays published; new module is a separate package path (`modules/claude/`).
