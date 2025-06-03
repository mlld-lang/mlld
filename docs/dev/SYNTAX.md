# Mlld Syntax Guide

Mlld is a modular prompt scripting language designed for dynamic prompt creation by integrating content from files, command outputs, and other Mlld scripts. It reads scripts synchronously from top to bottom.

### Directives and variable types reference

Variables have a VariableType of `text`, `data`, `path`, and `command`.

`@add` subtypes are `embedPath`, `embedVariable`, `embedTemplate`:
```
@add [path/to/file.md] <-- embedPath
@add {{variable}} <-- embedVariable
@add [[Template with {{variables}}]] <-- embedTemplate
```
`@run` subtypes are `runCommand`, `runDefined`, `runCode`, `runCodeParams`:
```
@run [(echo "hello world")] <-- runCommand
@run [(echo {{variable}})] <-- runCommand (but using variables)
@run $mycommand ({{param}}, {{variable}}) <-- runDefined
@run python [(print("Hello world")] <-- runCode
@run python ({{variable}}) [ print(variable} ] <-- runCodeParams
```
`@import` subtypes are `importAll`, `importStandard`, `importNamed`:
```
@import [*] from [file.mld] <-- importAll
@import [file.mld] <-- importStandard (implicit version of importAll)
@import [variable as var] from [file.mld] <-- importNamed
```

## Key Concepts & Common Gotchas

Understanding these two points is crucial for working effectively with Mlld:

1.  **Variable Interpolation Scope:** Variables (e.g., `{{my_var}}`) are **only** interpolated *within* the arguments of `@directive` lines. They are **not** automatically substituted in plain text outside of directives.

    *   **Incorrect:**
        ```mlld
        @text greeting = "Hello"
        {{greeting}} World! 
        ```
        Output: `{{greeting}} World!`

    *   **Correct:** Use `@add` for templating plain text:
        ```mlld
        @text greeting = "Hello"
        @add [[
        {{greeting}} World!
        ]]
        ```
        Output: `Hello World!`

2.  **Directive Syntax Variations:** The behavior of `@add` and `@run` changes based on the syntax used (e.g., `[...]` vs `[[...]]` vs `{{...}}`).

## Directives Deep Dive

### `@text`, `@path`, `@data`

These define variables of different types.

```mlld
@text message = "Some text"
@path config_file = "./config.json"
@data user = {"name": "Alex", "id": 123}

# Usage (within another directive):
@add [[User name is {{user.name}}]]
```

### `@add`: Including Content

Used to bring external content or template strings into your script.

*   **`@add [path/to/file]`**: Embeds the entire content of a file.
    ```mlld
    @add [./README.md]
    ```
*   **`@add [path/to/file # Section Header]`**: Embeds a specific section from a Markdown file.
    ```mlld
    @add [./docs/ARCHITECTURE.md # Overview]
    ```
*   **`@add {{variable}}`**: Embeds the content of a variable (which might hold file paths or text).
    ```mlld
    @path doc_path = "./README.md"
    @add {{doc_path}}
    ```
*   **`@add [[Template with {{variables}}]]`**: Embeds a literal template string, interpolating any variables within it.
    ```mlld
    @text name = "Mlld"
    @add [[Welcome to {{name}}!]]
    ```

### `@run`: Executing Commands & Code

Used to execute shell commands, predefined commands, or code blocks.

*   **`@run [(command arg1 arg2)]`**: Runs a shell command.
    ```mlld
    @run [(ls -l)]
    ```
*   **`@run [(command {{variable}})]`**: Runs a shell command, interpolating variables.
    ```mlld
    @path target_dir = "."
    @run [(ls {{target_dir}})]
    ```
*   **`@run $definedCommand(param1, {{var2}})`**: Runs a command previously defined with `@exec`.
    ```mlld
    @exec greet(name) = @run [(echo "Hello, {{name}}!")]
    @run $greet(MlldUser)
    ```
*   **`@run language [ code block ]`**: Executes a block of code in the specified language (e.g., `python`, `bash`).
    ```mlld
    @run python [(print("Hello from Python!"))]
    ```
*   **`@run language ({{var1}}, param2) [ code block using var1, param2 ]`**: Executes a code block, passing variables/parameters into the code's scope.
    ```mlld
    @text message = "dynamic message"
    @run python ({{message}}) [ print(message) ] 
    ```

### `@import`

Imports variables and defined commands from other Mlld files.

```mlld
# utils.mld
@text util_message = "Shared utility message"
@exec util_command(arg) = @run [(echo "Util: {{arg}}")]

# main.mld
@import [./utils.mld]
@add [[{{util_message}}]]
@run $util_command("Test")
```

### `@exec`

Creates reusable, parameterized commands.

```mlld
@exec list_files(dir, pattern) = @run [(find {{dir}} -name "{{pattern}}")]

@run $list_files(".", "*.md") 
```

This document covers the core syntax. Refer to specific examples and the codebase for more advanced usage.


