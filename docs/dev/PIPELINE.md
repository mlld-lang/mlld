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
   │    State    │
   │   Service   │ ← Updated by handlers
   │(Original &  │
   │Transformed) │ ← Stores final (transformed) AST
   └─────────────┘
   ```
   - Processes each rich AST node sequentially
   - Routes directives to appropriate handlers via `DirectiveService`
   - Handlers process structured directive data (e.g., `InterpolatableValue`) and use `ResolutionService` as needed
   - Handlers can provide replacement nodes for the transformed AST
   - Updates `StateService` with results and the final transformed AST
   - Handles file imports and embedding

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
   - Handles `InterpolatableValue` arrays within nodes during conversion.
   - Performs final substitution of `{{...}}` variable references found within `TextNode` content.
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
   - `OutputService`'s `nodeToMarkdown` method handles the final `{{...}}` resolution pass in text nodes.

4. **State Management for Transformation**
   - The `StateService` maintains both original and transformed node arrays.
   - Transformed nodes must be explicitly initialized 
   - The transformNode method is used to replace directive nodes with their outputs
   - State must keep track of transformation options to determine which directives to transform

## Service Responsibilities

### Pipeline Services

1. **ParserService** (`services/pipeline/ParserService/`)
   - Wraps `@core/ast` parser
   - Produces rich AST nodes with structured data (`InterpolatableValue`, `Field[]`, etc.)
   - Adds file location information

2. **InterpreterService** (`services/pipeline/InterpreterService/`)
   - Orchestrates directive processing on the rich AST
   - Handles node transformations
   - Manages interpretation state and context (parent/child states)
   - Ensures proper state propagation for imports/embedding

3. **DirectiveService** (`services/pipeline/DirectiveService/`)
   - Routes directives (with structured data) to handlers
   - Handlers process `InterpolatableValue`, `Field[]`, etc., using `ResolutionService`
   - Supports node transformation via handler results
   - Updates state based on directive execution

4. **OutputService** (`services/pipeline/OutputService/`)
   - Uses transformed rich AST for clean output
   - Supports markdown and LLM XML formats
   - Performs final text node variable substitution (`{{...}}`)
   - Uses specialized clients (`VariableReferenceResolverClient`) for detailed data handling during formatting.

### State Services

1. **StateService** (`services/state/StateService/`)
   - Stores variables and commands
   - Maintains original and transformed nodes
   - Manages scope and inheritance
   - Tracks file dependencies
   - **Transformation support:** Keeps track of both original and transformed node arrays
   - **Variable copying:** Must explicitly copy variables between parent and child states
   - **Transformation options:** Supports selective transformation of different directive types

2. **StateEventService** (`services/state/StateEventService/`)
   - Handles state change events
   - Manages state updates
   - Provides event hooks
   - Supports state tracking

### Resolution Services

1. **ResolutionService** (`services/resolution/ResolutionService/`)
   - Resolves variables (`{{...}}`, `$path`, commands) based on `VariableReferenceNode` from AST.
   - Handles structured field access paths (`Field[]`).
   - Operates primarily on AST nodes passed from handlers.
   - Manages resolution context and circular dependencies.

2. **ValidationService** (`services/resolution/ValidationService/`)
   - Validates directive syntax and constraints based on AST node data.
   - Provides extensible validator registration
   - Throws MeldDirectiveError on validation failures
   - Tracks available directive kinds

3. **CircularityService** (`services/resolution/CircularityService/`)
   - Prevents infinite import loops
   - Detects circular variable references
   - Maintains dependency graphs

### File System Services

1. **FileSystemService** (`services/fs/FileSystemService/`)
   - Abstracts file operations (read, write)
   - Supports both real and test filesystems
   - Handles path resolution and validation

2. **PathService** (`services/fs/PathService/`)
   - Validates and normalizes paths
   - Enforces path security constraints
   - Handles path joining and manipulation
   - Supports test mode for path operations

3. **PathOperationsService** (`services/fs/PathOperationsService/`)
   - Handles complex path operations
   - Provides path utilities
   - Manages path transformations
