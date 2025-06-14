# Secure Execution Environments for mlld

## Executive Summary

As mlld evolves its security model from trust levels to actual isolation boundaries, we need to evaluate execution environments that can provide secure, performant code execution. This analysis examines Deno and alternatives in the context of mlld's shadow environment pattern.

## Current State

mlld currently has:
- **Trust levels**: `always`, `verify`, `never`
- **Shadow environments**: `@exec js = { ... }` for function sharing
- **No isolation**: Everything runs in the same process

## Requirements

An ideal secure execution environment for mlld should:
1. Provide strong isolation guarantees
2. Support fine-grained permission control
3. Integrate naturally with mlld's syntax
4. Maintain good performance for common operations
5. Support multiple languages (eventually)
6. Be deployable in various environments

## Technology Analysis

### 1. Deno - Security-First JavaScript Runtime

**Overview**: Ryan Dahl's "Node.js done right" with security as a core principle.

**Security Model**:
```bash
deno run --allow-read=./data --allow-net=api.example.com script.ts
```

**mlld Integration Concept**:
```mlld
@exec deno = { fetchAPI, processData }

@exec fetchAPI(url) = @run deno [(
  const response = await fetch(url);
  return response.json();
)] with {
  permissions: ["net:api.example.com"]
}
```

**Pros**:
- Permission model aligns perfectly with mlld's explicit philosophy
- TypeScript support out of the box
- Built-in tooling (fmt, lint, test)
- Single binary distribution
- Web-compatible APIs

**Cons**:
- Requires Deno runtime (~100MB)
- Different module system from Node.js (though Deno 2.0 adds npm support)
- Smaller ecosystem than Node.js

**Verdict**: Best overall fit for mlld's security philosophy

### 2. V8 Isolates (Cloudflare Workers Pattern)

**Overview**: Lightweight JavaScript contexts within a single V8 process.

**Performance**:
- 5ms cold starts (vs 50ms for containers)
- 3MB memory per isolate (vs 35MB for containers)
- Can run thousands concurrently

**mlld Integration Concept**:
```mlld
@exec transform(data) = @isolate js [(
  return data.map(item => ({
    ...item,
    processed: true,
    timestamp: Date.now()
  }));
)] with {
  timeout: "50ms",
  memory: "10MB"
}
```

**Pros**:
- Extremely fast for short-lived operations
- Perfect for data transformations
- Minimal resource usage
- Good for multi-tenant scenarios

**Cons**:
- JavaScript/TypeScript only
- No filesystem access
- Complex to implement correctly
- Time measurement disabled (Spectre mitigation)

**Verdict**: Excellent for data pipeline operations

### 3. WebAssembly Runtimes (Wasmtime/Wasmer)

**Overview**: Sandboxed execution for any language that compiles to WASM.

**Security Model**:
- Capability-based security
- No ambient authority
- Explicit imports/exports

**mlld Integration Concept**:
```mlld
# Compile Rust/Go/C to WASM module
@import { imageProcess } from "./processor.wasm"

@data thumbnails = @wasm:imageProcess(@images) with {
  memory: { initial: "1MB", maximum: "10MB" },
  capabilities: ["filesystem:read:./images"]
}
```

**Pros**:
- Language agnostic (Rust, Go, C, etc.)
- Strong security guarantees
- Good performance for compute-heavy tasks
- Growing ecosystem

**Cons**:
- Compilation step required
- Async I/O limitations
- Larger runtime than V8 isolates
- WASI (system interface) still evolving

**Verdict**: Best for performance-critical, polyglot scenarios

### 4. Container-Based Isolation

#### gVisor (Google)
- User-space kernel in Go
- Intercepts syscalls
- Used by Google Cloud Run

#### Firecracker (AWS)
- MicroVM technology
- Hardware virtualization
- Used by AWS Lambda

**mlld Integration Concept**:
```mlld
@exec analyze(data) = @container python [(
  import pandas as pd
  df = pd.DataFrame(data)
  return df.describe().to_json()
)] with {
  runtime: "gvisor",
  image: "python:3.11-slim",
  resources: { cpu: "0.5", memory: "256MB" }
}
```

