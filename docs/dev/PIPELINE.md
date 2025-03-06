# Meld Pipeline Flow

## Overview

The Meld pipeline processes `.meld` files through several stages to produce either `.xml` or `.md` output. Here's a detailed look at how it works:

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
   - User runs `meld prompt.meld`
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
   │    AST      │
   └─────────────┘
   ```
   - Reads the input file content
   - Parses into AST using `meld-ast`
   - Identifies directives and text nodes
   - Adds source location information

4. **Interpretation** (`InterpreterService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │  MeldNode[] │     │  Directive  │
   │     AST     ├────►│   Service   │
   └─────────────┘     └──────┬──────┘
                              │
                              ▼
   ┌─────────────┐     ┌─────────────┐
   │ Resolution  │◄────┤   Handler   │
   │   Service   │     │(with node   │
   └──────┬──────┘     │replacements)│
          │            └─────────────┘
          ▼
   ┌─────────────┐
   │    State    │
   │   Service   │
   │(Original &  │
   │Transformed) │
   └─────────────┘
   ```
   - Processes each AST node sequentially
   - Routes directives to appropriate handlers
   - Handlers can provide replacement nodes
   - Maintains both original and transformed states
   - Resolves variables and references
   - Handles file imports and embedding

5. **Output Generation** (`OutputService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │Transformed  │     │   Format    │
   │  Nodes &    ├────►│  Converter  │
   │   State     │     └──────┬──────┘
                              │
                              ▼
   ┌─────────────┐     ┌─────────────┐
   │Clean Output │◄────┤  Formatted  │
   │(No Directive│     │   Output    │
   │Definitions) │     └─────────────┘
   └─────────────┘
   ```
   - Takes transformed nodes and state
   - Converts to requested format:
     - `llm`: Uses `llmxml` library for LLM-friendly XML
     - `markdown`: Clean markdown without directive definitions
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
   - Variables must be explicitly copied between parent and child states
   - When importing files, variables must be copied from imported state to parent state
   - The ImportDirectiveHandler must ensure all variable types (text, data, path, commands) are copied

3. **Variable Resolution Process**
   - Variables can be resolved at multiple stages:
     - During directive processing
     - During node transformation
     - During final output generation
     - During post-processing in the main function
   - The OutputService's nodeToMarkdown method handles variable reference resolution in text nodes
   - A final variable resolution pass in the main function ensures any remaining references are resolved

4. **State Management for Transformation**
   - The StateService maintains both original and transformed node arrays
   - Transformed nodes must be explicitly initialized 
   - The transformNode method is used to replace directive nodes with their outputs
   - State must keep track of transformation options to determine which directives to transform

## Service Responsibilities

### Pipeline Services

1. **ParserService** (`services/pipeline/ParserService/`)
   - Wraps meld-ast parser
   - Produces AST nodes
   - Adds file location information

2. **InterpreterService** (`services/pipeline/InterpreterService/`)
   - Orchestrates directive processing
   - Handles node transformations
   - Maintains interpretation state
   - Handles imports and embedding
   - **Critical for transformation:** Applies directive handler replacement nodes to transformed node array
   - **State propagation:** Ensures proper variable inheritance between parent and child states

3. **DirectiveService** (`services/pipeline/DirectiveService/`)
   - Routes directives to handlers
   - Validates directive syntax
   - Supports node transformation
   - Updates state based on directive results
   - **Directive handlers:** Can return replacement nodes in transformation mode
   - **Handler context:** Includes parent state for proper variable propagation

4. **OutputService** (`services/pipeline/OutputService/`)
   - Uses transformed nodes for clean output
   - Supports markdown and LLM XML
   - Generates directive-free output
   - Handles formatting options
   - **Variable resolution:** Resolves variable references in text nodes during output generation
   - **Transformation handling:** Uses special processing for variable references in transformation mode

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
   - Resolves variables and references
   - Handles path expansions
   - Manages circular dependencies

2. **ValidationService** (`services/resolution/ValidationService/`)
   - Validates directive syntax and constraints
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
