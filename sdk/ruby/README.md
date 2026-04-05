# mlld Ruby SDK

Ruby wrapper for mlld using a persistent NDJSON RPC transport over `mlld live --stdio`.

## Requirements

- Ruby 3.0+
- Node.js runtime
- `mlld` CLI available by command path

## Installation

From this repo checkout:

```bash
gem build mlld.gemspec
gem install ./mlld-*.gem
```

## Quick Start

```ruby
require 'mlld'

client = Mlld::Client.new

output = client.process('/show "Hello World"')
puts output

result = client.execute(
  './agent.mld',
  { 'text' => 'hello' },
  state: { 'count' => 0 },
  dynamic_modules: {
    '@config' => { 'mode' => 'demo' }
  },
  timeout: 10
)
puts result.output

client.close
```

## In-Flight Events and State Updates

```ruby
handle = client.execute_async('./agent.mld', { 'task' => 'process' },
  state: { 'exit' => false },
  timeout: 30
)

# Consume events as they arrive
loop do
  event = handle.next_event(timeout: 5)
  break unless event

  case event.type
  when 'state_write'
    puts "State: #{event.state_write.path} = #{event.state_write.value}"
  when 'complete'
    break
  end
end

# Or skip events and get the final result directly
result = handle.result
```

## MCP Server Injection

```ruby
result = client.execute(
  './agent.mld',
  payload,
  mcp_servers: {
    'tools' => 'uv run python3 mcp_server.py'
  }
)
```

## Security Labels

```ruby
require 'mlld'

result = Mlld.execute('script.mld', {
  'config' => Mlld.trusted({ 'mode' => 'safe' }),
  'user_input' => Mlld.untrusted(raw_input),
  'data' => Mlld.labeled(value, 'pii', 'sensitive'),
})
```

## Filesystem Integrity

```ruby
signed = client.sign('docs/note.txt', identity: 'user:alice')
verified = client.verify('docs/note.txt')
status = client.fs_status('src/**/*.mld')
content_sig = client.sign_content('runtime payload', 'user:alice')

# Write file within an active execution
handle = client.execute_async('./agent.mld')
file_sig = handle.write_file('out.txt', 'hello from sdk')
```

## API

### Client

- `Mlld::Client.new(command: 'mlld', command_args: nil, timeout: 30.0, working_dir: nil)`
- `process(script, file_path:, payload:, payload_labels:, state:, dynamic_modules:, dynamic_module_source:, mode:, allow_absolute_paths:, timeout:, mcp_servers:)`
- `process_async(...) -> Mlld::ProcessHandle`
- `execute(filepath, payload = nil, payload_labels:, state:, dynamic_modules:, dynamic_module_source:, allow_absolute_paths:, mode:, timeout:, mcp_servers:)`
- `execute_async(...) -> Mlld::ExecuteHandle`
- `analyze(filepath)`
- `fs_status(glob = nil, base_path:, timeout:) -> [Mlld::FilesystemStatus]`
- `sign(path, identity:, metadata:, base_path:, timeout:) -> Mlld::FileVerifyResult`
- `verify(path, base_path:, timeout:) -> Mlld::FileVerifyResult`
- `sign_content(content, identity, metadata:, signature_id:, base_path:, timeout:) -> Mlld::ContentSignature`
- `close`

### Handle Methods

`ProcessHandle` and `ExecuteHandle` both provide:

- `request_id`
- `cancel`
- `update_state(path, value, labels:, timeout:)`
- `next_event(timeout:) -> Mlld::HandleEvent or nil`
- `wait` / `result`

`ExecuteHandle` also provides:

- `write_file(path, content, timeout:) -> Mlld::FileVerifyResult`

### Label Helpers

- `Mlld.labeled(value, *labels) -> Mlld::LabeledValue`
- `Mlld.trusted(value) -> Mlld::LabeledValue`
- `Mlld.untrusted(value) -> Mlld::LabeledValue`

### Module-Level Convenience Functions

- `Mlld.process(...)` / `Mlld.process_async(...)`
- `Mlld.execute(...)` / `Mlld.execute_async(...)`
- `Mlld.analyze(...)`
- `Mlld.fs_status(...)` / `Mlld.sign(...)` / `Mlld.verify(...)` / `Mlld.sign_content(...)`
- `Mlld.close`

## Notes

- Each `Client` keeps one live RPC subprocess for repeated calls.
- `ExecuteResult.state_writes` merges final-result writes and streamed `state:write` events.
- `ExecuteResult.denials` collects structured guard/policy label-flow denials.
- `ExecuteResult.effects` contains output effects with security metadata.
- `ExecuteResult.metrics` contains timing statistics.
- `next_event` yields `HandleEvent` with type `"state_write"`, `"guard_denial"`, or `"complete"`.
