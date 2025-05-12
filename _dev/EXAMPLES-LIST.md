# Examples List for AST Explorer

This document outlines the specific examples needed for each directive type, following the convention-based directory structure:

```
core/examples/
├── directivekind/             # e.g., text, run, import
│   └── directivesubtype/      # e.g., assignment, template
│       ├── example.md         # Base example
│       ├── expected.md        # Expected output for base example
│       ├── example-variant.md # Variant example (e.g., multiline)
│       └── expected-variant.md # Expected output for variant
```

## Text Directive

### text/assignment
- **example.md**:
  ```
  @text greeting = "Hello, world!"
  @add @greeting
  ```
- **expected.md**:
  ```
  Hello, world!
  ```

### text/template
- **example.md**:
  ```
  @text template = [[This is a template with {{variable}}]]
  @add @template
  ```
- **expected.md**:
  ```
  This is a template with value
  ```
- **example-multiline.md**:
  ```
  @text multiline = [[
  This is a
  multi-line template
  with {{variable}}
  ]]
  @add @multiline
  ```
- **expected-multiline.md**:
  ```
  This is a
  multi-line template
  with value
  ```

### text/assignment-run
- **example.md**:
  ```
  @text result = @run [echo "Command output"]
  @add @result
  ```
- **expected.md**:
  ```
  Command output
  ```

### text/path
- **file.md**:
  ```
  Content from file
  ```
- **example.md**:
  ```
  @text content = "file.md"
  @add @content
  ```
- **expected.md**:
  ```
  Content from file
  ```

### text/assignment-add
- **example.md**:
  ```
  @text content = @add [path/to/file.md]
  ```
- **expected.md**:
  ```
  Content from file
  ```

## Run Directive

### run/command
- **example.md**:
  ```
  @run echo "Hello from command"
  ```
- **expected.md**:
  ```
  Hello from command
  ```
- **example-multiline.md**:
  ```
  @run [bash -c "echo Line 1 && \
  echo Line 2"]
  ```
- **expected-multiline.md**:
  ```
  Line 1
  Line 2
  ```

### run/code
- **example.md**:
  ```
  @run javascript [console.log("Hello from code")]
  ```
- **expected.md**:
  ```
  Hello from code
  ```
- **example-multiline.md**:
  ```
  @run javascript [
  function greet() {
    return "Hello from multiline code";
  }
  console.log(greet());
  ]
  ```
- **expected-multiline.md**:
  ```
  Hello from multiline code
  ```

### run/exec
- **example.md**:
  ```
  @exec greetCommand = echo "Hello from predefined command"
  @run @greetCommand
  ```
- **expected.md**:
  ```
  Hello from predefined command
  ```
- **example-parameters.md**:
  ```
  @exec greetCommand(param) = @run [echo "Hello, {{param}}"]
  @run @greetCommand("World")
  ```
- **expected-parameters.md**:
  ```
  Hello, World!
  ```

## Add Directive

### add/template
- **example.md**:
  ```
  @add [[This is template content]]
  ```
- **expected.md**:
  ```
  This is template content
  ```
- **example-variables.md**:
  ```
  @text variable = "value"
  @add [[Content with {{variable}}]]
  ```
- **expected-variables.md**:
  ```
  Content with value
  ```
- **example-multiline.md**:
  ```
  @text variable = "value"
  @add [[
  Content with {{variable}}

  And some more content

  Hey, here's the same variable again: {{variable}}
  ]]
  ```
- **expected-multiline.md**:
  ```
  Content with value

  And some more content

  Hey, here's the same variable again: value
  ```

### add/variable
- **example.md**:
  ```
  @text variableName = "hello world"
  @add @variableName
  ```
- **expected.md**:
  ```
  hello world
  ```

// files that don't contain `example` or `expected` are ignored by ast-explorer, so we can use them for examples.
### add/path
- **file.md**:
  ```
  # Title
  ## Section 1
  ### Subsection 1.1
  Content from file
  ## Section 2
  ```
- **example.md**:
  ```
  @add [file.md]
  ```
- **expected.md**:
  ```
  # Title
  ## Section 1
  ### Subsection 1.1
  Content from file
  ## Section 2
  ```
- **example-section.md**:
  ```
  @add [file.md # Section 1]
  ```
- **expected-section.md**:
  ```
  ## Section 1
  ### Subsection 1.1
  Content from file
  ```

### add/section
- **example.md**:
  ```
  @add "# Section Title" from [file.md]
  ```
- **expected.md**:
  ```
  # Section Title
  Content under this section
  ```
- **example-rename.md**:
  ```
  @add "# Original Title" from [file.md] as "# New Title"
  ```
- **expected-rename.md**:
  ```
  # New Title
  Content under this section
  ```

## Exec Directive

### exec/command
- **example.md**:
  ```
  @exec greet (name) = @run [echo "Hello, @name!"]
  ```
- **expected.md**:
  ```
  @exec greet (name) = @run [echo "Hello, @name!"]
  ```

