# mlld Elixir SDK

Elixir wrapper for mlld using a persistent NDJSON JSON-RPC transport over `mlld live --stdio`.

This SDK intentionally matches the behavior and option model used by the Go, Python, Ruby, and Rust SDKs in `sdk/`, while adding BEAM-native features for supervision, pooling, and telemetry.

## Status

- Phase 1 parity: implemented (`Client`, `Handle`, typed results, async control, timeout/cancel, transport restart)
- Phase 2 native features: implemented (`GenServer` integration, named registration, pool, telemetry, Phoenix bridge)
- Phase 3 future readiness: option/model guidance documented; runtime support depends on upstream mlld features

## Table Of Contents

1. Requirements
2. Installation
3. Quick Start
4. API At A Glance
5. Core Types
6. Option Reference
7. Request Lifecycle And Transport Model
8. Async Handles
9. State Updates And Cancellation
10. Supervision And Named Clients
11. Connection Pool (`Mlld.Pool`)
12. Telemetry
13. Phoenix Channel Bridge
14. Error Model
15. Behavioral Parity With Other SDKs
16. Testing
17. Operational Notes
18. Release Process
19. Future Feature Readiness (VFS / Checkpoint / Resume / Fork)

## 1. Requirements

- Elixir 1.15+
- Erlang/OTP compatible with your Elixir version
- Node.js runtime (mlld CLI runtime dependency)
- `mlld` executable available in PATH, or command override via client options

## 2. Installation

From this repo checkout:

```bash
cd sdk/elixir
mix deps.get
```

For local development against this repository's CLI build:

- Build CLI at repo root (`dist/cli.cjs` must exist)
- Configure client as `command: "node", command_args: ["/abs/path/to/dist/cli.cjs"]`

## 3. Quick Start

```elixir
alias Mlld.Client

{:ok, client} =
  Client.start_link(
    command: "mlld",
    timeout: 30_000
  )

# String script execution
{:ok, output} =
  Client.process(
    client,
    "/show \"Hello World\"\n",
    mode: :strict
  )

IO.puts(output)

# File execution with payload/state/dynamic modules
{:ok, result} =
  Client.execute(
    client,
    "./agent.mld",
    %{"text" => "hello"},
    state: %{"count" => 0},
    dynamic_modules: %{
      "@config" => %{"mode" => "demo"}
    },
    timeout: 10_000
  )

IO.puts(result.output)
IO.inspect(result.state_writes)

Client.stop(client)
```

## 4. API At A Glance

### `Mlld.Client`

- `start_link(opts)`
- `stop(client)`
- `process(client, script, opts)`
- `process_async(client, script, opts)`
- `execute(client, filepath, payload, opts)`
- `execute_async(client, filepath, payload, opts)`
- `analyze(client, filepath)`
- `process_task(client, script, opts)`
- `execute_task(client, filepath, payload, opts)`
- `cancel_request(client, request_id)`
- `update_state(client, request_id, path, value, opts)`

### `Mlld.Handle`

- `request_id(handle)`
- `cancel(handle)`
- `update_state(handle, path, value, opts)`
- `wait(handle)`
- `result(handle)`
- `task(handle)`

### Module-level convenience (`Mlld`)

- `Mlld.process(script, opts)`
- `Mlld.process_async(script, opts)`
- `Mlld.execute(filepath, payload, opts)`
- `Mlld.execute_async(filepath, payload, opts)`
- `Mlld.analyze(filepath)`
- `Mlld.close()`

## 5. Core Types

Returned structs are aligned with other SDK wrappers:

- `Mlld.ExecuteResult`
  - `output`
  - `state_writes` (`[Mlld.StateWrite]`)
  - `exports`
  - `effects` (`[Mlld.Effect]`)
  - `metrics` (`Mlld.Metrics | nil`)
- `Mlld.AnalyzeResult`
  - `filepath`
  - `valid`
  - `errors` (`[Mlld.AnalysisError]`)
  - `executables` (`[Mlld.Executable]`)
  - `exports`
  - `imports` (`[Mlld.Import]`)
  - `guards` (`[Mlld.Guard]`)
  - `needs` (`Mlld.Needs | nil`)
- `Mlld.StateWrite`
  - `path`
  - `value`
  - `timestamp`
- `Mlld.Error` (exception struct, returned in `{:error, ...}` tuples)
  - `message`
  - `code`
  - `return_code`
  - `details`

## 6. Option Reference

### Client options (`start_link/1`)

