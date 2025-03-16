# Comprehensive Plan to Complete Output-Literal Mode Implementation

## Current Status and Objectives

Most of the basic framework for output-literal mode (renamed from "transformation mode") is in place based on the `p0-newlines.md` implementation. This plan addresses the remaining issues to complete the implementation and ensure consistent newline handling throughout the pipeline.

## Core Requirements for Output-Literal Mode

In output-literal mode, we don't add OR remove any newlines based on node type - we stay true to the original document:

1. Every directive that generates output (embed, run) ends with a newline
2. Every directive that does NOT generate output (import, text, data, path, define) does not produce any output or add newlines
3. We don't insert newlines after a variable

These requirements ensure that the output exactly preserves the formatting from the source document while replacing directives with their content.

## Example of Desired Behavior

Given the following input:

```
>> this is commented out
@text variable = "testing 123"
@text othervar = "hello"
@text multiline = [[
testing 

testing
]]
# header

extra space here


@embed {{variable}} {{othervar}}
@embed {{variable}}       {{othervar}}
@embed {{variable}}{{othervar}}
@embed {{multiline}}
@text food = "sandwich"

@run [echo test]

@embed [[
I would like a {{food}}

Please give

me


food
]]
```

In output-literal mode, it should produce:

```
# header

extra space here


testing 123 hello
testing 123       hello
testing 123hello
testing 

testing

test

I would like a sandwich

Please give

me


food

```

## Remaining Implementation Tasks

### 1. Fix OutputService to Correctly Handle Newlines in Literal Mode

#### A. Update `handleNewlines` Method
```typescript
private handleNewlines(content: string, context: FormattingContext): string {
  if (!content) return content;
  
  // In output-literal mode, preserve EXACTLY as is with NO modifications
  if (context.isOutputLiteral ?? context.transformationMode) {
    return content; // Return content unchanged
  }
  
  // Only apply normalization in output-normalized mode
  // ... existing code for normalized mode ...
}
```

#### B. Update `convertToMarkdown` Method
```typescript
private async convertToMarkdown(nodes: MeldNode[], state: IStateService, options?: OutputOptions): Promise<string> {
  // ...existing code...
  
  // In output-literal mode, process nodes without any additional formatting
  if (state.isTransformationEnabled()) {
    let output = '';
    
    // Simply process each node in sequence without adding spacing between them
    for (const node of nodes) {
      try {
        const nodeOutput = await this.nodeToMarkdown(node, state);
        if (!nodeOutput) continue;
        output += nodeOutput;
      } catch (nodeError) {
        // Error handling
      }
    }
    
    // NO post-processing or cleanup!
    return output;
  }
  
  // ...rest of code for output-normalized mode...
}
```

### 2. Fix Context Propagation Between Services

The main remaining issue is ensuring that formatting context is properly propagated between services. Currently, context is sometimes lost during directive processing, especially:

