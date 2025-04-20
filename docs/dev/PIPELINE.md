# Meld Pipeline Flow

## Overview

The Meld pipeline processes `.mld` files through several stages to produce either `.xml` or `.md` output. Here's a detailed look at how it works:

```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Service    │     │   Service   │     │   Pipeline   │     │    Final     │
│Initialization├────►│ Validation  ├────►│  Execution   ├────►│   Output     │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
      │                    │                    │                    │
      ▼                    ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│Dependencies │     │Validate All │     │Process Input │     │Generate Clean│
│  Resolved   │     │ Services    │     │   Content    │     │   Output    │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```

## Service Organization

The pipeline is organized into logical service groups, with strict initialization order and dependency validation:

### Pipeline Services (services/pipeline/)
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Parser    │     │  Directive  │     │ Interpreter  │     │   Output     │
│   Service   ├────►│   Service   ├────►│   Service    ├────►│   Service    │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
      │                    │                    │                    │
      ▼                    ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│Initialize & │     │Validate &   │     │Interpret AST │     │Format &     │
│  Validate   │     │Process Dirs │     │Update State  │     │Generate Out │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```

### State Services (services/state/)
```ascii
┌─────────────┐     ┌─────────────┐
│    State    │     │    State    │
│   Service   ├────►│    Event    │
└─────────────┘     │   Service   │
                    └─────────────┘
```

### Resolution Services (services/resolution/)
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│ Resolution  │     │ Validation  │     │ Circularity  │
│   Service   ├────►│   Service   ├────►│   Service    │
└─────────────┘     └─────────────┘     └──────────────┘
```

