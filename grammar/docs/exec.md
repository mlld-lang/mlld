# Exec Directive

The `exec` directive (renamed from `define`) is used to define named values and commands that can be executed or referenced in other directives. The `exec` directive supports both string values and `@run` command values, allowing users to define reusable components.

## Subtypes

The `exec` directive currently has one subtype:

- [ExecCommand](./execCommand.md): Used to define named commands with `@run` syntax

Note: More subtypes will be implemented in the future to mirror all run subtypes.

## Syntax

```meld
@exec name = value
@exec name.field = value
@exec name(parameters) = value
```

Where:
- `name`: An identifier for the exec definition
- `field`: Optional metadata field (risk.high, risk.med, risk.low, risk, about, meta)
- `parameters`: Optional comma-separated list of parameter names
- `value`: Either a string value or a `@run` command expression

## AST Structure

The `exec` directive nodes follow this structure:

```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand',
  values: {
    name: TextNodeArray,
    field?: TextNodeArray,
    parameters?: VariableNodeArray[],
    command: TextNodeArray,
  },
  raw: {
    name: string,
    field?: string,
    parameters?: string[],
    command: string,
  },
  meta: {
    isCommand: boolean,
    field?: {
      type: 'risk.high' | 'risk.med' | 'risk.low' | 'risk' | 'about' | 'meta'
    }
  },
  nodeId: string,
  location: SourceLocation
}
```

## Examples

### ExecCommand Subtype

Define a command to list files:

```meld
@exec list = @run [ls -la]
```

Define a command with parameters:

```meld
@exec format(path, type) = @run [fmt $path --type=$type]
```

Define a command with risk level:

```meld
@exec dangerous.risk.high = @run [rm -rf /]
```

Note: String value support will be added in a future implementation.

## Handling

Exec directives are used for:

1. Defining named values that can be referenced in variable interpolation
2. Creating reusable command templates that can be invoked with parameters
3. Documenting command risk levels and metadata for security purposes

## Related Directives

- [@run](./run.md): Executes commands, can reference exec-defined commands
- [@add](./add.md): Can use values defined by exec directives
- [@text](./text.md): Can reference values defined by exec directives