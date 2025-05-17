# Meld Directive Types and Examples

This document provides a reference of all directive types with their formal type names and example syntax.

## Add

### Path

#### AddPathDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@add [file.md # Section 1]
```

```
@add [file.md]
```

### Section

#### AddSectionDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@add "# Original Title" from [file.md] as "# New Title"
```

```
@add "# Section Title" from [file.md]
```

### Template

#### AddTemplateDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@text variable = "value"
```

```
@add [[
Content with {{variable}}

And some more content

Hey, here's the same variable again: {{variable}}
]]
```

```
@text variable = "value"
```

```
@add [[Content with {{variable}}]]
```

```
@add [[This is template content]]
```

### Variable

#### AddVariableDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@text variableName = "hello world"
```

```
@add @variableName
```

## Data

### Array

#### DataArrayDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@data items = [1, "two", { name: "three" }, [4, 5]]
```

```
@add @items[2].name
```

```
@data colors = ["red", "green", "blue"]
```

```
@add @colors[0]
```

### Directive

#### DataDirectiveDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@data result = @run echo "Command output"
```

```
@add @result
```

### Object

#### DataObjectDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@data config = {
  server: {
    port: 8080,
    host: "localhost"
  },
  debug: true
}
```

```
@add @config.server.port
```

```
@data user = { "name": "John", "age": 30 }
```

```
@add [[
{{user.name}} is {{user.age}}.
]]
```

### Primitive

#### DataPrimitiveDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@data isEnabled.value = true
```

```
@add @isEnabled.value
```

```
@data number.count = 42
```

```
@add @number.count
```

```
@data greeting.text = "Hello, world!"
```

```
@add @greeting.text
```

## Exec

### Code

#### ExecCodeDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@text name = "bob smith"
```

```
@exec format (name) = javascript [
  // Format the name with title case
  const words = name.split(' ');
  const titled = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1).toUpperCase();
  });
  return titled.join(' ');
]
@run @format("bob smith")
```

```
@text a = "1"
```

```
@text b = "2"
```

```
@exec sum (a, b) = javascript [console.log(Number(a) + Number(b));]
```

```
@run @sum (1, 2)
```

### Command

#### ExecCommandDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@exec greet (name) = @run [echo "Hello, @name!"]
```

### Reference

#### ExecReferenceDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@exec echo (text) = @run [echo "@text"]
```

```
@exec greet (name) = @run @echo["Hello, @name!"]
```

```
@run @greet("World")
```

## Import

### All

#### ImportAllDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@path configPath = [config.mld]
```

```
@import {*} from [@configPath]
```

```
@add @greeting
```

```
@add @count
```

```
@import {*} from [config.mld]
```

```
@add @greeting
```

```
@add @count
```

### Selected

#### ImportSelectedDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@import {greeting, count} from [utils.mld]
```

```
@add @greeting
```

```
@add @count
```

## Invalid

### Text

#### InvalidTextDirectiveNode type:
```typescript
// Type definition not available
```

#### No examples found.

## Path

### Assignment

#### PathAssignmentDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@path absPath = [/absolute/path/to/file.ext]
```

```
@add [[The absolute path is {{absPath}}]]
```

```
@path projectSrc = [@./src]
```

```
@add [[The project source is {{projectSrc}}]]
```

```
@path homeConfig = [@~/config]
```

```
@add [[The config is {{homeConfig}}]]
```

```
@text username = "john"
```

```
@path userConfig = [config/@username/settings.json]
```

```
@add [[The user config is at {{userConfig}}]]
```

```
@path docsDir = [file.md]
```

```
@add @docsDir
```

## Run

### Code

#### RunCodeDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@run javascript [
function greet() {
  return "Hello from multiline code";
}
console.log(greet());
]
```

```
@run javascript [console.log("Hello from code")]
```

### Command

#### RunCommandDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@run [bash -c "echo Line 1 && \
echo Line 2"]
```

```
@run echo "Hello from command"
```

### Exec

#### RunExecDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@exec greetCommand(param) = @run [echo "Hello, {{param}}"]
```

```
@run @greetCommand("World")
```

```
@exec greetCommand = echo "Hello from predefined command"
```

```
@run @greetCommand
```

## Snapshots

## Text

### Assignment

#### TextAssignmentDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@text greeting = "Hello, world!"
```

```
@add @greeting
```

### Assignment Add

#### TextAssignmentAddDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@text content = @add [path/to/file.md]
```

### Assignment Run

#### TextAssignmentRunDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@text result = @run [echo "Command output"]
```

```
@add @result
```

### Path

#### TextPathDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@text content = "file.md"
```

```
@add @content
```

### Template

#### TextTemplateDirectiveNode type:
```typescript
// Type definition not available
```

#### Valid examples:

```
@text multiline = [[
This is a
multi-line template
with {{variable}}
]]
```

```
@add @multiline
```

```
@text template = [[This is a template with {{variable}}]]
```

```
@add @template
```

