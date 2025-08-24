---
layout: docs.njk
title: "/log Directive"
---

# /log Directive

The `/log` directive writes messages to standard output. It is shorthand for `/output ... to stdout` and is useful for printing debug or progress information.

Note: The inline pipeline effect `| log` writes to stderr and runs after the preceding stage; see pipeline docs.

## Syntax

```mlld
/log "message"
/log @variable
/log `template with @value`
```

Each form produces the same result as:

```mlld
/output "message" to stdout
```

## Usage in Loops and Conditionals

`/log` works anywhere `/output ... to stdout` does, including inside `/for` directives and `/when` blocks. Logs are emitted immediately during iteration or condition evaluation.

```mlld
/var @items = ["a", "b"]
/for @item in @items => log @item

/when [
  @flag => log "enabled"
  @debug => log "debug"
  none => log "disabled"
]
```

## When to Use `/log`

- Display progress messages during long-running operations
- Debug variable values without writing to files
- Provide status updates in scripts and pipelines

Because `/log` is just syntactic sugar for `/output` to `stdout`, it inherits all formatting and evaluation rules from `/output`.
