# Run Exec Subtype

The `runExec` subtype of the `@run` directive executes predefined commands that have been defined using the `@exec` directive. It provides a way to reuse and parameterize commands across Meld documents.

## Syntax

```meld
@run $commandName
@run $commandName (arg1, arg2)
```

Where:
- `commandName`: The name of a command defined using the `@exec` directive
- `arg1, arg2`: Optional arguments to pass to the command

Note: The space between command name and arguments is optional but preferred in documentation.

## AST Structure

The `runExec` subtype nodes have this structure:

```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runExec',
  values: {
    identifier: TextNodeArray,     // Reference to the defined command
    args: VariableNodeArray[]      // Array of argument arrays, may be empty
  },
  raw: {
    identifier: string,            // Raw command name
    args: string[]                 // Raw argument strings, may be empty array
  },
  meta: {
    argumentCount: number          // Number of provided arguments
  },
  nodeId: string,
  location: SourceLocation
}
```

## Examples

### Basic Command Execution

```meld
@run $listFiles
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runExec',
  values: {
    identifier: [{ type: 'Text', content: 'listFiles' }],
    args: []
  },
  raw: {
    identifier: 'listFiles',
    args: []
  },
  meta: {
    argumentCount: 0
  }
}
```

### Command with Arguments

```meld
@run $formatData ("large_file.json", "pretty")
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runExec',
  values: {
    identifier: [{ type: 'Text', content: 'formatData' }],
    args: [
      [{ type: 'Text', content: 'large_file.json' }],
      [{ type: 'Text', content: 'pretty' }]
    ]
  },
  raw: {
    identifier: 'formatData',
    args: ['large_file.json', 'pretty']
  },
  meta: {
    argumentCount: 2
  }
}
```

### Command with Variable Arguments

```meld
@run $processFile ({{filename}}, {{options}})
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runExec',
  values: {
    identifier: [{ type: 'Text', content: 'processFile' }],
    args: [
      [{ type: 'VariableReference', identifier: 'filename' }],
      [{ type: 'VariableReference', identifier: 'options' }]
    ]
  },
  raw: {
    identifier: 'processFile',
    args: ['{{filename}}', '{{options}}']
  },
  meta: {
    argumentCount: 2
  }
}
```

## Handling

The `runExec` subtype is used to:

1. Execute predefined commands from `@exec` directives
2. Pass arguments to parameterize command execution
3. Reuse common command patterns across documents

From a UX perspective, `runExec` doesn't need to know whether it's executing a shell command or code in a specific language. It simply references the command by name and passes arguments. The internal handler determines the appropriate execution strategy based on how the command was defined in the corresponding `@exec` directive.

## Related Directives

- [@run](./run.md): Parent directive with overview of all subtypes
- [@exec](./exec.md): Defines commands that can be executed via `@run $commandName`