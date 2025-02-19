# meld-ast

## Overview
meld-ast is a critical dependency in our codebase that provides the foundational parsing capabilities for the Meld scripting language. It's a spec-compliant AST (Abstract Syntax Tree) parser built with Peggy that produces AST nodes conforming to the `meld-spec` type definitions.

## Role in Our Codebase

### Core Integration Points

1. **ParserService**
   - Primary wrapper around meld-ast's `parse` function
   - Adds location tracking and file path information to AST nodes
   - Handles error conversion to our custom `MeldParseError` type
   - Provides both basic parsing and location-aware parsing capabilities

2. **InterpreterService**
   - Consumes the AST nodes produced by meld-ast
   - Orchestrates the interpretation of these nodes through our directive system
   - Maintains state and handles node processing flow

3. **DirectiveService**
   - Works with directive nodes parsed by meld-ast
   - Routes different directive types to appropriate handlers
   - Relies on meld-ast's strict typing for directive validation

## Key Features We Use

1. **AST Node Types**
   - Text nodes for content blocks
   - Code fence nodes with language support
   - Comment nodes (`>> comment`)
   - Variable nodes:
     - Text variables (`${var}`)
     - Data variables (`#{data}`)
     - Path variables (`$var`)
   - Directive nodes with metadata

2. **Location Tracking**
   - Source location information for all nodes
   - Critical for error reporting and debugging
   - Used in our error handling system

3. **Error Handling**
   - Parse errors with location information
   - Integrated into our custom error hierarchy
   - Used for providing detailed feedback

## Type Integration

We heavily rely on meld-ast's type definitions, which are re-exported from meld-spec:

```typescript
import type {
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  TextVarNode,
  DataVarNode,
  PathVarNode,
  CommentNode,
  SourceLocation,
  DirectiveKind,
  DirectiveData
} from 'meld-spec';
```

## Usage in Our Codebase

1. **Parsing**
   ```typescript
   // Basic parsing
   const nodes = await parserService.parse(content);
   
   // Parsing with location information
   const nodesWithLoc = await parserService.parseWithLocations(content, filePath);
   ```

2. **Error Handling**
   ```typescript
   try {
     const nodes = await parserService.parse(content);
   } catch (error) {
     if (error instanceof MeldParseError) {
       // Handle parse errors with location information
     }
   }
   ```

3. **AST Processing**
   ```typescript
   // Interpretation pipeline
   const nodes = await parserService.parse(content);
   await interpreterService.interpret(nodes, {
     initialState: state,
     filePath: filePath,
     mergeState: true
   });
   ```

## Version and Compatibility

We currently use meld-ast version ^0.5.0 as specified in our package.json. It requires meld-spec as a peer dependency, which we use version ^0.3.10.

## Important Notes

1. **Parser Configuration**
   - We enable location tracking by default
   - Parse errors are converted to our custom error types
   - Default error handling includes fallback locations

2. **AST Validation**
   - All nodes are validated against meld-spec types
   - Strict compliance is enforced for directive structures
   - Location information is required for error reporting

3. **Performance Considerations**
   - Parsing is synchronous but wrapped in async interfaces
   - Location tracking adds minimal overhead
   - Error handling is designed for graceful degradation
