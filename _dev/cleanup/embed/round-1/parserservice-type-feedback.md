# ParserService Feedback on Embed Directive Types

## Overview

As the lead developer of the ParserService team, I've reviewed the proposed embed directive types in `_dev/cleanup/embed/embed.types.ts`. Our service is responsible for the initial parsing of Meld documents to produce AST nodes, which are then processed by other services in the pipeline.

## Current Role of ParserService

Our service:
1. Converts raw text content into an Abstract Syntax Tree (AST)
2. Uses the `meld-ast` library for the core parsing logic
3. Adds location information to nodes
4. Performs basic validation on the parsed nodes
5. Transforms older variable node types into consolidated types

## Feedback on Embed Types

### 1. Initial Parsing vs. Interpreted Types

The proposed types represent the *interpreted* state of embed directives, not the initial parsed state that our service produces. ParserService outputs more basic directive nodes that DirectiveService later interprets into these specific types.

### 2. Missing Raw Syntax Representation

The types don't include information about the raw syntax patterns our parser needs to identify:
- `@embed [path/to/file]` for path embeds
- `@embed {{variable}}` for variable embeds
- `@embed [[template with {{variables}}]]` for template embeds

These patterns are crucial for our parser to correctly identify the initial node type.

### 3. Location Information Needs

The `location` field in the types is suitable for our needs, as it matches our current location tracking approach. However, we would also need to track:
- The exact source range for just the directive content
- Source position boundaries for variable references within templates
- Original source string for error reporting and source mapping

### 4. Source Preservation Requirements

For proper error reporting and debugging, we need to preserve:
- The original source text for each node
- The context in which the embed directive appears
- The exact source position of any errors that occur during parsing

### 5. Parser Output Structure

Our service currently outputs basic `DirectiveNode` objects with a directive kind of `'embed'` and directive parameters. We don't determine the subtype - that's the responsibility of the DirectiveService.

## Proposed Improvements

To better align with ParserService requirements, we suggest:

1. **Add Raw Syntax Information**:
   ```typescript
   interface BaseEmbedDirective {
     // ... existing fields
     rawSyntax: string; // Raw directive text as it appears in source
     syntaxType: 'bracketPath' | 'variableReference' | 'doubleBracketTemplate';
   }
   ```

2. **Enhance Location Information**:
   ```typescript
   interface BaseEmbedDirective {
     // ... existing fields
     location: {
       start: { line: number; column: number; offset: number; };
       end: { line: number; column: number; offset: number; };
       source?: string; // Source file path
       contentRange?: { // Range of just the directive content
         start: { line: number; column: number; offset: number; };
         end: { line: number; column: number; offset: number; };
       };
     };
   }
   ```

3. **Clarify Responsibility Boundaries**:
   - ParserService only identifies basic embed directive structure
   - DirectiveService determines exact subtype and processes accordingly

## Interaction with Current Implementation

Based on our review of the EmbedDirectiveHandler, the current implementation determines the subtype using:

```typescript
private determineSubtype(node: DirectiveNode): 'embedPath' | 'embedVariable' | 'embedTemplate' {
  // Logic to determine subtype based on node structure
}
```

This approach works but requires the DirectiveHandler to examine the raw node structure. Clearer typing from the parser could streamline this process.

## Conclusion

The proposed types are a good starting point but need refinement to better support the parsing phase of the pipeline. Our service needs types that represent the raw parsed state, not the fully interpreted state, with more emphasis on preserving the original syntax and location information for error reporting and debugging.

We recommend close collaboration between the ParserService and DirectiveService teams to ensure the types support both the initial parsing phase and the later interpretation phase of the pipeline. 