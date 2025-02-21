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
   │  Resolution │◄────┤   Handler   │
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

### Core Services

1. **CLIService**
   - Entry point for command line interface
   - Handles file paths and options
   - Orchestrates the overall pipeline

2. **ParserService**
   - Wraps meld-ast parser
   - Produces AST nodes
   - Adds file location information

3. **InterpreterService**
   - Orchestrates directive processing
   - Handles node transformations
   - Maintains interpretation state
   - Handles imports and embedding

4. **DirectiveService**
   - Routes directives to handlers
   - Validates directive syntax
   - Supports node transformation
   - Updates state based on directive results

5. **StateService**
   - Stores variables and commands
   - Maintains original and transformed nodes
   - Manages scope and inheritance
   - Tracks file dependencies

6. **ResolutionService**
   - Resolves variables and references
   - Handles path expansions
   - Manages circular dependencies

7. **OutputService**
   - Uses transformed nodes for clean output
   - Supports markdown and LLM XML
   - Generates directive-free output
   - Handles formatting options

## Current Implementation Status

The current implementation fully supports the desired pipeline flow:

1. ✅ File input via `meld prompt.meld`
2. ✅ Parsing and AST generation
3. ✅ Directive interpretation and state management
4. ✅ Node transformation and replacement
5. ✅ Variable resolution and content embedding
6. ✅ Clean output generation without directive definitions
7. ✅ Output in both `.llm` and `.md` formats

The pipeline is working as intended, with:
- Robust error handling
- Clear separation of concerns between services
- Support for node transformations
- Clean output generation without directive definitions
- Proper state management for both original and transformed nodes 