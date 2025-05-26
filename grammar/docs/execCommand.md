# Exec Command Subtype

The `execCommand` subtype of the `@exec` directive defines reusable shell commands that can be executed using the `@run` directive. It provides a way to create command templates that can be parameterized and reused throughout a Mlld document.

## Syntax

```mlld
@exec commandName = @run [command]
@exec commandName (param1, param2) = @run [command with $param1 and $param2]
```

Where:
- `commandName`: An identifier for the command definition
- `param1, param2`: Optional parameters that can be referenced in the command
- `command`: The shell command to execute, which can include parameter references

Note: The space between command name and parameters is optional but preferred in documentation.

## AST Structure

The `execCommand` subtype nodes have this structure:

```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    identifier: TextNodeArray,     // Command name
    params: VariableNodeArray[],   // Parameter placeholders, may be empty
    metadata?: TextNodeArray,      // Optional metadata information
    command: ContentNodeArray      // Command content
  },
  raw: {
    identifier: string,            // Raw command name
    params: string[],              // Raw parameter names, may be empty array
    metadata?: string,             // Raw metadata string
    command: string                // Raw command string
  },
  meta: {
    parameterCount: number,        // Number of parameters
    metadata?: object              // Structured metadata (future implementation)
  },
  nodeId: string,
  location: SourceLocation
}
```

## Examples

### Basic Command

```mlld
@exec listFiles = @run [ls -la]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    identifier: [{ type: 'Text', content: 'listFiles' }],
    params: [],
    command: [{ type: 'Text', content: 'ls -la' }]
  },
  raw: {
    identifier: 'listFiles',
    params: [],
    command: 'ls -la'
  },
  meta: {
    parameterCount: 0
  }
}
```

### Parameterized Command

```mlld
@exec formatFile (path, type) = @run [fmt $path --type=$type]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    identifier: [{ type: 'Text', content: 'formatFile' }],
    params: [
      [{ type: 'VariableReference', identifier: 'path' }],
      [{ type: 'VariableReference', identifier: 'type' }]
    ],
    command: [{ type: 'Text', content: 'fmt $path --type=$type' }]
  },
  raw: {
    identifier: 'formatFile',
    params: ['path', 'type'],
    command: 'fmt $path --type=$type'
  },
  meta: {
    parameterCount: 2
  }
}
```

### Command with Metadata (Future Implementation)

```mlld
@exec cleanDirectory.risk.high = @run [rm -rf $dir]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    identifier: [{ type: 'Text', content: 'cleanDirectory' }],
    metadata: [{ type: 'Text', content: 'risk.high' }],
    params: [],
    command: [{ type: 'Text', content: 'rm -rf $dir' }]
  },
  raw: {
    identifier: 'cleanDirectory',
    metadata: 'risk.high',
    params: [],
    command: 'rm -rf $dir'
  },
  meta: {
    parameterCount: 0,
    metadata: {
      type: 'risk.high'
    }
  }
}
```

## Handling

The `execCommand` subtype is used to:

1. Define reusable command templates
2. Create parameterized commands that can be executed with arguments
3. Document command risk levels and metadata (future implementation)
4. Group related commands with consistent naming

When a command is defined with `@exec`, it becomes available for execution using the `@run $commandName` syntax. Any parameters defined in the command are replaced with the arguments provided when the command is executed.

## Parameter Substitution

Parameters defined in the command template are referenced using the `$param` syntax within the command string. When the command is executed, these references are replaced with the actual argument values.

## Related Directives

- [@exec](./exec.md): Parent directive with overview of all subtypes
- [@run](./run.md): Executes commands, including those defined by `@exec`