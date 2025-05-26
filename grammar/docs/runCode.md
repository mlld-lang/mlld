# Run Code Subtype

The `runCode` subtype of the `@run` directive executes code snippets in specific programming languages. It allows embedding and executing code directly within Mlld documents, with optional arguments to parameterize the code execution.

## Syntax

```mlld
@run language [code]
@run language (arg1, arg2) [code]
```

Where:
- `language`: The programming language identifier (e.g., 'javascript', 'python', 'bash')
- `arg1, arg2`: Optional arguments to pass to the code
- `code`: The code to execute in the specified language

## AST Structure

The `runCode` subtype nodes have this structure:

```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCode',
  values: {
    lang: TextNodeArray,           // Language identifier
    args: VariableNodeArray[],     // Array of argument arrays, may be empty
    code: ContentNodeArray         // Code content
  },
  raw: {
    lang: string,                  // Raw language name
    args: string[],                // Raw argument strings, may be empty array
    code: string                   // Raw code text
  },
  meta: {
    isMultiLine: boolean           // Whether this is a multi-line code block
  },
  nodeId: string,
  location: SourceLocation
}
```

## Examples

### Basic Code Execution

```mlld
@run javascript [
console.log("Hello, world!");
]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCode',
  values: {
    lang: [{ type: 'Text', content: 'javascript' }],
    args: [],
    code: [{ type: 'Text', content: 'console.log("Hello, world!");' }]
  },
  raw: {
    lang: 'javascript',
    args: [],
    code: 'console.log("Hello, world!");'
  },
  meta: {
    isMultiLine: true
  }
}
```

### Code with Arguments

```mlld
@run python (data, format) [
import json
data_obj = json.loads(data)
print(json.dumps(data_obj, indent=4 if format == "pretty" else None))
]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCode',
  values: {
    lang: [{ type: 'Text', content: 'python' }],
    args: [
      [{ type: 'VariableReference', identifier: 'data' }],
      [{ type: 'VariableReference', identifier: 'format' }]
    ],
    code: [{
      type: 'Text',
      content: 'import json\ndata_obj = json.loads(data)\nprint(json.dumps(data_obj, indent=4 if format == "pretty" else None))'
    }]
  },
  raw: {
    lang: 'python',
    args: ['data', 'format'],
    code: 'import json\ndata_obj = json.loads(data)\nprint(json.dumps(data_obj, indent=4 if format == "pretty" else None))'
  },
  meta: {
    isMultiLine: true
  }
}
```

### Code with Variable Interpolation

```mlld
@run javascript [
const greeting = "{{greeting}}";
console.log(greeting);
]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCode',
  values: {
    lang: [{ type: 'Text', content: 'javascript' }],
    args: [],
    code: [
      { type: 'Text', content: 'const greeting = "' },
      { type: 'VariableReference', identifier: 'greeting' },
      { type: 'Text', content: '";\nconsole.log(greeting);' }
    ]
  },
  raw: {
    lang: 'javascript',
    args: [],
    code: 'const greeting = "{{greeting}}";\nconsole.log(greeting);'
  },
  meta: {
    isMultiLine: true
  }
}
```

## Handling

The `runCode` subtype is used to:

1. Execute code in various programming languages
2. Pass arguments to parameterize code execution
3. Capture and process code output
4. Integrate variable values from the current Mlld scope

The code execution environment depends on the specified language and the available language runtime in the host environment. The implementation may use sandboxing or other security mechanisms to ensure safe execution.

## Supported Languages

The exact set of supported languages may vary by implementation, but common languages include:

- JavaScript
- Python
- Bash/Shell
- Ruby
- PHP

## Related Directives

- [@run](./run.md): Parent directive with overview of all subtypes
- [@exec](./exec.md): Defines reusable commands/code that can be executed via `@run $commandName`