- `:name` - process registration (`:atom`, `{:global, term}`, `{:via, module, term}`)
- `:command` - command executable (`"mlld"` default)
- `:command_args` - prepended args before `live --stdio`
- `:timeout` - default request timeout in milliseconds (default `30_000`)
- `:working_dir` - working directory for script execution
- `:completed_limit` - in-memory completed request cache size (default `1024`)

Local repo CLI example:

```elixir
{:ok, client} =
  Mlld.Client.start_link(
    command: "node",
    command_args: ["/absolute/path/to/dist/cli.cjs"],
    timeout: 20_000
  )
```

### Process options (`process/3`, `process_async/3`)

- `:file_path`
- `:payload`
- `:state`
- `:dynamic_modules`
- `:dynamic_module_source`
- `:mode` (`:strict`, `:markdown`, or string)
- `:allow_absolute_paths`
- `:timeout` (request-specific ms override)

### Execute options (`execute/4`, `execute_async/4`)

- `:state`
- `:dynamic_modules`
- `:dynamic_module_source`
- `:mode`
- `:allow_absolute_paths`
- `:timeout`

### Update-state options (`update_state/5`, `Handle.update_state/4`)

- `:timeout` - timeout for each `state:update` request

Behavior:

- Retries on `REQUEST_NOT_FOUND` every 25ms until deadline
- Deadline = resolved timeout or 2000ms fallback
- Matches retry semantics in Go/Python/Ruby/Rust wrappers

## 7. Request Lifecycle And Transport Model

Internals are intentionally consistent with other SDK implementations:

1. Client keeps one persistent subprocess via `mlld live --stdio`
2. Each call is encoded as JSON-RPC line with integer `id`
3. Multiple requests are in-flight concurrently (multiplexed)
4. NDJSON envelopes are decoded from stdout
5. `event` messages are routed by `id` and accumulated for handle result
6. `result` message resolves request and unblocks waiters
7. Transport death fails all pending requests with `TRANSPORT_ERROR`
8. Next request lazily restarts transport automatically

## 8. Async Handles

`process_async/3` and `execute_async/4` return `Mlld.Handle`.

```elixir
{:ok, handle} =
  Mlld.Client.process_async(
    client,
    "loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow \"done\"",
    state: %{"exit" => false},
    timeout: 10_000
  )

# Control in-flight request
:ok = Mlld.Handle.update_state(handle, "exit", true)

# Block until done
{:ok, output} = Mlld.Handle.result(handle)
```

Task interop patterns:

```elixir
# Task-returning helpers
task = Mlld.Client.execute_task(client, "pipeline.mld", payload, timeout: 20_000)
{:ok, execute_result} = Task.await(task, :infinity)

# Handle -> underlying task
{:ok, handle} = Mlld.Client.execute_async(client, "pipeline.mld", payload)
task = Mlld.Handle.task(handle)
{:ok, execute_result} = Task.await(task, :infinity)
```

## 9. State Updates And Cancellation

### Cancel an in-flight request

```elixir
:ok = Mlld.Handle.cancel(handle)
# or
:ok = Mlld.Client.cancel_request(client, request_id)
```

### Update in-flight state

```elixir
:ok = Mlld.Handle.update_state(handle, "exit", true)
```

If request is already complete, update returns:

```elixir
{:error, %Mlld.Error{code: "REQUEST_NOT_FOUND"}}
```

## 10. Supervision And Named Clients

`Mlld.Client` is a GenServer worker with child spec support.

```elixir
children = [
  {Mlld.Client,
   name: :main_agent,
   command: "mlld",
   timeout: 60_000}
]

{:ok, _pid} = Supervisor.start_link(children, strategy: :one_for_one)

{:ok, output} = Mlld.Client.process(:main_agent, "/show \"hello\"")
```

Named process discovery works with standard OTP registration forms.

## 11. Connection Pool (`Mlld.Pool`)

Pool provides checkout/checkin and convenience execute/process/analyze helpers.

```elixir
children = [
  {Mlld.Pool,
   name: :agent_pool,
   size: 20,
   overflow: 5,
   command: "mlld",
   timeout: 30_000}
]

{:ok, _pid} = Supervisor.start_link(children, strategy: :one_for_one)

{:ok, result} = Mlld.Pool.execute(:agent_pool, "pipeline.mld", %{"topic" => "safety"})
```

Manual checkout:

```elixir
{:ok, client} = Mlld.Pool.checkout(:agent_pool)
{:ok, output} = Mlld.Client.process(client, "/show \"pooled\"")
:ok = Mlld.Pool.checkin(:agent_pool, client)
```

Pool notes:

