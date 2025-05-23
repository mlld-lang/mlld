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
      │
      ▼
┌─────────────┐
│ Used by     │ ← ResolutionService is used by handlers,
│ Handlers    │   NOT by InterpreterService directly
└─────────────┘
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
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │ MeldNode[]  │     │ Interpreter │     │  Directive  │
   │  Rich AST   ├────►│   Service   ├────►│   Service   │
   └─────────────┘     └─────────────┘     └──────┬──────┘
                                                   │
                                                   ▼
                       ┌─────────────┐     ┌─────────────┐
                       │ Resolution  │◄────┤  Handlers   │
                       │   Service   │     │  (Text,     │
                       └─────────────┘     │  Data, etc) │
                                          └──────┬──────┘
                                                   │
                                                   ▼
   ┌─────────────┐     ┌─────────────────────────────────────────┐
   │    State    │◄────┤ Interpreter Service                      │
   │   Service   │     │ - Routes nodes to handlers               │
   │             │     │ - Applies stateChanges from handlers    │
   │             │     │ - Manages state lifecycle                │
   └─────────────┘     └─────────────────────────────────────────┘

   ```
   - **Simple type-based routing** using switch on `node.type`
   - For `TextNode`s:
     - Simply adds to state (no processing needed)
     - Text is just text - no hidden complexity
   - For `DirectiveNode`s:
     - Routes to DirectiveService, which routes to specific handler
     - Handler receives:
       - The directive node with pre-parsed values
       - Current state (for reading variables)
       - Processing options (strict mode, file path)
     - **Handlers use ResolutionService** to:
       - Resolve variable interpolation in templates
       - Resolve paths with special variables
       - Execute commands and capture output
     - Handler returns `DirectiveResult`:
       ```typescript
       {
         stateChanges?: {
           variables?: Record<string, MeldVariable>;
           nodes?: MeldNode[];  // Pre-resolved content to add
         };
       }
       ```
     - Interpreter applies state changes from handlers
     - All content is **pre-resolved** before being added to state

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
   - Takes the final nodes from state (via `state.getNodes()`)
   - Converts to requested format (markdown, llm-xml)
   - **All content is already resolved** - handlers did the resolution work
   - Simply formats the pre-resolved nodes for output
   - No variable substitution needed at this stage

## Resolution Architecture

The ResolutionService is a key component used by handlers to resolve variables, paths, and execute commands. It is NOT used directly by the InterpreterService:

```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Handlers   │────►│ Resolution  │────►│  Resolved    │
│             │     │  Service    │     │   Content    │
└─────────────┘     └─────────────┘     └──────────────┘
      │                    │                    │
      ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│ Get current │     │Interpolate  │     │Return ready  │
│state, opts  │     │vars, paths  │     │for state     │
└─────────────┘     └─────────────┘     └──────────────┘
```

Key points:
- **Handlers call ResolutionService** with content that needs resolution
- **ResolutionService returns fully resolved strings** ready to be added to state
- **InterpreterService never calls ResolutionService** - it only routes and applies changes
- **OutputService receives pre-resolved content** - no resolution needed

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

1. **Handler Pattern with State Changes**
   - Handlers process directives and return `DirectiveResult` with state changes
   - State changes include:
     - `variables`: New variables to add to state
     - `nodes`: New nodes (with pre-resolved content) to add to state
   - InterpreterService applies these changes immutably
   - No direct state mutation by handlers

2. **Resolution Happens in Handlers**
   - **All resolution happens in handlers** via ResolutionService:
     - Text handlers resolve `{{...}}` in templates before creating variables
     - Add handlers resolve content before creating TextNodes
     - Path handlers resolve special variables like $HOMEPATH
     - Run/Exec handlers execute commands and capture output
   - **InterpreterService does NOT resolve** - it only orchestrates
   - **OutputService does NOT resolve** - it only formats pre-resolved content
   - The key principle: **Content is resolved once, at the handler level**

3. **State Propagation Across Boundaries**
   - When importing files, handlers must merge imported state with current state
   - Variables from imported files become available in parent scope
   - Each handler manages its own state merging logic