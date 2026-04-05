# SDK Parity Status And Documentation Punchlist

This document is grounded in the current code, not the original gap-analysis assumptions.

It has two jobs:

1. Track the remaining implementation work.
2. Give documentation owners a concrete punchlist of what still needs to be updated.

## Current Implementation Snapshot

### Completed phases

- **Phase 0 complete**: `Guard.trigger` rename, result-envelope normalization, `StateWrite.security` / `Effect.security` parity, and shared fixture coverage landed.
- **Phase 1 complete**: MCP server injection, `labeled` / `trusted` / `untrusted` helpers, and Go's recommended package-level convenience surface landed.
- **Phase 2 complete**: Go, Rust, Ruby, and Elixir implement the spec-style buffered handle state machine with `next_event`; JS/TS exposes equivalent live control through `StreamExecution`; all SDKs now support live `write_file` on the appropriate handle surface.
- **Phase 3 complete**: all SDKs now expose `fs_status`, `sign`, `verify`, and `sign_content`.

### Remaining implementation work

- **Phase 4 remains open**:
  - The READMEs and root SDK docs still lag the implementation and need a coordinated update.

## Feature Status

`◐` means partial. `—` means not applicable in the same form.

| Feature | JS/TS | Python | Go | Rust | Ruby | Elixir |
|---------|:-----:|:------:|:--:|:----:|:----:|:------:|
| process / execute / analyze | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| process_async / execute_async | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Handle: cancel / update_state / wait | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Handle: next_event / live event consumption | ◐¹ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Handle: write_file | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payload labels | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Labeled state updates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MCP server injection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| fs_status | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| sign / verify | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| sign_content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| labeled / trusted / untrusted helpers | —² | ✅ | ✅ | ✅ | ✅ | ✅ |
| Module-level convenience fns (recommended) | ✅ | ✅ | ✅ | ◐³ | ✅ | ✅ |
| Handle state machine semantics | ◐¹ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Result envelope (where transport applies) | runtime ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Guard.trigger field name | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Security field parity (`StateWrite` / `Effect`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shared fixture coverage | ◐⁴ | ✅ | ✅ | ✅ | ✅ | ✅ |

¹ JS/TS uses `StreamExecution` async event iteration instead of a synchronous `next_event` method, but now matches the same live-control semantics.
² JS/TS works in-process and can apply labels directly to structured values, so the wrapper-style helper API is not needed there.
³ Rust exposes default-client helpers for blocking operations and signing/status APIs, but not the full async convenience surface.
⁴ JS/TS covers the same transport/runtime behavior via live server and runtime tests rather than the wrapper fixture harness used by transport SDKs.

## Remaining Code Work

No cross-language SDK implementation gaps remain against the current spec. The remaining work is documentation alignment.

## Documentation Punchlist: Phase 4

Claude should treat this section as the source of truth for the docs sweep.

### Root docs

- [x] `sdk/README.md` — Updated: full API surface, label helpers, filesystem integrity, event streaming, MCP injection.

### Go docs

- [x] `sdk/go/README.md` — Updated: `NextEvent`, `WriteFile`, `FSStatus`/`Sign`/`Verify`/`SignContent`, `PayloadLabels`, `McpServers`, label helpers, convenience functions.

### Rust docs

- [x] `sdk/rust/README.md` — Updated: `next_event`, `write_file`, filesystem ops, `mcp_servers`, `payload_labels`, label helpers, convenience functions.

### Ruby docs

- [x] `sdk/ruby/README.md` — Updated: `next_event`, `write_file`, filesystem ops, `mcp_servers`, `payload_labels`, label helpers, convenience functions.

### Python docs

- [x] `sdk/python/README.md` — Updated: `payload_labels` in signatures, `update_state` labels param, label helpers section, effects/metrics notes, HandleEvent types.

### Elixir docs

- [x] `sdk/elixir/README.md` — Updated: status section, `fs_status`/`sign`/`verify`/`sign_content`, `next_event`/`write_file` on Handle, `:payload_labels`/`:mcp_servers`/`:labels`, label helpers, `StateWrite.security`, parity section references spec.

### Release/process docs

- [x] `sdk/elixir/RELEASE.md` — Already documents the fallback `elixir test_runner.exs` path.

## Suggested Order

1. Update `sdk/README.md`.
2. Update Go, Rust, Ruby, Python, and Elixir READMEs.
3. Re-check this file against the docs so the punchlist only contains real remaining items.
