# Working with Large Variables

mlld can handle large amounts of data like entire codebases. Node.js has limits when passing large variables to commands (typically around ~128KB–200KB for args+env). mlld now automatically falls back to a safe shell mode for large payloads to avoid these limits.

## tldr

Use shell mode for large data (mlld will auto-fallback when needed):
```mlld
>> This usually works automatically now, but explicit shell mode is recommended for clarity when dealing with large data
run sh (@largefile) { echo "$largefile" | grep "TODO" }

>> This works with any size  
run sh (@largefile) { echo "$largefile" | grep "TODO" }
```

## The Problem

Node.js can't pass variables larger than ~128KB to commands - it throws an `E2BIG` error. This happens when loading many files:

```mlld
>> Load entire codebase (could be megabytes)
var @allCode = <**/*.js>

>> Previously, this could error if @allCode > 128KB. mlld now auto-falls back to shell when needed.
run sh (@allCode) { echo "$allCode" | wc -l }
```

## The Solution

### Use Shell Mode

Switch from simple `/run cmd {...}` to shell mode `/run sh {...}` when writing workflows, even though mlld auto-fallbacks, because:
 - It’s explicit about using `$var` syntax inside the block
 - It avoids implicit fallback and makes intent clear in reviews

```mlld
>> Simple run - limited to ~128KB, uses @var syntax
run cmd {tool "@data"}

>> Shell mode - handles any size, pass params then use $var syntax
run sh (@data) { echo "$data" | tool }
```

**Important syntax difference:**
- Simple `/run cmd {...}` interpolates mlld variables with `@var` syntax
- Shell `/run sh (@var) {...}` declares parameters in parentheses, then uses `$var` syntax inside

### For Executables

Define executables with bash or sh to handle large data:

```mlld
>> Load entire codebase
var @contracts = <**/*.sol>

>> Process with shell executable - parameter becomes shell variable
exe @analyze(code) = sh {
  echo "$code" | solidity-analyzer
}

>> Pass the mlld variable when calling
show @analyze(@contracts)
```

The key: shell mode receives mlld variables as parameters (declared in parentheses), then accesses them as shell variables with `$` inside the code block.

### Working with External Tools

Pipe data to tools instead of passing as arguments:

```mlld
>> Good pattern for large data
exe @process(content) = sh {
  echo "$content" | jq '.items[]'
}

>> Load many files
var @configs = <**/*.json>
show @process(@configs)
```

## How It Works

- Simple `/run cmd {...}` now auto-falls back to bash when command/env payloads are large. The script is streamed via stdin to avoid args+env limits.
- Shell mode `/run sh {...}` injects large variables directly into the shell script instead of the environment (via heredoc), bypassing Node's limit.
- Your variables work the same - just use `$varname` in shell mode.

To disable auto-fallback (for debugging/policy), set `MLLD_DISABLE_SH=1`. In that mode, `/run` is strict and will error with guidance when payloads are too large.

## When You'll Hit This

Common scenarios that exceed 128KB:
- Loading all source files: `<**/*.js>`
- Processing large JSON files
- Working with documentation: `<docs/**/*.md>`
- Analyzing entire codebases

## Error Messages

With the default auto-fallback, you should rarely see size-related errors. If `MLLD_DISABLE_SH=1` is set, `/run` will be strict and show helpful guidance when payloads are too large.