1. When a directive transforms into nodes (context isn't attached to new nodes)
2. When variables are resolved (context not maintained during resolution)
3. When embedded content is processed (context not preserved from source to embedded content)

Tasks:

1. Add a standardized `FormattingContext` object to each step of the pipeline
2. Implement proper context inheritance from parent to child nodes
3. Ensure context is maintained during transformation operations

```typescript
// Enhanced FormattingContext interface with inheritance
interface FormattingContext {
  nodeType: string;
  transformationMode: boolean; // Keep for backward compatibility
  isOutputLiteral?: boolean;   // New alias for clarity
  parentContext?: FormattingContext; // Track inheritance
  preserveFormatting: boolean;
}

// Helper to create child contexts that inherit from parent
private createChildContext(parent: FormattingContext, nodeType: string): FormattingContext {
  return {
    nodeType,
    transformationMode: parent.transformationMode,
    isOutputLiteral: parent.isOutputLiteral,
    parentContext: parent,
    preserveFormatting: parent.preserveFormatting,
  };
}
```

### 3. Fix Variable Reference Resolution in Output-Literal Mode

Currently, variable resolution doesn't always maintain formatting context, especially for complex types:

```typescript
// Update processVariableReference to respect output-literal mode
private async processVariableReference(reference: IVariableReference, state: IStateService, context: FormattingContext): Promise<string> {
  // ...existing code to resolve the variable...
  
  // When in output-literal mode, don't apply any formatting to the resolved value
  if (context.isOutputLiteral ?? context.transformationMode) {
    if (resolvedValue === null || resolvedValue === undefined) {
      return '';
    }
    
    // For objects and arrays, use consistent JSON.stringify
    if (typeof resolvedValue === 'object') {
      return JSON.stringify(resolvedValue, null, 2);
    }
    
    // For primitive values, simple string conversion
    return String(resolvedValue);
  }
  
  // ...existing code for output-normalized mode...
}
```

### 4. Fix Directive Handlers for Proper Content Preservation

#### A. EmbedDirectiveHandler
Ensure embedded content preserves exact formatting in output-literal mode:

```typescript
// In EmbedDirectiveHandler's execute method
if (options.isTransformationEnabled) {
  // Preserve formatting context through the transformation
  const formattingMetadata = {
    preserveFormatting: true,
    context: { 
      isOutputLiteral: true,
      transformationMode: true
    }
  };
  
  return {
    result: DirectiveResult.success(),
    transformNodes: [
      {
        type: 'Text',
        content: embeddedContent,
        location: directive.location,
        formattingMetadata
      }
    ]
  };
}
```

#### B. RunDirectiveHandler
Apply similar changes to RunDirectiveHandler:

```typescript
// In RunDirectiveHandler's execute method
if (options.isTransformationEnabled) {
  // Preserve formatting context through transformation
  const formattingMetadata = {
    preserveFormatting: true,
    context: { 
      isOutputLiteral: true,
      transformationMode: true
    }
  };
  
  return {
    result: DirectiveResult.success(),
    transformNodes: [
      {
        type: 'Text',
        content: commandOutput,
        location: directive.location,
        formattingMetadata
      }
    ]
  };
}
```

### 5. Remove API Layer Workarounds

Once the core pipeline correctly preserves formatting in output-literal mode, remove the workarounds in api/index.ts:

```typescript
// In api/index.ts
if (resultState.isTransformationEnabled()) {
  // Remove all regex-based workarounds since OutputService now handles formatting correctly
  
  // Only keep the final variable reference resolution for unresolved variables
  const variableRegex = /\{\{([^{}]+)\}\}/g;
  const matches = Array.from(converted.matchAll(variableRegex));
  if (matches.length > 0) {
    // ... handle any remaining unresolved variables ...
  }
}
```

## Testing Strategy

### 1. Add New Tests for Output-Literal Mode Behavior

Add comprehensive tests to verify literal mode correctly preserves formatting:

```typescript
it('should preserve multiple consecutive newlines in output-literal mode', async () => {
  const textWithMultipleNewlines = 'Line 1\n\n\nLine 2';
  const nodes = [createTextNode(textWithMultipleNewlines, createLocation(1, 1))];
  
  // Enable output-literal mode
  vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
  
  const result = await service.convert(nodes, state, 'markdown');
  
  // Verify exact preservation of multiple newlines
  expect(result).toBe('Line 1\n\n\nLine 2');
});

it('should preserve special formatting patterns in output-literal mode', async () => {
  // Test various patterns that previously required workarounds
  const specialPatterns = [
    'Status:\nActive',            // Colon-newline pattern
    'Apple,\nBanana,\nCherry',    // Comma-newline pattern
    'Config:\n{ prop: value }',   // Object notation
    'List:\n1. Item'              // List syntax
  ];
  
  // Test each pattern is preserved exactly
  for (const pattern of specialPatterns) {
    const nodes = [createTextNode(pattern, createLocation(1, 1))];
    vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
    
    const result = await service.convert(nodes, state, 'markdown');
    
    // Pattern should be preserved exactly as-is
    expect(result).toBe(pattern);
  }
});
```

### 2. Update Existing Tests to Reflect Correct Behavior

Most existing tests expect incorrect behavior based on current workarounds. Update them to expect the correct behavior:

1. **OutputService Tests**:
   - Tests expecting newline normalization in transformation mode should now expect preservation

2. **EmbedDirectiveHandler Tests**:
   - Tests should verify exact preservation of embedded content formatting

3. **RunDirectiveHandler Tests**:
   - Tests should verify exact preservation of command output formatting

4. **Integration Tests**:
   - Tests that rely on API workarounds need updating to expect proper formatting

### 3. Add Comprehensive Context Propagation Tests

Test that context is properly propagated through the entire pipeline:

```typescript
it('should maintain formatting context through nested operations', async () => {
  // Setup complex document with nested operations:
  // - Directive that transforms to nodes
  // - Variable references within those nodes
  // - Embedded content with variables
  
  // Verify that formatting context is maintained throughout
  // and output preserves exact formatting
});
```

## Implementation Order and Dependencies

1. **Phase 1**: Fix OutputService core methods (minimal dependency on other changes)
   - Update `handleNewlines` and `convertToMarkdown` first
   - These changes should work with existing code 

2. **Phase 2**: Implement context propagation infrastructure
   - Enhance FormattingContext interface and helpers
   - Add context to critical interfaces between services
   - Update context creation and propagation logic

3. **Phase 3**: Fix directive handlers
   - Update EmbedDirectiveHandler
   - Update RunDirectiveHandler
   - Ensure proper context propagation

4. **Phase 4**: Fix variable reference resolution
   - Update variable resolution to respect context
   - Ensure object/array formatting is consistent

5. **Phase 5**: Remove API workarounds
   - Once all previous phases pass tests, remove workarounds
   - Verify all tests still pass with workarounds removed

6. **Phase 6**: Add comprehensive integration test
   - Test the complete pipeline with the complex example
   - Verify exact output matches expected format

## Legacy Compatibility Considerations

Some clients of the API may rely on the current workarounds. To maintain compatibility:

1. Update documentation to clearly explain the new literal mode behavior
2. Consider adding a compatibility flag for clients that need the old behavior
3. In a future release, deprecate and eventually remove the compatibility flag

## Conclusion

This plan addresses the remaining issues to complete the output-literal mode implementation. The focus is on consistent newline handling throughout the pipeline while maintaining backward compatibility. By following this implementation order and testing strategy, we can ensure a smooth transition to a cleaner architecture without breaking existing functionality.
