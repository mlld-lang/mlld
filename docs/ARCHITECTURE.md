# Meld Project - Architecture Overview

## Purpose
Meld is a system for parsing, interpreting, and transforming content (written in "Meld language") into various outputs or states. At its core, Meld revolves around three processes:

1. **Parsing**: Breaking Meld content into an internal AST (Abstract Syntax Tree)
2. **Interpreting**: Executing "directives" found in the AST to modify an in-memory state or trigger side effects
3. **Converting**: Rendering the interpreted state into final output formats (like LLM-friendly text or Markdown)

## System Architecture

```
+-------------------+        +--------------------+        +----------------------+
|   Meld Content    | --->   |      Parser        | --->   |    Interpreter       |
| (input files)     |        | (parseMeld)        |        | (directiveRegistry)  |
+-------------------+        +--------------------+        +-----------+----------+
                                                                      |
                                                                      v
                                                        +----------------------------+
                                                        |    Interpreter State       |
                                                        | (stores variables, data)   |
                                                        +----------------------------+
                                                                      |
                                                                      v
                                                        +----------------------------+
                                                        |   Output Conversion       |
                                                        | (mdToLlm, mdToMarkdown)   |
                                                        +----------------------------+
                                                                      |
                                                                      v
                                                        +----------------------------+
                                                        |      Final Output         |
                                                        +----------------------------+
```

## Key Components

### Entry Points
- **CLI** (`bin/meld.ts`): Command-line interface entry point
- **SDK** (`sdk/index.ts`): Programmatic interface for using Meld

### Core Modules
- **Parser** (`src/parser`): Tokenizes and parses Meld content into AST nodes
- **Interpreter** (`src/interpreter`): Executes directives and manages state
- **Converter** (`src/converter`): Transforms interpreted content into output formats

### Supporting Modules
- **Types** (`src/types`): Core type definitions and interfaces
- **Utils** (`src/utils`): Shared utilities and helpers
- **CLI** (`src/cli`): Command-line argument parsing and execution

## Directory Structure
```
src/
├── bin/           # CLI entry point
├── cli/           # CLI implementation
├── converter/     # Output format conversion
├── interpreter/   # Core interpreter logic
│   ├── directives/  # Directive implementations
│   └── state/      # State management
├── sdk/           # Public API
├── types/         # Type definitions
└── utils/         # Shared utilities
```

## Error Handling
- All errors extend from `MeldError`
- Specialized error types for parsing, interpretation, and directives
- Location tracking for precise error reporting

## Logging
- Winston-based logging system
- Separate loggers for directives and interpreter
- Configurable log levels and output formats

## Troubleshooting

### Common Issues
- **"File not found"**: Check input file paths and working directory
- **"Unknown directive"**: Verify directive spelling and registration
- **"Parse error"**: Check syntax, especially with multiline content
- **"State modification error"**: Ensure state is not immutable when modifying

### Debugging Tips
1. Enable debug logging for detailed execution flow
2. Check error stack traces for precise locations
3. Verify directive syntax against documentation
4. Ensure all required dependencies are available

## References
- [CLI Documentation](../src/cli/__docs__/README.md)
- [Interpreter Documentation](../src/interpreter/__docs__/README.md)
- [Parser Documentation](../src/parser/__docs__/README.md)
- [SDK Documentation](../src/sdk/__docs__/README.md) 