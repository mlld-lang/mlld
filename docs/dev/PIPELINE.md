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
│Initialize & │     │Validate &   │     │Transform &   │     │Format &     │
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
   │  Rich AST   │  ← Contains structured directive data,
   └─────────────┘    `InterpolatableValue` arrays, `Field[]` access paths
   ```
   - Reads the input file content
   - Parses into a rich AST using `@core/ast`
   - AST nodes include structured data for directives (e.g., `InterpolatableValue` arrays, `Field[]` paths for variables)
   - Adds source location information
   - **Adds a unique `nodeId` to every AST node.**

4. **Interpretation** (`InterpreterService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │ MeldNode[]  │     │  Directive  │
   │  Rich AST   ├────►│   Service   │ ← Handles nodes with `InterpolatableValue` etc.
   └─────────────┘     └──────┬──────┘
                              │
                              ▼
   ┌─────────────┐     ┌─────────────┐
   │ Resolution  │◄────┤   Handler   │ ← Resolves variables within directive logic
   │   Service   │     │(with node   │
   └──────┬──────┘     │replacements)│
          │            └─────────────┘
          ▼
   ┌─────────────┐
   │    State    │ ← Updated by DirectiveService applying stateChanges
   │   Service   │   from handler's DirectiveResult
   │(Original &  │
   │Transformed) │ ← Stores final (transformed) AST
   └─────────────┘
   ```
   - Processes each rich AST node sequentially
   - Routes directives to appropriate handlers via `DirectiveService`
   - Handlers process structured directive data (e.g., `InterpolatableValue`) and use `ResolutionService` as needed
   - Handlers return a `DirectiveResult` which may include replacement nodes and/or `stateChanges`.
   - `DirectiveService` applies the `stateChanges` from the `DirectiveResult` to the `StateService`.
   - `InterpreterService` applies node replacements (if any) to the transformed AST.
   - Handles file imports and embedding
   - **Resolves `{{...}}` variable references within plain `TextNode` content**

5. **Output Generation** (`OutputService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │Transformed  │     │   Format    │
   │ Rich AST &  ├────►│  Converter  │
   │   State     │     └──────┬──────┘
   └─────────────┘            │
                              ▼
   ┌─────────────┐     ┌─────────────┐
   │Clean Output │◄────┤  Formatted  │ ← Final text variable substitution (`{{...}}`) occurs here
   │(No Directive│     │   Output    │
   │Definitions) │     └─────────────┘
   └─────────────┘
   ```
   - Takes the final (transformed) rich AST and state
   - Converts to requested format (markdown, llm-xml)
   - **Treats `TextNode` content as pre-resolved (resolution handled by InterpreterService)**
   - Uses `VariableReferenceResolverClient` for detailed field/value processing during conversion.
   - Writes output to file or stdout

## Transformation Mode and Variable Resolution

When transformation mode is enabled, the pipeline handles directives and variables in a special way. Understanding this flow is critical for debugging and enhancing directive handlers:

```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Directive  │     │Interpretation│     │   State      │     │   Output     │
│  Handlers   ├────►│  & Node     ├────►│  Variable    ├────►│  Generation  │
│(with replace│     │Transformation│     │  Resolution  │     │              │
│  nodes)     │     │              │     │              │     │              │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```

### Key Transformation Pipeline Concepts

1. **Directive Handler Replacement Nodes**
   - Directive handlers can return replacement nodes when in transformation mode
   - The InterpreterService must properly apply these replacements in the transformed nodes array
   - For import directives, the replacement is typically an empty text node
   - For embed directives, the replacement node contains the embedded content

2. **State Propagation Across Boundaries**
   - Variables must be explicitly copied between parent and child states using mechanisms like `StateVariableCopier`.
   - When importing files, variables must be copied from imported state to parent state (`ImportDirectiveHandler`).

3. **Variable Resolution Process**
   - Variables can be resolved at multiple stages:
     - During directive processing by handlers (using `ResolutionService`).
     - During final output generation (`OutputService` resolves `{{...}}` in `TextNode` content).
     - Potentially during post-processing steps if needed.
   - `OutputService`