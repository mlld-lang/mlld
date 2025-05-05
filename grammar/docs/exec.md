# Exec Directive

The `exec` directive (renamed from `define`) is used to define named commands that can be executed by the `@run` directive. It allows creating reusable command templates and code snippets that can be invoked throughout a Meld document.

## Subtypes

The `exec` directive has two subtypes:

- [execCommand](./execCommand.md): Defines a shell command
- [execCode](./execCode.md): Defines a code snippet in a specific programming language

## Syntax

```meld
@exec commandName = @run [command]
@exec commandName (param1, param2) = @run [command with $param1]
@exec commandName = @run language [code]
@exec commandName (param1, param2) = @run language [code using param1 and param2]
```

Where:
- `commandName`: An identifier for the command definition
- `param1, param2`: Optional parameters that can be referenced in the command
- `command`: A shell command to execute
- `language`: Programming language identifier (e.g., 'javascript', 'python', 'bash')
- `code`: Code in the specified programming language

Note: The space between command name and parameters is optional but preferred in documentation.

## AST Structure

The `exec` directive nodes follow this structure:

```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCommand' | 'execCode',
  values: {
    // Values specific to each subtype
    identifier: TextNodeArray,     // Command name
    params: VariableNodeArray[],   // Parameter placeholders, may be empty
    metadata?: TextNodeArray,      // Optional metadata information
    command?: ContentNodeArray,    // Command content (for execCommand)
    lang?: TextNodeArray,          // Language identifier (for execCode)
    code?: ContentNodeArray        // Code content (for execCode)
  },
  raw: {
    // Raw text for each semantic group
    identifier: string,
    params: string[],
    metadata?: string,
    command?: string,
    lang?: string,
    code?: string
  },
  meta: {
    // Metadata specific to subtype
    parameterCount: number,
    metadata?: object              // Structured metadata (future implementation)
  },
  nodeId: string,
  location: SourceLocation
}
```

## Examples

### execCommand Subtype

Define a simple command:

```meld
@exec listFiles = @run [ls -la]
```

Define a command with parameters:

```meld
@exec formatFile (file, type) = @run [fmt $file --type=$type]
```

### execCode Subtype

Define a JavaScript function:

```meld
@exec greet = @run javascript [
  console.log("Hello, world!");
]
```

Define a Python function with parameters:

```meld
@exec formatJson (data, style) = @run python [
  import json
  data_obj = json.loads(data)
  print(json.dumps(data_obj, indent=4 if style == "pretty" else None))
]
```

## Handling

Exec directives are used for:

1. Defining reusable commands and code snippets
2. Creating parameterized command templates
3. Organizing and centralizing common operations

Commands defined with `@exec` can be executed using the `@run` directive with the `$commandName` syntax, optionally passing arguments to fill parameter placeholders.

## Related Directives

- [@run](./run.md): Executes commands, including those defined by `@exec`
- [@text](./text.md): Can capture and format output from executed commands
- [@data](./data.md): Can process structured data from command output