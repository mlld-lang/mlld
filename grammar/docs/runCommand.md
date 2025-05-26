# Run Command Subtype

The `runCommand` subtype of the `@run` directive executes shell commands and captures their output. It provides a straightforward way to interact with the underlying operating system and execute external processes.

## Syntax

```mlld
@run [command arguments]
```

Where:
- `command`: The shell command to execute
- `arguments`: Optional arguments for the command

Multi-line commands are supported using the same bracket syntax:

```mlld
@run [
  command arg1 \
  | pipe-to-another-command arg2
]
```

## AST Structure

The `runCommand` subtype nodes have this structure:

```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  values: {
    command: ContentNodeArray // Array of text/variable nodes for command content
  },
  raw: {
    command: string // Raw text of command
  },
  meta: {
    isMultiLine: boolean // Whether this is a multi-line command
  },
  nodeId: string,
  location: SourceLocation
}
```

## Examples

### Basic Command

```mlld
@run [ls -la]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  values: {
    command: [{ type: 'Text', content: 'ls -la' }]
  },
  raw: {
    command: 'ls -la'
  },
  meta: {
    isMultiLine: false
  }
}
```

### Multi-line Command

```mlld
@run [
  find . -name "*.js" | 
  xargs grep "TODO"
]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  values: {
    command: [{ 
      type: 'Text', 
      content: 'find . -name "*.js" | \n  xargs grep "TODO"' 
    }]
  },
  raw: {
    command: 'find . -name "*.js" | \n  xargs grep "TODO"'
  },
  meta: {
    isMultiLine: true
  }
}
```

### Command with Variable Interpolation

```mlld
@run [ls -la {{directory}}]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  values: {
    command: [
      { type: 'Text', content: 'ls -la ' },
      { type: 'VariableReference', identifier: 'directory' }
    ]
  },
  raw: {
    command: 'ls -la {{directory}}'
  },
  meta: {
    isMultiLine: false
  }
}
```

## Handling

The `runCommand` subtype is used to:

1. Execute shell commands in the host environment
2. Capture command output (stdout, stderr)
3. Process and display command results in the document

The command content can include variable interpolation using the `{{variable}}` syntax, which resolves variables from the current scope before execution.

## Related Directives

- [@run](./run.md): Parent directive with overview of all subtypes
- [@exec](./exec.md): Defines reusable commands that can be executed via `@run $commandName`