# Run Directive

The `run` directive executes commands and scripts, allowing Mlld documents to interact with external processes, run code in various languages, and execute predefined commands.

## Subtypes

The `run` directive has three subtypes:

- [runCommand](./runCommand.md): Executes a shell command
- [runCode](./runCode.md): Executes code in a specific programming language
- [runExec](./runExec.md): Executes a predefined command from an `exec` directive

## Syntax

```mlld
@run [command argument1 argument2]
@run language [code]
@run language (arg1, arg2) [code]
@run $commandName (arg1, arg2)
```

Where:
- `command`: A shell command to execute
- `language`: Programming language identifier (e.g., 'javascript', 'python', 'bash')
- `code`: Code in the specified programming language
- `commandName`: Name of a predefined command in an `exec` directive
- `arg1, arg2`: Arguments to pass to the predefined command or code

## AST Structure

The `run` directive nodes follow this structure:

```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand' | 'runCode' | 'runExec',
  values: {
    // Values specific to each subtype
    command?: ContentNodeArray,
    lang?: TextNodeArray,
    args?: VariableNodeArray[],
    code?: ContentNodeArray,
    identifier?: TextNodeArray,
  },
  raw: {
    // Raw text for each semantic group
    command?: string,
    lang?: string,
    args?: string[],
    code?: string,
    identifier?: string,
  },
  meta: {
    // Metadata specific to subtype
    isMultiLine?: boolean,
    argumentCount?: number,
  },
  nodeId: string,
  location: SourceLocation
}
```

## Examples

### runCommand Subtype

Simple shell command:

```mlld
@run [ls -la]
```

Multi-line command:

```mlld
@run [
find . -name "*.js" | 
xargs grep "TODO"
]
```

### runCode Subtype

Execute JavaScript code:

```mlld
@run javascript [
console.log("Hello, world!");
]
```

Execute Python code with arguments:

```mlld
@run python (data, format) [
import json
data_obj = json.loads(data)
print(json.dumps(data_obj, indent=4 if format == "pretty" else None))
]
```

### runExec Subtype

Execute a predefined command:

```mlld
@run $listFiles
```

Execute a predefined command with arguments:

```mlld
@run $formatData ("large_file.json", "pretty")
```

## Handling

Run directives are used for:

1. Executing shell commands and capturing their output
2. Running code in various programming languages
3. Invoking predefined commands with arguments

The output of a run directive can be:
- Displayed directly in the document
- Assigned to a variable using `@text` or `@data` directives
- Further processed with other directives

## Related Directives

- [@exec](./exec.md): Defines commands that can be executed by the `run` directive
- [@text](./text.md): Can capture and format the output of run directives
- [@data](./data.md): Can parse and store structured data from run output