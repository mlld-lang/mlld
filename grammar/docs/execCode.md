# Exec Code Subtype

The `execCode` subtype of the `@exec` directive defines reusable code snippets in specific programming languages that can be executed using the `@run` directive. It provides a way to create code templates that can be parameterized and reused throughout a Meld document.

## Syntax

```meld
@exec commandName = @run language [code]
@exec commandName (param1, param2) = @run language [code using param1 and param2]
```

Where:
- `commandName`: An identifier for the code definition
- `param1, param2`: Optional parameters that can be referenced in the code
- `language`: The programming language identifier (e.g., 'javascript', 'python', 'bash')
- `code`: The code to execute in the specified language

Note: The space between command name and parameters is optional but preferred in documentation.

## AST Structure

The `execCode` subtype nodes have this structure:

```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCode',
  values: {
    identifier: TextNodeArray,     // Command name
    params: VariableNodeArray[],   // Parameter placeholders, may be empty
    metadata?: TextNodeArray,      // Optional metadata information
    lang: TextNodeArray,           // Language identifier
    code: ContentNodeArray         // Code content
  },
  raw: {
    identifier: string,            // Raw command name
    params: string[],              // Raw parameter names, may be empty array
    metadata?: string,             // Raw metadata string
    lang: string,                  // Raw language name
    code: string                   // Raw code text
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

### Basic Code Definition

```meld
@exec greet = @run javascript [
  console.log("Hello, world!");
]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCode',
  values: {
    identifier: [{ type: 'Text', content: 'greet' }],
    params: [],
    lang: [{ type: 'Text', content: 'javascript' }],
    code: [{ type: 'Text', content: 'console.log("Hello, world!");' }]
  },
  raw: {
    identifier: 'greet',
    params: [],
    lang: 'javascript',
    code: 'console.log("Hello, world!");'
  },
  meta: {
    parameterCount: 0
  }
}
```

### Parameterized Code Definition

```meld
@exec formatJson (data, style) = @run python [
  import json
  data_obj = json.loads(data)
  print(json.dumps(data_obj, indent=4 if style == "pretty" else None))
]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCode',
  values: {
    identifier: [{ type: 'Text', content: 'formatJson' }],
    params: [
      [{ type: 'VariableReference', identifier: 'data' }],
      [{ type: 'VariableReference', identifier: 'style' }]
    ],
    lang: [{ type: 'Text', content: 'python' }],
    code: [{
      type: 'Text',
      content: 'import json\ndata_obj = json.loads(data)\nprint(json.dumps(data_obj, indent=4 if style == "pretty" else None))'
    }]
  },
  raw: {
    identifier: 'formatJson',
    params: ['data', 'style'],
    lang: 'python',
    code: 'import json\ndata_obj = json.loads(data)\nprint(json.dumps(data_obj, indent=4 if style == "pretty" else None))'
  },
  meta: {
    parameterCount: 2
  }
}
```

### Code with Variable Interpolation

```meld
@exec processTemplate = @run javascript [
  const template = "{{template}}";
  console.log(`Processing template: ${template}`);
]
```

AST:
```typescript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'execCode',
  values: {
    identifier: [{ type: 'Text', content: 'processTemplate' }],
    params: [],
    lang: [{ type: 'Text', content: 'javascript' }],
    code: [
      { type: 'Text', content: 'const template = "' },
      { type: 'VariableReference', identifier: 'template' },
      { type: 'Text', content: '";\nconsole.log(`Processing template: ${template}`);' }
    ]
  },
  raw: {
    identifier: 'processTemplate',
    params: [],
    lang: 'javascript',
    code: 'const template = "{{template}}";\nconsole.log(`Processing template: ${template}`);'
  },
  meta: {
    parameterCount: 0
  }
}
```

## Handling

The `execCode` subtype is used to:

1. Define reusable code snippets in various programming languages
2. Create parameterized code templates that can be executed with arguments
3. Organize and centralize complex logic

When code is defined with `@exec`, it becomes available for execution using the `@run $commandName` syntax. Any parameters defined in the code definition are replaced with the arguments provided when the code is executed.

## Parameter Handling

Parameters defined in the code definition are made available as variables in the code's execution environment. The exact mechanism for passing parameters depends on the language and execution environment, but typically they are provided as variables with the same names as the parameters.

## Supported Languages

The exact set of supported languages may vary by implementation, but common languages include:

- JavaScript
- Python
- Bash/Shell
- Ruby
- PHP

## Related Directives

- [@exec](./exec.md): Parent directive with overview of all subtypes
- [@run](./run.md): Executes code snippets, including those defined by `@exec`