**Pros**:
- Strongest isolation guarantees
- Support any language/binary
- Production-proven
- Good for legacy code

**Cons**:
- Highest overhead (100ms+ cold starts)
- Complex orchestration
- Platform dependencies
- Resource intensive

**Verdict**: Best for untrusted code or legacy integration

### 5. Embedded JavaScript Sandboxes

#### QuickJS (2024 Edition)
- Small JS engine compiled to WASM
- TypeScript support added
- 1MB runtime size

**mlld Integration Concept**:
```mlld
@exec validate(input) = @quickjs [(
  if (!input.email.match(/^[^@]+@[^@]+$/)) {
    throw new Error("Invalid email");
  }
  return true;
)]
```

**Pros**:
- Tiny footprint
- No external dependencies
- Easy to embed

**Cons**:
- JavaScript only
- Limited ecosystem
- Performance limitations
- Security of fetch API questionable

**Verdict**: Good for simple validation/transformation

## Recommended Architecture

### Three-Tier Approach

```mlld
# Tier 1: Deno for general secure execution
@exec api = { fetch, parse, validate }  # Deno shadow env

@exec fetch(url) = @run deno [(
  const data = await fetch(url).then(r => r.json());
  return validate(data) ? parse(data) : null;
)] trust verify

# Tier 2: V8 Isolates for data transformation
@exec transform = { map, filter, reduce }  # Isolate shadow env

@data results = foreach @isolate:map(@items) with {
  timeout: "10ms",
  memory: "5MB"
}

# Tier 3: WASM for performance-critical operations
@import { compress } from "@mlld/compression.wasm"

@data compressed = @compress(@largefile) with {
  runtime: "wasmtime",
  memory: { max: "100MB" }
}
```

### Migration Path

1. **Phase 1**: Implement Deno integration
   - Start with basic permissions
   - Map mlld trust levels to Deno permissions
   - Test with registry modules

2. **Phase 2**: Add V8 isolates for pipelines
   - Optimize data transformations
   - Enable safe user scripts
   - Benchmark performance improvements

3. **Phase 3**: WASM for specialized tasks
   - Image processing
   - Cryptography
   - Data compression

4. **Phase 4**: Container fallback
   - Legacy code support
   - Full language flexibility
   - Maximum isolation when needed

## Security Considerations

### Defense in Depth
```mlld
# Multiple layers of security
@import @untrusted/module with { 
  trust: "sandbox",           # mlld trust level
  runtime: "deno",           # Deno permissions
  permissions: ["net"],      # Minimal grants
  timeout: "30s",           # Resource limits
  audit: true              # Log all operations
}
```

### Permission Inheritance
```mlld
# Shadow env permissions cascade
@exec deno:readonly = { readFile, parseJSON }
@exec deno:network = { fetchAPI, postData }

# Functions inherit their shadow env's permission context
@exec readFile(path) = @run deno [(
  return await Deno.readTextFile(path);
)]  # Only works in deno:readonly context
```

## Performance Implications

| Runtime | Cold Start | Memory | Best For |
|---------|------------|--------|-----------|
| Deno | 50ms | 30MB | General execution |
| V8 Isolate | 5ms | 3MB | Data transforms |
| WASM | 10ms | 10MB | Compute-heavy |
| gVisor | 200ms | 50MB | Untrusted code |
| Firecracker | 125ms | 40MB | Full isolation |

## Conclusion

The shadow environment pattern we're building is perfectly positioned to leverage these secure execution technologies. Starting with Deno provides:

1. **Immediate security wins** with minimal complexity
2. **Natural syntax alignment** with mlld's philosophy  
3. **Room to grow** into more specialized runtimes
4. **Clear migration path** for existing code

The key insight is that different operations need different isolation levels:
- **User scripts** → Deno with restricted permissions
- **Data pipelines** → V8 isolates for speed
- **Heavy computation** → WASM for performance
- **Unknown code** → Full container isolation

This isn't overengineering - it's recognizing that mlld's trust model naturally extends into runtime isolation, and building the abstractions now that will make this evolution seamless.