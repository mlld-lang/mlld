# Text Assignment Directive

The `textAssignment` subtype of the Text directive assigns a value to a variable using the syntax: `text variable = value`.

## Syntax

```
text identifier = value
```

Where:
- `identifier`: A valid variable name
- `value`: Can be one of:
  - A literal string: `"content"` or `'content'` or `"""multiline content"""`
  - An embed source: `@embed path/to/file.txt`
  - A run command: `@run echo "Hello, world!"`
  - An API call: `@call api.method parameters`

## AST Structure

```typescript
interface TextAssignmentDirectiveNode {
  type: 'Directive';
  kind: 'text';
  subtype: 'textAssignment';
  values: {
    identifier: VariableReferenceNode[];
    content: (TextNode | VariableReferenceNode)[];
    source?: 'literal' | 'embed' | 'run' | 'call';
  };
  raw: {
    identifier: string;
    content: string;
  };
  meta: {
    // Metadata based on the value source
  };
}
```

## Variants

### Literal Text

The most common form, assigning a literal string to a variable.

```
text greeting = "Hello, world!"
```

AST structure specific to literals:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: [/* Text nodes with potential variable interpolation */],
    source: 'literal'
  }
}
```

### Embed Source

Assigns the content of a file to a variable using `@embed`.

```
text content = @embed path/to/file.txt
```

AST structure specific to embed:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: [/* Processed content after embedding */],
    source: 'embed'
  },
  meta: {
    embed: {
      // Embed-specific metadata
      path: {
        isAbsolute: boolean,
        hasVariables: boolean,
        // ... other path metadata
      }
    }
  }
}
```

### Run Command

Assigns the output of a command to a variable using `@run`.

```
text result = @run echo "The current directory is: $PWD"
```

AST structure specific to run:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: [/* Processed content after running command */],
    source: 'run'
  },
  meta: {
    run: {
      // Run-specific metadata
      command: string,
      // ... other run metadata
    }
  }
}
```

### API Call

Assigns the result of an API call to a variable using `@call`.

```
text response = @call api.fetchData parameters
```

AST structure specific to call:
```typescript
{
  values: {
    identifier: [/* Variable reference node */],
    content: [/* Processed content after API call */],
    source: 'call'
  },
  meta: {
    call: {
      api: string,
      method: string,
      // ... other call metadata
    }
  }
}
```

## Examples

Simple literal:
```
text greeting = "Hello, world!"
```

With interpolation:
```
text name = "John"
text greeting = "Hello, {{name}}!"
```

Multi-line content:
```
text message = """
This is a multi-line
text value with
several lines.
"""
```

Embed a file:
```
text content = @embed ./README.md
```

Run a command:
```
text files = @run ls -la
```