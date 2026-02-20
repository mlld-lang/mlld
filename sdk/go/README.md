# mlld Go SDK

Go wrapper for mlld using a persistent NDJSON RPC transport over `mlld live --stdio`.

## Installation

```bash
go get github.com/mlld-lang/mlld/sdk/go
```

## Requirements

- Go 1.21+
- Node.js runtime
- mlld CLI available by command path

## Quick Start

```go
package main

import (
  "fmt"
  "time"

  mlld "github.com/mlld-lang/mlld/sdk/go"
)

func main() {
  client := mlld.New()

  // Optional command override (local repo build example)
  // client.Command = "node"
  // client.CommandArgs = []string{"./dist/cli.cjs"}

  output, err := client.Process(`show "Hello World"`, nil)
  if err != nil {
    panic(err)
  }
  fmt.Println(output)

  result, err := client.Execute(
    "./agent.mld",
    map[string]any{"text": "hello"},
    &mlld.ExecuteOptions{
      State: map[string]any{"count": 0},
      DynamicModules: map[string]any{
        "@config": map[string]any{"mode": "demo"},
      },
      Timeout: 10 * time.Second,
    },
  )
  if err != nil {
    panic(err)
  }
  fmt.Println(result.Output)

  _ = client.Close()
}
```

## In-Flight State Updates

```go
handle, err := client.ProcessAsync(
  "loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow \"done\"",
  &mlld.ProcessOptions{
    State: map[string]any{"exit": false},
    Mode: "strict",
    Timeout: 10 * time.Second,
  },
)
if err != nil {
  panic(err)
}

time.Sleep(120 * time.Millisecond)
if err := handle.UpdateState("exit", true); err != nil {
  panic(err)
}

output, err := handle.Result()
if err != nil {
  panic(err)
}
fmt.Println(output)
```

## API

### Client

- `New()`
- `(*Client).Process(script string, opts *ProcessOptions) (string, error)`
- `(*Client).ProcessAsync(script string, opts *ProcessOptions) (*ProcessHandle, error)`
- `(*Client).Execute(filepath string, payload any, opts *ExecuteOptions) (*ExecuteResult, error)`
- `(*Client).ExecuteAsync(filepath string, payload any, opts *ExecuteOptions) (*ExecuteHandle, error)`
- `(*Client).Analyze(filepath string) (*AnalyzeResult, error)`
- `(*Client).Close() error`

### Handle Methods

`ProcessHandle` and `ExecuteHandle` both provide:

- `RequestID() uint64`
- `Cancel()`
- `UpdateState(path string, value any) error`
- `Wait()`
- `Result()`

### ProcessOptions

- `FilePath`
- `Payload`
- `State`
- `DynamicModules`
- `DynamicModuleSource`
- `Mode`
- `AllowAbsolutePaths`
- `Timeout`

### ExecuteOptions

- `State`
- `DynamicModules`
- `DynamicModuleSource`
- `Mode`
- `AllowAbsolutePaths`
- `Timeout`

## Notes

- Each `Client` keeps one live RPC subprocess for repeated calls.
- `ExecuteResult.StateWrites` merges final-result writes and streamed `state:write` events.
- Sync methods remain as wrappers around async handle methods.
