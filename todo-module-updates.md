# TODO: Module Updates For LLM Interface Changes

This repository now provides interpreter-side support for per-call MCP tool bridging and strict stream flag resolution. Module packages still need to adopt the new interface patterns.

## Required module updates

1. Update `@mlld/claude` (and any similar LLM module) to the `(prompt, config)` convention:
- `config.model`
- `config.dir`
- `config.tools` (mixed string + executable refs)
- `config.stream` (strict boolean)

2. Replace legacy tool flag assumptions with `@toolbridge(...)`:
- Call `var @tb = @toolbridge(@config.tools, @config.dir)` when tools are provided.
- Branch on:
  - `@tb.config && @tb.inBox` -> `--tools "" --mcp-config "@tb.config"`
  - `@tb.config && !@tb.inBox` -> `--mcp-config "@tb.config"`
  - `!@tb.config` -> `--allowedTools "@tb.tools"`

3. Export and use module-owned stream adapter configs:
- Export adapter object (for example `@claudeStreamFormat`).
- Wire executable with `with { stream: @config.stream, streamFormat: @claudeStreamFormat }`.

4. Simplify model helpers to avoid spread-on-undefined patterns:
- Prefer single-arity helpers like:
  - `exe llm @haiku(prompt) = @claude(@prompt, { model: "haiku" })`
  - `exe llm @sonnet(prompt) = @claude(@prompt, { model: "sonnet" })`
  - `exe llm @opus(prompt) = @claude(@prompt, { model: "opus" })`

5. Add module tests for new toolbridge/streaming paths:
- in-box VFS string tools
- out-of-box string tools (`--allowedTools`)
- function-ref tools (MCP config path)
- mixed tools + stream true/false behavior

## Open decisions to confirm in modules repo

1. Whether to keep `--tools ""` only for in-box MCP path (recommended) or broaden usage.
2. Final adapter schema set for Claude stream events across CLI versions.
3. Whether any module should expose `@toolbridge` directly or keep it internal.
