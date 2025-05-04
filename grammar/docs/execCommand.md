# Exec Command Subtype

The `execCommand` subtype of the `@exec` directive is used to define reusable, named commands that can be executed with the `@run` directive. It provides a way to create command templates that can be parameterized and reused throughout a project.

## Syntax

```meld
@exec name = @run [command]
@exec name.field = @run [command]
@exec name(parameters) = @run [command]
```

Where:
- `name`: An identifier for the command definition
- `field`: Optional metadata field (risk.high, risk.med, risk.low, risk, about, meta)
- `parameters`: Optional comma-separated list of parameter names
- `command`: The command to execute, which can include variable references

## AST Structure

The `execCommand` subtype nodes have this structure:

```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    name: TextNodeArray,       // The name of the command
    field?: TextNodeArray,     // Optional metadata field
    parameters?: VariableNodeArray[], // Parameter identifiers
    command: TextNodeArray     // The command content
  },
  raw: {
    name: string,             // Raw name string
    field?: string,           // Raw field string
    parameters?: string[],    // Raw parameter names
    command: string           // Raw command string
  },
  meta: {
    isCommand: true,          // Flag indicating this is a command
    field?: {
      type: 'risk.high' | 'risk.med' | 'risk.low' | 'risk' | 'about' | 'meta'
    }
  },
  nodeId: string,
  location: SourceLocation
}
```

## Examples

### Basic Command

```meld
@exec list = @run [ls -la]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    name: [{ type: 'Text', content: 'list' }],
    command: [{ type: 'Text', content: 'ls -la' }]
  },
  raw: {
    name: 'list',
    command: 'ls -la'
  },
  meta: {
    isCommand: true
  }
}
```

### Parameterized Command

```meld
@exec format(path, type) = @run [fmt $path --type=$type]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    name: [{ type: 'Text', content: 'format' }],
    parameters: [
      [{ type: 'VariableReference', identifier: 'path' }],
      [{ type: 'VariableReference', identifier: 'type' }]
    ],
    command: [{ type: 'Text', content: 'fmt $path --type=$type' }]
  },
  raw: {
    name: 'format',
    parameters: ['path', 'type'],
    command: 'fmt $path --type=$type'
  },
  meta: {
    isCommand: true
  }
}
```

### Command with Risk Level

```meld
@exec dangerous.risk.high = @run [rm -rf /]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    name: [{ type: 'Text', content: 'dangerous' }],
    field: [{ type: 'Text', content: 'risk.high' }],
    command: [{ type: 'Text', content: 'rm -rf /' }]
  },
  raw: {
    name: 'dangerous',
    field: 'risk.high',
    command: 'rm -rf /'
  },
  meta: {
    isCommand: true,
    field: {
      type: 'risk.high'
    }
  }
}
```

## Handling

The `execCommand` subtype is used to:

1. Define reusable command templates
2. Document command risk levels
3. Create parameterized commands that can be executed with arguments
4. Group related commands with consistent naming

Commands defined with `@exec` can be executed using the `@run` directive, passing in the command name and any required parameters.

## Related Directives

- [@run](./run.md): Executes commands, can reference exec-defined commands
- [@exec](./exec.md): Parent directive with overview of all subtypes