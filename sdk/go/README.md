# mlld Go SDK

Go wrapper for the mlld CLI.

## Installation

```bash
go get github.com/mlld-lang/mlld-go
```

**Requires**: Node.js and mlld CLI installed (`npm install -g mlld`)

## Quick Start

```go
package main

import (
    "fmt"
    mlld "github.com/mlld-lang/mlld-go"
)

func main() {
    client := mlld.New()

    // Process a script
    output, err := client.Process(`show "Hello World"`, nil)
    if err != nil {
        panic(err)
    }
    fmt.Println(output) // Hello World

    // Execute a file with payload
    result, err := client.Execute("./agent.mld", map[string]any{
        "text": "hello",
    }, nil)
    if err != nil {
        panic(err)
    }
    fmt.Println(result.Output)

    // Static analysis
    analysis, err := client.Analyze("./module.mld")
    if err != nil {
        panic(err)
    }
    fmt.Println(analysis.Exports)
}
```

## API

### Client

- `New()` - Create a new client with defaults
- `Process(script string, opts *ProcessOptions)` - Execute a script string
- `Execute(filepath string, payload any, opts *ExecuteOptions)` - Run a file
- `Analyze(filepath string)` - Static analysis without execution

### Configuration

```go
client := mlld.New()
client.Command = "mlld"           // CLI command (default: "mlld")
client.Timeout = 30 * time.Second // Default timeout
client.WorkingDir = "/path/to"    // Working directory
```

## Requirements

- Go 1.21+
- Node.js runtime
- mlld CLI (`npm install -g mlld`)

## Documentation

- [mlld Documentation](https://mlld.dev)
- [GitHub Repository](https://github.com/mlld-lang/mlld)