- Base clients (`size`) are long-lived
- Overflow clients are temporary and stopped on checkin
- Owner process monitoring returns clients when owners exit

## 12. Telemetry

The SDK emits `:telemetry` events with prefix `[:mlld, ...]`.

Core events:

- `[:mlld, :process, :start]`
- `[:mlld, :process, :stop]`
- `[:mlld, :process, :exception]`
- `[:mlld, :execute, :start]`
- `[:mlld, :execute, :stop]`
- `[:mlld, :execute, :exception]`
- `[:mlld, :analyze, :start]`
- `[:mlld, :analyze, :stop]`
- `[:mlld, :analyze, :exception]`
- `[:mlld, :transport, :restart]`

Attach handler example:

```elixir
:telemetry.attach(
  "mlld-logger",
  [
    [:mlld, :process, :stop],
    [:mlld, :execute, :stop],
    [:mlld, :transport, :restart]
  ],
  fn event, measurements, metadata, _config ->
    IO.inspect({event, measurements, metadata}, label: "mlld telemetry")
  end,
  nil
)
```

## 13. Phoenix Channel Bridge

`MlldPhoenix.ChannelBridge` provides optional event/result forwarding to channel pushes without introducing a hard compile-time dependency on Phoenix.

```elixir
# inside a Phoenix channel module

def handle_in("execute", %{"filepath" => path, "payload" => payload}, socket) do
  {:ok, _handle} =
    Mlld.Phoenix.stream_execute(
      socket,
      path,
      payload,
      event_topic: "agent:event",
      result_topic: "agent:result"
    )

  {:noreply, socket}
end
```

If Phoenix is not loaded at runtime:

```elixir
{:error, :phoenix_not_available}
```

## 14. Error Model

All APIs return tuples:

- success: `{:ok, value}`
- failure: `{:error, %Mlld.Error{...}}`

Common error codes:

- `TRANSPORT_ERROR`
- `TIMEOUT`
- `REQUEST_NOT_FOUND`
- `INVALID_REQUEST`
- runtime codes propagated from mlld (`RUNTIME_ERROR`, etc.)

Pattern matching example:

```elixir
case Mlld.Client.execute(client, "agent.mld", payload) do
  {:ok, result} ->
    IO.puts(result.output)

  {:error, %Mlld.Error{code: "TIMEOUT"}} ->
    IO.puts("execution timed out")

  {:error, %Mlld.Error{code: code, message: message}} ->
    IO.puts("#{code}: #{message}")
end
```

## 15. Behavioral Parity With Other SDKs

Parity guarantees in this implementation:

- Live transport command shape: `command + command_args + ["live", "--stdio"]`
- Request IDs are integers and multiplexed in one live client
- `state:write` events are merged with final `stateWrites` in execute results
- Timeout behavior cancels request and returns `TIMEOUT`
- `update_state` retries `REQUEST_NOT_FOUND` with short backoff
- Transport closure fails pending operations and triggers lazy restart

This makes behavior consistent across Go/Python/Ruby/Rust/Elixir wrappers.

## 16. Testing

Run in `sdk/elixir/`:

```bash
mix test
```

Integration tests expect:

- `node` on PATH
- `dist/cli.cjs` built at repo root (`../../dist/cli.cjs` from `sdk/elixir`)

Integration coverage mirrors other SDKs:

- execute roundtrip with dynamic modules and state writes
- long-running loop stopped via `update_state`
- `REQUEST_NOT_FOUND` when updating after completion

## 17. Operational Notes

- Keep one long-lived client per process domain (or use `Mlld.Pool`)
- Use request-level timeouts on untrusted/long tasks
- Prefer named clients for supervision-driven apps
- Collect telemetry to observe latency and transport restarts
- Use `command: "node", command_args: [cli_path]` in mono-repo development

## 18. Release Process

Release instructions are maintained in `sdk/elixir/RELEASE.md`.

Quick path:

```bash
cd sdk/elixir
mix format --check-formatted
mix test
mix hex.build
mix hex.publish --dry-run
mix hex.publish
```

Then tag from repo root:

```bash
git tag elixir-sdk-v<version>
git push origin main --tags
```

## 19. Future Feature Readiness

The SDK API shape is prepared for upcoming mlld capabilities described in project specs:

- Virtual filesystem support (`fileSystem`-style option passthrough)
- Checkpoint/resume/fork option passthrough
- checkpoint/hook event forwarding to telemetry
- supervised restart + checkpoint reuse patterns for resilient agents

As upstream CLI flags/protocol fields land, additions should remain backward-compatible with the current client/handle/result model.
