## Comprehensive Plan to Implement Clean Output-Literal Mode

## Update tests first

Here's a list of tests that need updating to match the correct behavior of output-literal mode:

### 1. OutputService Tests

1. **Tests in `Transformation Mode` describe block (line 262)**
   - These tests expect newline normalization even in transformation mode
   - Need to update to expect preservation of original newlines

2. **Test `should respect output-literal mode at directive boundaries` (line 787)**
   - Current test checks for absence of triple newlines
   - Should test for exact preservation of original newlines instead

3. **Tests for variable reference processing**
   - Need to update to verify exact preservation of format in output-literal mode
   - Remove expectations for special formatting of arrays and objects

### 2. EmbedDirectiveHandler Tests

1. **Tests in `EmbedDirectiveHandler.transformation.test.ts`**
   - Need to verify exact preservation of newlines in embedded content
   - Remove expectations for newline normalization

2. **Test for variable interpolation in embeds (line 299)**
   - Update expectations to preserve exact formatting

3. **Test for variable reference embeds (line 329)**
   - Update to verify exact preservation of original format

### 3. RunDirectiveHandler Tests

1. **Tests in `RunDirectiveHandler.transformation.test.ts`**
   - Need to verify exact preservation of command output format
   - Remove expectations for special handling of output

### 4. ImportDirectiveHandler Tests

1. **Tests in `ImportDirectiveHandler.transformation.test.ts`**
   - Update tests to verify imported content preserves exact formatting

### 5. Integration Tests

1. **Tests in `api/integration.test.ts` (lines 1164, 1171, 1250)**
   - Update to remove the temporary fixes that manually set variables
   - Fix the underlying issue in ImportDirectiveHandler
   - Ensure tests verify the correct behavior with exact newline preservation

### 6. API Layer Tests

1. **Add new tests to `api/index.test.ts`**
   - Create tests to verify the removal of newline workarounds
   - Ensure each workaround removal doesn't break functionality

### Updated Test Examples

Here are examples of how to update some key tests:

```typescript
// For OutputService test
it('should preserve exact formatting in output-literal mode', async () => {
  // Multiple newlines in original content
  const textWithMultipleNewlines = 'Line 1\n\n\nLine 2';
  const nodes = [createTextNode(textWithMultipleNewlines, createLocation(1, 1))];
  
  // Enable output-literal mode
  vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
  
  // Process the content
  const result = await service.convert(nodes, state, 'markdown');
  
  // Verify exact preservation of multiple newlines
  expect(result).toBe('Line 1\n\n\nLine 2');
});

// For colon-newline handling
it('should preserve colon-newline sequences in output-literal mode', async () => {
  const textWithColonNewline = 'Status:\nActive';
  const nodes = [createTextNode(textWithColonNewline, createLocation(1, 1))];
  
  // Enable output-literal mode
  vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
  
  // Process the content
  const result = await service.convert(nodes, state, 'markdown');
  
  // Verify preservation of colon-newline
  expect(result).toBe('Status:\nActive');
});
```

These tests need to be updated to enforce the correct behavior of preserving formatting exactly as is in output-literal mode. This will help ensure that the implementation is correct and that the workarounds can be safely removed.


### 1. Update OutputService Behavior

