# Meld Transformation: Essential Context

## What is Meld?

Meld is a pre-processing language and framework that allows users to define variables, run commands, import content, and embed files into documents. It uses a directive-based syntax (e.g., `@text`, `@data`, `@run`, `@import`, `@embed`) and variable references (e.g., `{{variable}}`) to enable dynamic content generation. It is specifically designed for modular prompt scripting for working with LLMs.

## Core Concepts

### 1. Transformation Mode

**Transformation mode** determines whether directives and variables are processed/replaced or left as raw text:

- When **enabled**: `@text greeting = "Hello"` and `{{greeting}}` are processed, resulting in just "Hello" in the output.
- When **disabled**: Directives and variables remain unchanged in the output.

In transformation mode:
- Variable references like `{{greeting}}` are replaced with their values
- Directive nodes are processed and replaced with their output
- Import directives bring in content from other files
- Embed directives include content from other files

### 2. Abstract Syntax Tree (AST)

The Meld parser (`meld-ast` package) converts input text into an AST representing the document structure. The AST contains different node types:

- **TextVar**: Represents a text variable reference like `{{greeting}}`
- **DataVar**: Represents a data variable reference like `{{config.value}}` or `{{items[0]}}`
- **Directive**: Represents a directive like `@text` or `@data`
- **Text**: Represents plain text content

### 3. Variable Resolution Process

1. The parser generates an AST from the input
2. The `VariableReferenceResolver` processes variable references in the AST
3. When transformation is enabled, variable nodes are replaced with text nodes containing their resolved values
4. The resulting AST is converted back to text

## Key Components

### 1. StateService

The `StateService` manages the state of variables and transformation settings:
- Tracks which variables are defined and their values
- Controls whether transformation is enabled
- Implements selective transformation options
- Maintains state hierarchy for imports and embedding

### 2. ResolutionService

The `ResolutionService` resolves variable references and other dynamic content:
- Provides various resolvers for different types of content
- Includes `VariableReferenceResolver` for handling variable references
- Resolves variable references in different contexts
- Supports both synchronous and asynchronous resolution

### 3. DirectiveService and Handlers

The `DirectiveService` processes directive nodes in the AST:
- Uses specialized handlers for each directive type
- Example handlers:
  - `TextDirectiveHandler`: Defines text variables
  - `ImportDirectiveHandler`: Imports content from other files
  - `EmbedDirectiveHandler`: Embeds content from other files
  - `RunDirectiveHandler`: Executes commands

### 4. OutputService

The `OutputService` converts the processed AST to final output:
- Supports different output formats (Markdown, XML, etc.)
- Applies transformation rules based on the state
- Handles the final conversion of nodes to text

### 5. InterpreterService

The `InterpreterService` coordinates the overall process:
- Processes the AST through various stages
- Manages directive execution
- Handles error propagation
- Controls transformation application

## Transformation Pipeline

The transformation process follows these steps:

1. **Parsing**: Input text is parsed into an AST
2. **Directive Processing**: Directives are processed by appropriate handlers
3. **State Updates**: Variables are defined and updated in the state
4. **Variable Resolution**: Variable references are resolved and replaced
5. **Output Generation**: The processed AST is converted to text output

## Common Issues in Transformation

### 1. Variable Propagation

Variables need to be properly propagated across state boundaries:
- From imported files to parent files
- From embedded files to containing files
- Between different execution contexts

### 2. Error Handling

Errors need to be properly handled during transformation:
- Critical errors should be propagated
- User-friendly error messages should be provided
- Error locations should be preserved

### 3. AST Node Transformation

Different node types need to be correctly transformed:
- Text nodes with variable references need special handling
- Directive nodes need to be replaced with their results
- Variable nodes need to be replaced with their values

### 4. Selective Transformation

Selective transformation allows control over what gets transformed:
- Variables can be transformed while directives remain
- Directives can be transformed while commands remain unexecuted
- Imports can be processed while embedded content remains as-is

## Key Interfaces and Types