### exec/code
- **example.md**:
  ```
  @text a = "1"
  @text b = "2"
  @exec sum (a, b) = javascript [console.log(Number(a) + Number(b));]
  @run @sum (1, 2)
  ```
- **expected.md**:
  ```
  3
  ```
- **example-multiline.md**:
  ```
  @text name = "bob smith"
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
- **expected-multiline.md**:
  ```
  Bob Smith
  ```

### exec/reference
- **example.md**:
  ```
  @exec echo (text) = @run [echo "@text"]
  @exec greet (name) = @run @echo["Hello, @name!"]
  @run @greet("World")
  ```
- **expected.md**:
  ```
  Hello, World!
  ```

## Data Directive

### data/primitive
- **example.md**:
  ```
  @data greeting.text = "Hello, world!"
  @add @greeting.text
  ```
- **expected.md**:
  ```
  Hello, world!
  ```
- **example-number.md**:
  ```
  @data number.count = 42
  @add @number.count
  ```
- **expected-number.md**:
  ```
  42
  ```
- **example-boolean.md**:
  ```
  @data isEnabled.value = true
  @add @isEnabled.value
  ```
- **expected-boolean.md**:
  ```
  true
  ```

### data/object
- **example.md**:
  ```
  @data user = { "name": "John", "age": 30 }
  @add [[
  {{user.name}} is {{user.age}}.
  ]]
  ```
- **expected.md**:
  ```
  John is 30
  ```
- **example-nested.md**:
  ```
  @data config = {
    server: {
      port: 8080,
      host: "localhost"
    },
    debug: true
  }
  @add config.server.port
  ```
- **expected-nested.md**:
  ```
  8080
  ```

### data/array
- **example.md**:
  ```
  @data colors = ["red", "green", "blue"]
  @add @colors[0]
  ```
- **expected.md**:
  ```
  red
  ```
- **example-mixed.md**:
  ```
  @data items = [1, "two", { name: "three" }, [4, 5]]
  @add @items[2].name
  ```
- **expected-mixed.md**:
  ```
  three
  ```

### data/directive
- **example.md**:
  ```
  @data result = @run echo "Command output"
  @add @result
  ```
- **expected.md**:
  ```
  Command output
  ```

## Path Directive

### path/assignment
- **example.md**:
  ```
  @path docsDir = [file.md]
  @add @docsDir
  ```
- **expected.md**:
  ```
  Contents of file.md
  ```
- **example-special.md**:
  ```
  @path homeConfig = [@~/config]
  @add [[The config is {{homeConfig}}]]
  ```
- **expected-special.md**:
  ```
  The config is /Users/adam/config
  ```
- **example-project.md**:
  ```
  @path projectSrc = [@./src]
  @add [[The project source is {{projectSrc}}]]
  ```
- **expected-project.md**:
  ```
  The project source is /Users/adam/dev/meld/src
  ```
- **example-variable.md**:
  ```
  @text username = "john"
  @path userConfig = [config/@username/settings.json]
  @add [[The user config is at {{userConfig}}]]
  ```
- **expected-variable.md**:
  ```
  The user config is at /config/john/settings.json
  ```
- **example-absolute.md**:
  ```
  @path absPath = [/absolute/path/to/file.ext]
  @add [[The absolute path is {{absPath}}]]
  ```
- **expected-absolute.md**:
  ```
  The absolute path is /absolute/path/to/file.ext
  ```

## Import Directive

### import/selected
- **utils.mld**:
  ```
  @text greeting = "Hello, world!"
  @data count = 42
  ```
- **example.md**:
  ```
  @import {greeting, count} from [utils.mld]
  @add @greeting
  @add @count
  ```
- **expected.md**:
  ```
  Hello, world!
  42
  ```

### import/all
- **config.mld**:
  ```
  @text greeting = "Hello, world!"
  @data count = 42
  ```
- **example.md**:
  ```
  @import config.mld
  @add @greeting
  @add @count
  ```
- **expected.md**:
  ```
  Hello, world!
  42
  ```
- **example-variable.md**:
  ```
  @import {*} from [config.mld]
  @add @greeting
  @add @count
  ```
- **expected-variable.md**:
  ```
  Hello, world!
  42
  ```

## Implementation Plan

To implement these examples, follow these steps:

1. Create the directory structure for each directive type:
   ```bash
   # Example for creating text directive subdirectories
   mkdir -p core/examples/text/assignment
   mkdir -p core/examples/text/template
   mkdir -p core/examples/text/assignment-run
   mkdir -p core/examples/text/assignment-add
   ```

2. Create the appropriate example and expected files for each subtype.

3. Run the AST processing to generate types:
   ```bash
   npm run ast:process-all
   ```

4. Validate the generated types:
   ```bash
   npm run ast:validate
   ```

5. Test the types in your codebase to ensure they match expectations.

## Next Steps

After implementing these examples, we should:

1. Review the generated TypeScript types for correctness
2. Update any type imports that need manual fixing
3. Create integration tests to verify the directive types work as expected
4. Document the type structure and usage patterns