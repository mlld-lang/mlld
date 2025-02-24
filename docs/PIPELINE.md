# Meld Pipeline Flow

## Overview

The Meld pipeline processes `.meld` files through several stages to produce either `.llm` or `.md` output. Here's a detailed look at how it works:

```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Input      │     │   Parser    │     │ Interpreter  │     │   Output     │
│ prompt.meld ├────►│   Service   ├────►│   Service    ├────►│   Service    │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
                          │                     │                     │
                          ▼                     ▼                     ▼
                    ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
                    │  AST Nodes  │     │    State     │     │ Clean Output │
                    │             │     │   Service    │     │ (No Directive│
                    └─────────────┘     │(Original &   │     │ Definitions) │
                                       │Transformed)   │     └──────────────┘
                                       └──────────────┘
```

## Service Organization

The pipeline is organized into logical service groups:

### Pipeline Services (services/pipeline/)
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Parser    │     │  Directive  │     │ Interpreter  │     │   Output     │
│   Service   ├────►│   Service   ├────►│   Service    ├────►│   Service    │
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

1. **Input Processing** (`CLIService`)
   - User runs `meld prompt.meld`
   - `CLIService` handles command line options
   - Default output is `.llm` format
   - Can specify `--format markdown` for `.md` output
   - Supports `--stdout` for direct console output

2. **Parsing** (`ParserService`)
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

3. **Interpretation** (`InterpreterService`)
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

4. **Output Generation** (`OutputService`)
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

3. **DirectiveService** (`services/pipeline/DirectiveService/`)
   - Routes directives to handlers
   - Validates directive syntax
   - Supports node transformation
   - Updates state based on directive results

4. **OutputService** (`services/pipeline/OutputService/`)
   - Uses transformed nodes for clean output
   - Supports markdown and LLM XML
   - Generates directive-free output
   - Handles formatting options

### State Services

1. **StateService** (`services/state/StateService/`)
   - Stores variables and commands
   - Maintains original and transformed nodes
   - Manages scope and inheritance
   - Tracks file dependencies

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