```typescript
// StateService transformation options
interface TransformationOptions {
  variables?: boolean;    // Transform variable references
  directives?: boolean;   // Transform directive content
  commands?: boolean;     // Execute commands
  imports?: boolean;      // Process imports
}

// AST node types
type MeldNode = TextNode | TextVarNode | DataVarNode | DirectiveNode;

// Variable reference node
interface TextVarNode {
  type: 'TextVar';
  identifier: string;
  varType: 'text';
  location?: Location;
}

// Data variable reference node
interface DataVarNode {
  type: 'DataVar';
  identifier: string;
  varType: 'data';
  fields: (FieldAccess | IndexAccess)[];
  location?: Location;
}
```

## Relevant Files

1. **Core Services**:
   - `services/state/StateService.ts` - Manages transformation state
   - `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts` - Resolves variables
   - `services/pipeline/OutputService/OutputService.ts` - Handles output generation

2. **Directive Handlers**:
   - `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.ts`
   - `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts`

3. **API Entry Point**:
   - `api/index.ts` - Main API entry point where transformation is configured

## AST Structure Examples

### Variable References

```javascript
// Simple variable: {{greeting}}
{
  "type": "TextVar",
  "identifier": "greeting",
  "varType": "text",
  "location": {...}
}

// Data variable with fields: {{config.value}}
{
  "type": "DataVar",
  "identifier": "config",
  "varType": "data",
  "fields": [
    { "type": "field", "value": "value" }
  ],
  "location": {...}
}

// Array access: {{items[0]}}
{
  "type": "DataVar",
  "identifier": "items",
  "varType": "data",
  "fields": [
    { "type": "index", "value": 0 }
  ],
  "location": {...}
}
```

### Directive Nodes

```javascript
// Text directive: @text greeting = "Hello"
{
  "type": "Directive",
  "directive": {
    "kind": "text",
    "name": "greeting",
    "value": {
      "type": "StringLiteral",
      "value": "Hello"
    }
  },
  "location": {...}
}

// Import directive: @import "./file.meld"
{
  "type": "Directive",
  "directive": {
    "kind": "import",
    "path": {
      "type": "StringLiteral",
      "value": "./file.meld"
    }
  },
  "location": {...}
}
```

## Transformation Architecture

### Dual Storage Model

Meld uses a dual storage approach for handling transformation:

1. **Original Nodes**: All AST nodes parsed from the original content are stored unmodified.
2. **Transformed Nodes**: When transformation is enabled, a parallel array of nodes is maintained that contains transformed versions.

This approach allows Meld to:
- Preserve the original document structure
- Apply transformations without losing the original content
- Switch between transformed and untransformed views
- Debug transformation issues by comparing original and transformed nodes

### Transformation Flow

Here's how the transformation process works end-to-end:

1. **Input Parsing**:
   - Input text is parsed into an AST of MeldNodes
   - The AST contains Text, TextVar, DataVar, Directive nodes

2. **Interpretation**:
   - InterpreterService processes each node sequentially
   - Nodes are added to the StateService's `nodes` array

3. **Directive Processing**:
   - When a Directive node is encountered, it's routed to a handler
   - The handler processes the directive and can return a replacement node
   - If transformation is enabled, the original directive is replaced with the result

4. **Variable Resolution**:
   - When variable references are encountered, ResolutionService resolves them
   - If transformation is enabled, variable references are replaced with their values

5. **Output Generation**:
   - The OutputService accesses the appropriate nodes array:
     - `getTransformedNodes()` if transformation is enabled
     - `getNodes()` if transformation is disabled
   - The nodes are converted back to text format

### Service Interaction

The transformation process involves several services working together:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Interpreter │    │  Directive  │    │  Resolution │
│   Service   ├───►│   Service   ├───►│   Service   │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────────────────────────────────────────┐
│               StateService                      │
│                                                 │
│  ┌─────────────┐        ┌─────────────────┐     │
│  │  Original   │        │   Transformed   │     │
│  │    Nodes    │        │      Nodes      │     │
│  └─────────────┘        └─────────────────┘     │
└─────────────────────────────────────────────────┘
                      │
                      │
                      ▼
                ┌──────────────┐
                │    Output    │
                │   Service    │
                └──────────────┘
```

- **InterpreterService** processes nodes and manages the overall flow
- **DirectiveService** delegates directive processing to specialized handlers
- **ResolutionService** handles variable resolution and command execution
- **StateService** maintains both original and transformed nodes
- **OutputService** selects appropriate nodes for final output 