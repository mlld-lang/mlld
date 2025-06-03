// TODO: UPDATE

# @exec Directive: Understanding and Implementation

## Core Concept: Creating Reusable Command Templates

The `@exec` directive allows you to create named, reusable templates for runnable commands (both shell commands and language scripts). These templates can accept parameters, making them function like simple macros or functions within Mlld.

Defined commands are invoked using the `@run $commandName(...)` syntax.

## Syntax

There are two primary forms:

**1. Defining Basic Commands (Shell Commands):**

```mlld
@exec commandName(param1, param2) = @run [(command template with {{param1}} and {{param2}})]

// Or for multiline commands:
@exec multiCmd(arg) = @run [([
  echo "Starting script with {{arg}}"
  ./run_script.sh {{arg}}
)]]
```

- **`commandName`**: The identifier (no `$`) used to invoke the command later with `@run $commandName(...)`.
- **`(param1, param2)`**: An optional list of parameter names, acting as placeholders within the command template.
- **`=`**: Separator.
- **`@run [(...)]` or `@run [([...)]]`**: The right-hand side **must** be a `BasicCommand` `@run` directive. This defines the shell command template to be executed.

**2. Defining Language Commands (JS, Python, Bash):**

```mlld
@exec jsCommand(name, value) = @run js(name, value) [[
  // Raw JavaScript code using parameters name & value
  console.log(`Processing ${name}: ${value}`);
  // Note: {{variables}} are NOT interpolated here
]]

@exec pyCommand(inputPath) = @run python(inputPath) [[
# Raw Python code
import sys
input_file = sys.argv[1]
print(f"Processing {input_file}")
# ...
]]
```

- **`commandName`**: Identifier for the language command.
- **`(param1, ...)`**: Parameters expected by the language script.
- **`@run language(...) [[...]]`**: The right-hand side **must** be a `LanguageCommand` `@run` directive. This defines the language, the parameters it accepts, and the *raw code block* to be executed.

## Command Template Body (for Basic Commands)

When defining a Basic Command template (`@run [(...)]` or `@run [([...)]]`):

- **Shell Command**: It should be a valid shell command string.
- **Parameter Placeholders**: It can contain `{{param1}}`, `{{param2}}`, etc., corresponding to the parameters defined in the parentheses `(...)`. These will be replaced by the arguments provided when the command is invoked via `@run $commandName(...)`.
- **Other Variables**: It can also contain standard Mlld variable references (`{{globalVar}}`, `$pathVar`). These are *not* resolved when `@exec` is processed; they are resolved *at the time the command is executed* via `@run`.
- **Multiline Syntax (`[[...]]`)**: If using double brackets, the first newline immediately following `[[` is ignored.

## Language Code Block (for Language Commands)

When defining a Language Command template (`@run language(...) [[...]]`):

- **Raw Code**: The content within `[[...]]` is treated as **raw source code** for the specified language (js, python, bash).
- **NO Interpolation**: Variables (`{{var}}`, `$path`) inside the `[[...]]` block are **NOT** interpolated. The code is passed directly to the language interpreter.
- **Parameters**: The parameters defined in `@run language(param1, ...)` are passed to the script at runtime (e.g., as command-line arguments).

## Core Implementation (`DefineDirectiveHandler`)

The `@exec` handler primarily acts as a storage mechanism:

1.  **Validate Syntax**: Checks the overall `@exec name(...) = @run ...` structure.
2.  **Extract Components**: Parses the directive to get the `commandName` (without `$`), the list of `parameters` (e.g., `["param1", "param2"]`), and the details of the right-hand `@run` directive (its kind - basic or language, the command template string or code block, the language if applicable).
3.  **Store Definition**: Creates a `CommandDefinition` object containing the `parameters` array and the necessary details from the `@run` directive (e.g., the literal command template string for basic commands, or the language and raw code block for language commands).
4.  **Update State**: Stores this `CommandDefinition` object in the current execution state using `state.setCommand(commandName, commandDefinition)`. Metadata can also be stored.

**Important**: The `@exec` handler does *not* execute anything or resolve variables within the template/code block. It simply stores the definition.

## Interaction with `@run $commandName(...)`

The execution logic resides within the `RunDirectiveHandler` and its `DefinedCommandHandler` subtype:

1.  **Invocation**: `@run $myCmd("argValue1", {{variableArg2}})`
2.  **Retrieve Definition**: Fetches the `CommandDefinition` for `myCmd` from the state.
3.  **Resolve Arguments**: Resolves the arguments (`"argValue1"`, `{{variableArg2}}`) provided in the `@run` call.
4.  **Execution based on Definition Type**:
    *   **If Basic Command Definition**: Substitutes the resolved arguments *positionally* into the stored command template string (replacing `{{param1}}`, `{{param2}}`, etc.). The resulting command string is then executed, resolving any other variables (`{{globalVar}}`, `$pathVar`) at that time.
    *   **If Language Command Definition**: Passes the resolved arguments to the stored language script (e.g., as command-line arguments `sys.argv` in Python, `process.argv` in Node). The raw code block stored in the definition is executed by the appropriate language interpreter.

## Key Implementation Aspects & Considerations

*   **Positional Parameters**: Substitution/passing relies strictly on the order in the `@exec` parameter list and the `@run` argument list.
*   **Delayed Resolution (Basic Commands)**: Variables (`{{globalVar}}`, `$pathVar`) within a basic command template are resolved only when invoked via `@run`.
*   **No Interpolation (Language Commands)**: The code block for language commands is executed raw; use the defined parameters to pass data into the script.
*   **No Direct Output**: `@exec` only modifies state.

## Validation Criteria

A correct `@exec` implementation ensures:
- Both basic and language command definitions are correctly parsed and stored.
- Invocation via `@run` correctly retrieves the definition and identifies its type.
- Arguments passed to `@run` are resolved correctly.
- For basic commands: Positional parameter substitution into the template works reliably, and the final command executes correctly.
- For language commands: Resolved arguments are passed correctly to the script, and the stored code block is executed by the correct interpreter. 