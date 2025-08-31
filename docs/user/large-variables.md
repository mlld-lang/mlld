# Working with Large Variables

mlld can handle large amounts of data like entire codebases. But Node.js has limits when passing large variables to shell commands - typically around 128KB.

## tldr

Use shell mode for large data:
```mlld
>> This fails with large data
/run {grep "TODO" "@largefile"}

>> This works with any size  
/run sh (@largefile) { echo "$largefile" | grep "TODO" }
```

## The Problem

Node.js can't pass variables larger than ~128KB to commands - it throws an `E2BIG` error. This happens when loading many files:

```mlld
>> Load entire codebase (could be megabytes)
/var @allCode = <**/*.js>

>> This will error if @allCode > 128KB
/run {wc -l "@allCode"}

>> This works with any size
/run sh (@allCode) { echo "$allCode" | wc -l }
```

## The Solution

### Use Shell Mode

Switch from simple `/run {...}` to shell mode `/run sh {...}`:

```mlld
>> Simple run - limited to ~128KB, uses @var syntax
/run {tool "@data"}

>> Shell mode - handles any size, pass params then use $var syntax
/run sh (@data) { echo "$data" | tool }
```

**Important syntax difference:**
- Simple `/run {...}` interpolates mlld variables with `@var` syntax
- Shell `/run sh (@var) {...}` declares parameters in parentheses, then uses `$var` syntax inside

### For Executables

Define executables with bash or sh to handle large data:

```mlld
>> Load entire codebase
/var @contracts = <**/*.sol>

>> Process with shell executable - parameter becomes shell variable
/exe @analyze(code) = sh {
  echo "$code" | solidity-analyzer
}

>> Pass the mlld variable when calling
/show @analyze(@contracts)
```

The key: shell mode receives mlld variables as parameters (declared in parentheses), then accesses them as shell variables with `$` inside the code block.

### Working with External Tools

Pipe data to tools instead of passing as arguments:

```mlld
>> Good pattern for large data
/exe @process(content) = sh {
  echo "$content" | jq '.items[]'
}

>> Load many files
/var @configs = <**/*.json>
/show @process(@configs)
```

## How It Works

- Simple `/run {...}` passes variables through Node's environment (128KB limit)
- Shell mode `/run sh {...}` injects large variables directly into the shell script instead of the environment, bypassing Node's limit
- Your variables work the same - just use `$varname` in shell mode

## When You'll Hit This

Common scenarios that exceed 128KB:
- Loading all source files: `<**/*.js>`
- Processing large JSON files
- Working with documentation: `<docs/**/*.md>`
- Analyzing entire codebases

## Error Messages

mlld gives helpful errors when you hit the limit:

```
Error: Variable '@data' is too large (215KB)
Try using: /run sh { ... } or /exe ... = sh { ... }
```

Just follow the suggestion to switch to shell mode.
