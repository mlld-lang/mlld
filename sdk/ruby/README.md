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

# Optional command override (local repo build example)
# client = Mlld::Client.new(command: 'node', command_args: ['./dist/cli.cjs'])

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

analysis = client.analyze('./module.mld')
p analysis.exports

client.close
```

## In-Flight State Updates

```ruby
handle = client.process_async(
  "loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow \"done\"",
  state: { 'exit' => false },
  timeout: 10,
  mode: 'strict'
)

sleep 0.1
handle.update_state('exit', true)
puts handle.result
```

## API

### Client

- `Mlld::Client.new(command: 'mlld', command_args: nil, timeout: 30.0, working_dir: nil)`
- `process(script, file_path: nil, payload: nil, state: nil, dynamic_modules: nil, dynamic_module_source: nil, mode: nil, allow_absolute_paths: nil, timeout: nil)`
- `process_async(...) -> Mlld::ProcessHandle`
- `execute(filepath, payload = nil, state: nil, dynamic_modules: nil, dynamic_module_source: nil, allow_absolute_paths: nil, mode: nil, timeout: nil)`
- `execute_async(...) -> Mlld::ExecuteHandle`
- `analyze(filepath)`
- `close`

### Handle Methods

- `request_id`
- `cancel`
- `update_state(path, value, timeout: nil)`
- `wait`
- `result`

### Convenience Functions

- `Mlld.process(...)`
- `Mlld.process_async(...)`
- `Mlld.execute(...)`
- `Mlld.execute_async(...)`
- `Mlld.analyze(...)`

## Notes

- Each `Client` keeps one live RPC subprocess for repeated calls.
- `ExecuteResult.state_writes` merges final-result writes and streamed `state:write` events.
