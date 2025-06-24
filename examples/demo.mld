/import { * } from "files/imports.mld"

/var @title = "Meld API Demo"
/var @author = "Meld Team"
/var @date = "2025-02-25"
/var @metadata = {
version: "1.0.0",
description: "A comprehensive demonstration of Meld capabilities",
tags: ["demo", "api", "documentation"]
}

/var @intro_content = [[
# {{title}}

**Author:** {{author}}  
**Date:** {{date}}  
**Version:** {{metadata.version}}

## Introduction

This document demonstrates the core capabilities of Meld, a directive-based scripting language for embedding small "@directives" inside plain text documents.
]]

/show @intro_content

## Text Variables

/var @greeting = "Hello"
/var @name = "World"
/var @message = [[{{greeting}}, {{name}}!]]

Text variables can be defined and referenced:
- Greeting: @greeting
- Name: @name
- Combined: @message

## Imports 

You can import things from other meld files like variables and defined commands.

Then you can add them in this one: 

/show @task

## Data Variables

/var @config = {
app: {
name: "Meld Demo",
version: "1.0.0",
features: ["text", "data", "path", "import", "add", "run", "exec"]
  },
env: "production"
}

/var @data_content = [[
Data variables store structured data:
- App name: {{config.app.name}}
- Version: {{config.app.version}}
- Environment: {{config.env}}
- Features count: {{config.app.features}}
]]

/show @data_content

## Path Variables

/path @docs = "./docs"
/path @config = "./config"
/path @projectRoot = @./

Path variables for file system references:
- Documentation path: @docs
- Configuration path: @config
- Project root: @projectRoot

## Command Execution

/run {echo "This is output from a shell command"}

/exe @greet = {echo "Hello from an exec command"}
/run @greet

/var @user = "Alice"
/exe @greet_user(name) = {echo "Hello, @name!"}
The output of this command will be included in the output:
/run @greet_user(@user)

## File Operations

Here's how to add content from a file:

/show [imports.mld]

## Code Fences

Code fences preserve content exactly as written:

```python
# This is a Python code block
def hello():
    # @text not_a_directive = "This is not interpreted"
    print("Hello, World!")
    # @greeting is not replaced
```

```javascript
>> This is a JavaScript code block
function greet() {
 // Directives inside code fences are preserved as-is
 // @data config = { key: "value" }
  console.log("Hello!");
}
```

## Nested Code Fences

````
Outer fence
```
Inner fence with @greeting (not replaced)
```
Still in outer fence
````

## Complex Example

/var @section = "Complex Example"
/var @items = [
  { name: "Item 1", value: 100 },
  { name: "Item 2", value: 200 },
  { name: "Item 3", value: 300 }
]

/exe @calculateTotal = run javascript {[
const values = [100, 200, 300};
return values.reduce((a, b) => a + b, 0);
]]

/var @complex_template = [[
Here's how you might represent data:

| Item | Value |
|------|-------|
| {{items[0].name}} | {{items[0].value}} |
| {{items[1].name}} | {{items[1].value}} |
| {{items[2].name}} | {{items[2].value}} |

Total value: {{calculateTotal}}
]]

## Templating

/var @template = [[
This is a multi-line
template with variable
interpolation: {{greeting}}, {{name}}!

Data reference: {{config.app.name}}
]]

/show @template

/show @complex_template

## Conclusion

This demo shows the core capabilities of Meld:
- Variable definitions (@text, @data, @path)
- Command execution (@run, @exec)
- File operations (@add, @import)
- Code fences for literal content
- Variable interpolation in templates ({{greeting}}, {{config.app.features}})

All of these features are available through the Meld API.