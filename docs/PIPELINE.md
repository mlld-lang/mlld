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
                    │  AST Nodes  │     │    State     │     │ prompt.llm or│
                    │             │     │   Service    │     │  prompt.md   │
                    └─────────────┘     └──────────────┘     └──────────────┘
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
   │   Service   │     │  (by type)  │
   └──────┬──────┘     └─────────────┘
          │
          ▼
   ┌─────────────┐
   │    State    │
   │   Service   │
   └─────────────┘
   ```
   - Processes each AST node sequentially
   - Routes directives to appropriate handlers
   - Maintains state (variables, imports, etc.)
   - Resolves variables and references
   - Handles file imports and embedding

4. **Output Generation** (`OutputService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │  Final AST  │     │   Format    │
   │  & State    ├────►│  Converter  │
   └─────────────┘     └──────┬──────┘
                              │
                              ▼
   ┌─────────────┐     ┌─────────────┐
   │  llmxml or  │◄────┤  Formatted  │
   │  markdown   │     │   Output    │
   └─────────────┘     └─────────────┘
   ```
   - Takes final AST and state
   - Converts to requested format:
     - `llm`: Uses `llmxml` library for LLM-friendly XML
     - `markdown`: Preserves original markdown with resolved variables
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
   - Maintains interpretation state
   - Handles imports and embedding

4. **DirectiveService**
   - Routes directives to handlers
   - Validates directive syntax
   - Updates state based on directive results

5. **StateService**
   - Stores variables and commands
   - Manages scope and inheritance
   - Tracks file dependencies

6. **ResolutionService**
   - Resolves variables and references
   - Handles path expansions
   - Manages circular dependencies

7. **OutputService**
   - Converts final AST to output format
   - Supports markdown and LLM XML
   - Handles formatting options

## Current Implementation Status

The current implementation fully supports the desired pipeline flow:

1. ✅ File input via `meld prompt.meld`
2. ✅ Parsing and AST generation
3. ✅ Directive interpretation and state management
4. ✅ Variable resolution and content embedding
5. ✅ Output generation in both `.llm` and `.md` formats

The pipeline is working as intended, with robust error handling and clear separation of concerns between services. 