### File System Services (services/fs/)
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│    File     │     │    Path     │     │     Path     │
│   System    ├────►│   Service   ├────►│  Operations  │
│   Service   │     │             │     │   Service    │
└─────────────┘     └─────────────┘     └──────────────┘
```

## Detailed Flow

1. **Service Initialization** (`core/types/dependencies.ts`)
   ```ascii
   ┌─────────────┐
   │Load Service │
   │Dependencies │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │Initialize in│
   │   Order    │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  Validate   │
   │  Services   │
   └─────────────┘
   ```
   - Resolves service dependencies
   - Initializes in correct order
   - Validates service configuration
   - Enables transformation if requested

2. **Input Processing** (`CLIService`)
   - User runs `meld prompt.mld`
   - `CLIService` handles command line options
   - Default output is `.xml` format
   - Can specify `--format markdown` for `.md` output
   - Supports `--stdout` for direct console output

3. **Parsing** (`ParserService`)
   ```ascii
   ┌─────────────┐
   │  Raw Text   │
   │   Input     │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  meld-ast   │
   │   Parser    │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │ MeldNode[]  │
   │  Rich AST   │  ← Context-aware: `{{...}}` only becomes `VariableReferenceNode`
   └─────────────┘    where allowed. Directives contain `InterpolatableValue` arrays.
   ```
   - Reads the input file content
   - Parses into a rich, **context-aware** AST using `@core/ast`.
   - Variable syntax (`{{...}}`, `$var`) is parsed as `VariableReferenceNode` only in contexts where interpolation is allowed (e.g., directive values, certain string literals). Otherwise, it remains literal text within `TextNode`s.
   - Directive values (like strings, paths) that support interpolation are parsed into `InterpolatableValue` arrays (sequences of `TextNode` and `VariableReferenceNode`).
   - Adds source location information.
   - **Adds a unique `nodeId` to every AST node.**

4. **Interpretation** (`InterpreterService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │ MeldNode[]  │     │  Directive  │
   │  Rich AST   ├────►│   Service   │ ← Handles nodes with `InterpolatableValue` etc.
   └─────────────┘     └──────┬──────┘
                              │
                              ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
   │ Resolution  │◄────┤   Handler   │     │ ParserServiceClient │ ← Used by Interpreter
   │   Service   │     │(with node   │     └─────────────────────┘   to parse TextNode content
   └──────┬──────┘     │replacements)│               ▲
          │            └──────┬──────┘               │
          │                   │                      │
          ▼                   ▼                      ▼
   ┌─────────────┐     ┌────────────────────────────────────────────────────────────┐
   │    State    │     │ Interpreter Service                                        │
   │   Service   │◄────┤ - Applies stateChanges from DirectiveResult                │
   │(Original &  │     │ - Handles node replacements from DirectiveResult           │
   │Transformed) │     │ - **Resolves `{{...}}` in TextNode content (using Parser + │
   └─────────────┘     │   Resolution) BEFORE adding node to state**                │
                       └────────────────────────────────────────────────────────────┘

   ```
   - Processes each rich AST node sequentially.
   - For `TextNode`s:
     - Checks if `content` contains `{{...}}`.
     - If yes, uses `ParserServiceClient` to parse the content into an `InterpolatableValue` array.
     - Uses `ResolutionService` to resolve the `InterpolatableValue` array to a final string.
     - Adds a new `TextNode` with the *resolved* content to the state.
     - If no `{{...}}`, adds the original `TextNode` to the state.
   - For `DirectiveNode`s:
     - Routes directives to appropriate handlers via `DirectiveService`.
     - Handlers process structured directive data (e.g., `InterpolatableValue`) and use `ResolutionService` as needed.
     - Handlers return a `DirectiveResult` which may include replacement nodes and/or `stateChanges`.
     - `DirectiveService` applies the `stateChanges` from the `DirectiveResult` to the `StateService`.
     - `InterpreterService` applies node replacements (if any) to the transformed AST.
   - Handles file imports and embedding.

5. **Output Generation** (`OutputService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │Transformed  │     │   Format    │
   │ Rich AST &  ├────►│  Converter  │
   │   State     │     └──────┬──────┘
   └─────────────┘            │
                              ▼
   ┌─────────────┐     ┌─────────────┐
   │Clean Output │◄────┤  Formatted  │ ← TextNode content is PRE-RESOLVED now
   │(No Directive│     │   Output    │
   │Definitions) │     └─────────────┘
   └─────────────┘
   ```
   - Takes the final (transformed) rich AST and state.
   - Converts to requested format (markdown, llm-xml).
   - **Treats `TextNode` content as pre-resolved (resolution handled by `InterpreterService`)**. It focuses on formatting, not variable substitution within text.
   - Uses `VariableReferenceResolverClient` for detailed field/value processing during conversion (e.g., formatting complex objects/arrays).
   - Writes output to file or stdout.

## Transformation Mode and Variable Resolution

When transformation mode is enabled, the pipeline handles directives and variables in a special way. Understanding this flow is critical for debugging and enhancing directive handlers:

```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Directive  │     │Interpretation│     │   State      │     │   Output     │
│  Handlers   ├────►│  & Node     ├────►│  Variable    ├────►│  Generation  │
│(with replace│     │Transformation│     │  Resolution  │     │ (Formatting) │
│  nodes)     │     │              │     │ (TextNodes)  │     │              │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```

### Key Transformation Pipeline Concepts

1. **Directive Handler Replacement Nodes**
   - Directive handlers can return replacement nodes when in transformation mode.
   - The InterpreterService must properly apply these replacements in the transformed nodes array.
   - For import directives, the replacement is typically an empty text node.
   - For embed directives, the replacement node contains the embedded content.

2. **State Propagation Across Boundaries**
   - Variables must be explicitly copied between parent and child states using mechanisms like `StateVariableCopier`.
   - When importing files, variables must be copied from imported state to parent state (`ImportDirectiveHandler`).

3. **Variable Resolution Process**
   - Variables can be resolved at multiple stages:
     - During directive processing by handlers (using `ResolutionService` on `InterpolatableValue` arrays or `VariableReferenceNode`s from the AST).
     - **During interpretation (`InterpreterService`) for `{{...}}` references within plain `TextNode` content.**
   - `OutputService` **does not** perform variable resolution on `TextNode` content; it expects pre-resolved text. It may use `VariableReferenceResolverClient` for formatting complex values during final output generation.