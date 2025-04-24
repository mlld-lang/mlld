# @import Directive: Understanding and Implementation

## Core Concept: Importing Definitions

The primary purpose of the `@import` directive is to load definitions (Text, Data, Path variables, and Commands defined via `@define`) from an external Meld file (`.mld`) into the current file's execution context (State).

**Crucially, `@import` does *not* embed the *content* of the imported file.** It only makes the *definitions* created within that file available to the importing file.

## Syntax

Meld supports the following syntax:

```meld
@import [path/to/file.mld]                           // Import all definitions
@import [*] from [path/to/file.mld]                  // Import all (equivalent)
@import [var1, $pathVar] from [path/to/file.mld]        // Import specific definitions
@import [var1 as alias1, $cmd as $myCmd] from [path.mld] // Import with aliases
```

- Paths can use variables (`$PROJECTPATH`, other `@path` variables).
- Selective imports use a comma-separated list within `[...]`.
- Aliases use `as` (e.g., `var1 as myVar1`).

## Core Implementation (`ImportDirectiveHandler`)

The handler executes the following steps:

1.  **Validate Syntax**: Checks the directive structure (`ValidationService`).
2.  **Resolve Path**: Determines the absolute path to the target `.mld` file, resolving any variables in the path string (`ResolutionService`).
3.  **Check Existence**: Verifies the target file exists (`FileSystemService`).
4.  **Check Circularity**: Uses `CircularityService.beginImport()` with a *normalized* path (forward slashes) to register the start of the import and detect loops. Throws an error if a circular dependency is found.
5.  **Read File**: Reads the content of the target `.mld` file (`FileSystemService`).
6.  **Interpret Imported File**: This is a key step. The `ImportDirectiveHandler` obtains an `InterpreterServiceClient` and calls its `interpret` method on the *content* of the imported file. This runs the full Meld pipeline (parsing, directive handling) on the imported file in isolation, producing a new, temporary `IStateService` instance (`resultState`) containing all the definitions created by *that* file.
7.  **Merge State**: Definitions are copied from the `resultState` (imported file's state) into the `targetState` (the current file's state) using `StateVariableCopier`:
    *   If `*` or no specific imports are listed, `copyAllVariables` is used.
    *   If specific variables/aliases are listed, `copySpecificVariables` is used.
    *   This copies Text, Data, Path variables, and Commands.
    *   If a definition with the same name already exists in `targetState`, it is **overwritten** (last import wins).
8.  **End Circularity Check**: `CircularityService.endImport()` is called with the normalized path.
9.  **Output**: In transformation mode, the `@import` line is removed. Otherwise, the modified `targetState` (containing the newly imported definitions) is effectively passed on.

## Key Implementation Aspects & Considerations

*   **Interpretation and State Merging**: `@import` first triggers a full interpretation of the target file's content using the `InterpreterService`. This execution happens in an isolated, temporary state context. Directives within the imported file (`@text`, `@data`, `@run`, even other `@import`s) are processed, populating this temporary state. After interpretation completes, the `@import` handler copies the *final definitions* (Text, Data, Path variables, and Commands) from the temporary state into the *current* file's state using `StateVariableCopier`, respecting any selective import lists or aliases. The content or intermediate state changes of the imported file are not directly included, only the final definitions are merged.
*   **State Isolation & Merging**: Interpretation happens in a temporary child state. Only the *final* definitions from that state are merged back into the current file's state. Intermediate state changes within the imported file are effectively discarded after the definitions are copied.
*   **`StateVariableCopier`**: This utility is responsible for the actual transfer of definitions between the imported state and the target state, handling selective imports and aliases.
*   **`CircularityService`**: Essential for preventing infinite loops. Relies on consistent path normalization.
*   **Error Handling**: The handler anticipates file-not-found, circular references, parsing/interpretation errors within the imported file, and variable-not-found errors during selective imports.
*   **Performance**: Importing many files or files with heavy processing could impact performance due to the full interpretation step for each import.

## Validation Criteria

A correct `@import` implementation ensures:
- All definition types (Text, Data, Path, Command) are importable.
- Selective imports bring only the specified definitions.
- Aliases work correctly.
- Circular imports are reliably detected and prevented.
- Definitions from the imported file are correctly merged into the current state, overwriting existing ones if names conflict.
- Errors during the import process (file not found, parse errors in imported file) are handled gracefully.
- The `@import` directive itself produces no text output in the final document. 