#### A. Fix the `handleNewlines` Method
```typescript
private handleNewlines(content: string, context: FormattingContext): string {
  if (!content) return content;
  
  // In output-literal mode, preserve EXACTLY as is with NO modifications
  if (context.isOutputLiteral ?? context.transformationMode) {
    return content; // Return content unchanged
  }
  
  // Only apply normalization in output-normalized mode
  // ... rest of existing code for normalized mode ...
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

#### C. Remove Boundary-Based Processing
Remove or comment out the boundary detection logic that doesn't affect output in literal mode:

```typescript
// In nodeToMarkdown method
// Track if this is a boundary between different node types - not used in output-literal mode
// const isNodeBoundary = previousContext && previousContext.nodeType !== node.type;
// No special processing needed for boundaries in output-literal mode
```

### 2. Update Directive Handler Implementations

#### A. EmbedDirectiveHandler
Ensure the `EmbedDirectiveHandler` preserves exact spacing of embedded content:

```typescript
// In EmbedDirectiveHandler's execute method
if (options.isTransformationEnabled) {
  // Create a replacement text node with EXACTLY the embedded content
  // No additional formatting or newline handling
  return {
    result: DirectiveResult.success(),
    transformNodes: [
      {
        type: 'Text',
        content: embeddedContent,
        // Preserve formatting metadata from original directive
        location: directive.location
      }
    ]
  };
}
```

#### B. RunDirectiveHandler
Similar update for the RunDirectiveHandler:

```typescript
// In RunDirectiveHandler's execute method
if (options.isTransformationEnabled) {
  // Create a replacement text node with EXACTLY the command output
  // No additional formatting or newline handling
  return {
    result: DirectiveResult.success(),
    transformNodes: [
      {
        type: 'Text',
        content: commandOutput,
        location: directive.location
      }
    ]
  };
}
```

### 3. Update Variable Reference Resolution

Ensure variable reference resolution doesn't modify formatting:

```typescript
// In processVariableReference method
private async processVariableReference(reference: IVariableReference, state: IStateService, context: FormattingContext): Promise<string> {
  // ...existing code to resolve the variable...
  
  // When in output-literal mode, don't apply any formatting to the resolved value
  if (context.isOutputLiteral ?? context.transformationMode) {
    // For literal output, just convert to string without special formatting
    if (resolvedValue === null || resolvedValue === undefined) {
      return '';
    }
    
    // For objects and arrays, use JSON.stringify with proper indentation
    if (typeof resolvedValue === 'object') {
      return JSON.stringify(resolvedValue, null, 2);
    }
    
    // For primitive values, simple string conversion
    return String(resolvedValue);
  }
  
  // ...existing code for output-normalized mode...
}
```

### 4. Remove API Layer Workarounds

Remove all the regex-based workarounds in the API layer:

```typescript
// In api/index.ts
if (resultState.isTransformationEnabled()) {
  // REMOVE ALL WORKAROUNDS
  // No regex replacements needed since OutputService now correctly preserves formatting
  
  // Only keep the variable reference resolution if still needed
  const variableRegex = /\{\{([^{}]+)\}\}/g;
  const matches = Array.from(converted.matchAll(variableRegex));
  if (matches.length > 0) {
    // ... existing code for unresolved variables ...
  }
}
```

### 5. Implement Comprehensive Tests

#### A. Basic Literal Output Tests
```typescript
it('should preserve exact formatting in output-literal mode', async () => {
  // Setup a document with varied formatting
  const doc = [
    createTextNode('# Header\n\n'),
    createTextNode('Extra space here\n\n\n'),
    // Directive that will be replaced
    createDirectiveNode('embed', [
      { name: 'content', value: 'Embedded content\nWith preserved newlines' }
    ]),
    createTextNode('\nMore content')
  ];
  
  // Enable output-literal mode
  vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
  
  // Process the document
  const result = await service.convert(doc, state, 'markdown');
  
  // Verify exact preservation
  expect(result).toBe('# Header\n\nExtra space here\n\n\nEmbedded content\nWith preserved newlines\nMore content');
});
```

#### B. Variable Substitution Tests
```typescript
it('should preserve formatting during variable substitution in output-literal mode', async () => {
  // Setup text with variable references
  const nodes = [
    createTextNode('Line with {{var1}}\n'),
    createTextNode('Line with {{var2}} and {{var3}}\n\n'),
    createTextNode('Multiple\n\nNewlines\n\n\nPreserved')
  ];
  
  // Setup variables
  vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
  vi.mocked(state.getTextVar).mockImplementation((name) => {
    if (name === 'var1') return 'value1';
    if (name === 'var2') return 'value2';
    if (name === 'var3') return 'value3';
    return undefined;
  });
  
  // Mock variable reference resolution
  vi.mocked(resolutionService.resolveVariables).mockImplementation(async (text) => {
    return text
      .replace('{{var1}}', 'value1')
      .replace('{{var2}}', 'value2')
      .replace('{{var3}}', 'value3');
  });
  
  // Process the document
  const result = await service.convert(nodes, state, 'markdown');
  
  // Verify exact preservation including newlines
  expect(result).toBe('Line with value1\nLine with value2 and value3\n\nMultiple\n\nNewlines\n\n\nPreserved');
});
```

#### C. Object Property Tests
```typescript
it('should render objects as JSON in output-literal mode', async () => {
  // Setup text with object references
  const nodes = [createTextNode('Object: {{object}}\nProperty: {{object.prop}}')];
  
  // Setup state with object variable
  vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
  vi.mocked(state.getDataVar).mockImplementation((name) => {
    if (name === 'object') return { prop: 'value', other: 123 };
    return undefined;
  });
  
  // Mock variable reference resolution
  vi.mocked(resolutionService.resolveVariables).mockImplementation(async (text) => {
    if (text.includes('{{object}}')) {
      return text.replace('{{object}}', JSON.stringify({ prop: 'value', other: 123 }, null, 2));
    }
    if (text.includes('{{object.prop}}')) {
      return text.replace('{{object.prop}}', 'value');
    }
    return text;
  });
  
  // Process the document
  const result = await service.convert(nodes, state, 'markdown');
  
  // Verify object is rendered as JSON with exact newline preservation
  expect(result).toContain('Object: {\n  "prop": "value",\n  "other": 123\n}');
  expect(result).toContain('Property: value');
});
```

### 6. Validate with Your Example

Create an integration test that verifies your specific example:

```typescript
it('should correctly process a complex document in output-literal mode', async () => {
  // Setup the complex document from the example
  await context.fs.writeFile('source.meld', '>> comment\n@text variable = "testing 123"\n@text othervar = "hello"...');
  
  // Process with output-literal mode
  const result = await api.processFile('source.meld', { transformationEnabled: true });
  
  // Verify the exact expected output
  expect(result).toBe('# header\n\nextra space here\n\n\ntesting 123 hello\ntesting123       hello\ntesting123hello\ntesting more...');
});
```

### 7. Implementation Order

1. First fix `handleNewlines` to not modify content in output-literal mode
2. Update `convertToMarkdown` to not add spacing between nodes
3. Fix directive handlers to preserve exact formatting
4. Update variable resolution to maintain formatting
5. Implement tests to validate the behavior
6. Remove API layer workarounds once tests pass
7. Add an integration test with the complex example

This approach focuses solely on getting output-literal mode working correctly as a foundation, making sure it preserves the exact document formatting while processing directives. The post-processing with Prettier can be added later as a separate feature.
