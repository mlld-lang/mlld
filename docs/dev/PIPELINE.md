# Meld Pipeline Flow

## Overview

The Meld pipeline processes `.mld` files through a simplified, handler-based architecture that follows the "AST Knows All" principle:

```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Parser    │     │ Interpreter │     │   Handlers   │     │   Output     │
│  (Smart)    ├────►│  (Simple)   ├────►│ (Focused)    ├────►│ (Formatter)  │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
      │                    │                    │                    │
      ▼                    ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ AST with    │     │ Route by    │     │Return State  │     │Format Final  │
│ Rich Types  │     │ Node Type   │     │  Changes     │     │   Nodes      │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```

Key principles:
- **Parser produces rich AST** with discriminated unions and pre-parsed structures
- **Interpreter is a simple router** that dispatches based on node type
- **Handlers process specific directives** and return state changes as data
- **State is updated immutably** based on handler results
- **Output formats the final nodes** without complex logic

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

1. **Service Initialization** (Simplified with DI)
   ```ascii
   ┌─────────────┐
   │ DI Container│
   │  Resolves   │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  Services   │
   │ Auto-wired  │
   └─────────────┘
   ```
   - TSyringe container handles all dependencies
   - Services have minimal interfaces
   - Handlers registered automatically

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
   │ Rich AST    │ ← Produces discriminated union types
   │  Generator  │   with all intelligence built-in
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │ MeldNode[]  │ ← Each node has 'type' discriminator
   │(Smart Types)│   enabling TypeScript narrowing
   └─────────────┘
   ```
   - Produces **discriminated union** AST nodes with `type` field
   - Each node type has specific structure (TextNode, DirectiveNode, etc.)
   - **Pre-parses directive values** into structured data:
     - `directive.values.value` for data directives (already parsed JSON)
     - `directive.values.content` for text directives (array of nodes)
     - `directive.values.path` for import directives
   - Variables in templates become `VariableReferenceNode` objects
   - Every node gets unique `nodeId` and optional `location`
   - **AST contains all parsing intelligence** - no re-parsing needed later

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
   - **Simple type-based routing** using switch on `node.type`
   - For `TextNode`s:
     - Simply adds to state (no processing needed)
     - Text is just text - no hidden complexity
   - For `DirectiveNode`s:
     - Routes to specific handler based on `directive.kind`
     - Handler receives:
       - The directive node with pre-parsed values
       - Current state (read-only access)
       - Processing options (strict mode, file path)
     - Handler returns `DirectiveResult`:
       ```typescript
       {
         stateChanges?: {
           variables?: Record<string, MeldVariable>;
         };
         replacement?: MeldNode[];  // For transformation mode
       }
       ```
     - Interpreter applies state changes (if any)
     - No direct state mutation by handlers

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
     - **During interpretation (`InterpreterService`) for `{{...}}` references within plain `TextNode` content.** The `InterpreterService` resolves these before adding the final `TextNode` to the state.
   - `OutputService` **does not** perform variable resolution on `TextNode` content; it expects pre-resolved text provided by the `InterpreterService`. It may use `VariableReferenceResolverClient` for formatting complex values (like objects or arrays referenced by variables) during final output generation.