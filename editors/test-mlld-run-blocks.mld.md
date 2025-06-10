# Test mlld-run Code Block Syntax Highlighting

This file tests the new `mlld-run` code block syntax highlighting feature for .mld.md executable documentation.

## Regular mlld Code Block (Documentation Only)

```mlld
@text greeting = "Hello from documentation!"
@data config = {"theme": "dark", "version": "1.0"}
@run [echo "This is documentation only"]
```

## mlld-run Code Block (Executable)

```mlld-run
@text greeting = "Hello from executable code!"
@data config = {"theme": "light", "version": "2.0"}
@run [echo "This will execute when processed"]
@add @greeting
```

## Multiple mlld-run Blocks

```mlld-run
@text name = "Test User"
@text email = "test@example.com"
@data user = {"name": @name, "email": @email}
```

```mlld-run
@text template = [[User: {{user.name}} ({{user.email}})]]
@add @template
```

## Testing All mlld Features in mlld-run

```mlld-run
@import { utils } from "./helpers.mld"
@path config = "./config.json"
@text welcome = [[Welcome, {{name}}!]]
@exec greet(name) = @run [echo "Hello, @name!"]
@when @config.debug => @run [echo "Debug mode enabled"]
@output @welcome to "./output.txt"
```

## Mixed Content

This is regular markdown text.

```mlld-run
@text mixed = "This should be highlighted as mlld"
@add @mixed
```

And more markdown content here.

## Edge Cases

```mlld-run
@text comment_test = "Testing comments" >> This is a comment
@text variable_test = @config.value
@text template_test = [[Hello {{name}} with {{config.theme}} theme]]
@run [echo "Command with @variable_test"]
```

```mlld-run
@data array = [1, 2, 3]
@data object = {
  "key": "value",
  "nested": {
    "item": true
  }
}
```