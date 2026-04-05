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
handle, err := client.ExecuteAsync(
  "./agent.mld",
  map[string]any{"task": "process"},
  &mlld.ExecuteOptions{
    State:   map[string]any{"exit": false},
    Timeout: 30 * time.Second,
  },
)
if err != nil {
  panic(err)
}

// Consume events as they arrive
for {
  event, err := handle.NextEvent(5 * time.Second)
  if err != nil || event == nil {
    break
  }
  if event.Type == "state_write" {
    fmt.Printf("State: %s = %v\n", event.StateWrite.Path, event.StateWrite.Value)
  }
  if event.Type == "complete" {
    break
  }
}

// Or skip events and get the final result directly
result, err := handle.Result()
```

## MCP Server Injection

```go
result, err := client.Execute(
  "./agent.mld",
  payload,
  &mlld.ExecuteOptions{
    McpServers: map[string]string{
      "tools": "uv run python3 mcp_server.py",
    },
  },
)
```

## Security Labels

```go
payload := map[string]any{
  "config":     mlld.Trusted(map[string]any{"mode": "safe"}),
  "user_input": mlld.Untrusted(rawInput),
  "data":       mlld.Labeled(value, "pii", "sensitive"),
}
result, err := client.Execute("script.mld", payload, nil)
```

## Filesystem Integrity

```go
signed, err := client.Sign("docs/note.txt", &mlld.SignOptions{Identity: "user:alice"})
verified, err := client.Verify("docs/note.txt", nil)
status, err := client.FSStatus("src/**/*.mld", nil)
contentSig, err := client.SignContent("runtime payload", "user:alice", nil)

// Write file within an active execution
handle, _ := client.ExecuteAsync("./agent.mld", nil, nil)
fileSig, err := handle.WriteFile("out.txt", "hello from sdk")
```

## API

### Client

- `New()`
- `(*Client).Process(script string, opts *ProcessOptions) (string, error)`
- `(*Client).ProcessAsync(script string, opts *ProcessOptions) (*ProcessHandle, error)`
- `(*Client).Execute(filepath string, payload any, opts *ExecuteOptions) (*ExecuteResult, error)`
- `(*Client).ExecuteAsync(filepath string, payload any, opts *ExecuteOptions) (*ExecuteHandle, error)`
- `(*Client).Analyze(filepath string) (*AnalyzeResult, error)`
- `(*Client).FSStatus(glob string, opts *FSStatusOptions) ([]FilesystemStatus, error)`
- `(*Client).Sign(path string, opts *SignOptions) (*FileVerifyResult, error)`
- `(*Client).Verify(path string, opts *VerifyOptions) (*FileVerifyResult, error)`
- `(*Client).SignContent(content, identity string, opts *SignContentOptions) (*ContentSignature, error)`
- `(*Client).Close() error`

### Package-Level Convenience Functions

- `mlld.Process(script string, opts *ProcessOptions) (string, error)`
- `mlld.Execute(filepath string, payload any, opts *ExecuteOptions) (*ExecuteResult, error)`
- `mlld.Analyze(filepath string) (*AnalyzeResult, error)`
- `mlld.CloseDefaultClient() error`

### Handle Methods

`ProcessHandle` and `ExecuteHandle` both provide:

- `RequestID() uint64`
- `Cancel()`
- `UpdateState(path string, value any, labels ...string) error`
- `NextEvent(timeout time.Duration) (*HandleEvent, error)`
- `Wait()`
- `Result()`

`ExecuteHandle` also provides:

- `WriteFile(path, content string, timeout ...time.Duration) (*FileVerifyResult, error)`

### ProcessOptions / ExecuteOptions

- `FilePath` (ProcessOptions only)
- `Payload` (ProcessOptions only)
- `PayloadLabels map[string][]string`
- `State`
- `DynamicModules`
- `DynamicModuleSource`
- `McpServers map[string]string`
- `Mode`
- `AllowAbsolutePaths`
- `Timeout`

### Label Helpers

- `Labeled(value any, labels ...string) LabeledValue`
- `Trusted(value any) LabeledValue`
- `Untrusted(value any) LabeledValue`

## Notes

- Each `Client` keeps one live RPC subprocess for repeated calls.
- `ExecuteResult.StateWrites` merges final-result writes and streamed `state:write` events.
- `ExecuteResult.Denials` collects structured guard/policy label-flow denials.
- `ExecuteResult.Effects` contains output effects with security metadata.
- `ExecuteResult.Metrics` contains timing statistics.
- `NextEvent` yields `HandleEvent` with Type `"state_write"`, `"guard_denial"`, or `"complete"`.
- Sync methods are wrappers around async handle methods.
