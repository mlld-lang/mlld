### Standardize Text Formatting and Newline Handling
This is phase 3 of [p0-cleanup.md]

The following revised plan breaks Phase 3 into focused sub-phases to ensure stability while addressing newline handling throughout the pipeline:

#### Phase 3.1: Terminology Standardization and Foundation

**Goal**: Establish consistent terminology and foundations without changing behavior.

**Tasks**:
1. Update terminology across the codebase:
   - Rename "transformation mode" to "output-literal mode" in comments and documentation
   - Rename "standard mode" to "output-normalized mode" in comments and documentation
   - Add deprecation comments for old terminology while maintaining backward compatibility

2. Enhance FormattingContext interface definition:
   ```typescript
   interface FormattingContext {
     nodeType: string;
     transformationMode: boolean; // Keep property name for backward compatibility
     isOutputLiteral?: boolean; // Add alias for clarity
     contextType: 'inline' | 'block';
     atLineStart: boolean;
     atLineEnd: boolean;
     indentation: string;
     lastOutputEndedWithNewline: boolean;
     specialMarkdown?: 'list' | 'table' | 'code' | 'heading';
     // New: track parent context for inheritance
     parentContext?: FormattingContext;
   }
   ```

3. Create helper methods to support context management (without changing behavior):
   ```typescript
   private createFormattingContext(nodeType: string, isOutputLiteral: boolean): FormattingContext {
     // Updated to include new fields, keep behavior identical
   }
   
   private createChildContext(parentContext: FormattingContext, childNodeType: string): FormattingContext {
     // Create child context with inherited properties
   }
   ```

4. Add logging to track current newline handling:
   - Instrument critical newline handling points with detailed logging
   - Add debug logs for context changes between nodes
   - Create node boundary tracking

**Exit Criteria**:
- ✅ All terminology updated consistently in documentation and comments
- ✅ Enhanced FormattingContext interface in place with backward compatibility
- ✅ Helper methods added but not yet fully utilized
- ✅ Tests pass without changes to actual output

#### Phase 3.2: OutputService Directive Boundary Detection

**Goal**: Detect and properly handle newlines at directive boundaries.

**Tasks**:
1. Add directive boundary detection helpers:
   ```typescript
   private isDirectiveNode(node: MeldNode): boolean {
     return node.type !== 'Text' && node.type !== 'CodeFence';
   }
   
   private isDirectiveBoundary(prevNode: MeldNode, currNode: MeldNode): boolean {
     return (this.isDirectiveNode(prevNode) && !this.isDirectiveNode(currNode)) ||
            (!this.isDirectiveNode(prevNode) && this.isDirectiveNode(currNode));
   }
   ```

2. Update nodeToMarkdown method to respect directive boundaries:
   - Add special handling when processing nodes at directive boundaries
   - Ensure proper spacing when directives transition to/from text nodes
   - Maintain backward compatibility with existing output

3. Enhance block/inline node detection:
   ```typescript
   private isBlockLevelNode(node: MeldNode): boolean {
     // Improved detection logic for block-level nodes
   }
   
   private isInlineNode(node: MeldNode): boolean {
     // Improved detection logic for inline nodes
   }
   ```

4. Create specialized tests for directive boundary handling:
   - Test adjacent directives
   - Test directives followed by text
   - Test text followed by directives
   - Compare with expected output based on specification

**Exit Criteria**:
- ✅ Directive boundary detection logic implemented
- ✅ Proper spacing maintained at directive boundaries
- ✅ All tests pass with improved boundary handling
- ✅ No regression in existing functionality

#### Phase 3.3: Value Type-Specific Formatting Enhancement

**Goal**: Implement context-aware formatting for different value types.

**Tasks**:
1. Update handleNewlines method with context awareness:
   ```typescript
   private handleNewlines(content: string, context: FormattingContext): string {
     // Enhanced implementation with context-aware handling
     // Different handling for output-literal vs output-normalized modes
   }
   ```

2. Implement specialized formatters for different value types:
   ```typescript
   private formatArray(array: any[], context: FormattingContext): string {
     // Format arrays differently based on context
     // Block context: bullet list
     // Inline context: comma-separated
   }
   
   private formatObject(obj: object, context: FormattingContext): string {
     // Format objects differently based on context
     // Block context: code block
     // Inline context: compact JSON
   }
   
   private formatString(str: string, context: FormattingContext): string {
     // Handle newlines in strings differently based on context
     // Block context: preserve newlines
     // Inline context: convert to spaces
   }
   ```

3. Add context-aware value conversion:
   - Update convertToString method to use context information
   - Ensure proper type handling for different value types
   - Maintain compatibility with existing behavior

4. Create comprehensive tests for value formatting:
   - Test array formatting in different contexts
   - Test object formatting in different contexts
   - Test string with newlines in different contexts
   - Verify compliance with specified formatting rules

**Exit Criteria**:
- ✅ Context-aware value formatting implemented
- ✅ Different value types formatted according to specification
- ✅ Tests pass with improved formatting
- ✅ Regression tests confirm no unexpected changes

#### Phase 3.4: EmbedDirectiveHandler Transformation Enhancement

**Goal**: Fix EmbedDirectiveHandler to preserve content formatting in transformations.

**Tasks**:
1. Add context propagation to EmbedDirectiveHandler:
   - Pass formatting context to embedded content
   - Ensure context is preserved during transformation
   - Fix variable-based path handling with context awareness

2. Fix TextNode creation in replacement content:
   ```typescript
   // In EmbedDirectiveHandler.ts
   private createReplacementNode(content: string, originalNode: DirectiveNode): TextNode {
     // Enhanced replacement creation with context preservation
     // Maintain proper newline context from original directive
   }
   ```

3. Update variable-based embed transformation:
   - Fix how embedded content is processed with variables
   - Ensure transformations preserve context
   - Add explicit handling for newlines in directive replacements

4. Create tests for embed transformation formatting:
   - Test variable-based embed transformations
   - Test embed transformations with different content types
   - Verify proper formatting preservation in output

**Exit Criteria**:
- ✅ EmbedDirectiveHandler properly preserves content
- ✅ Variable-based embed transformations maintain formatting
- ✅ Tests verify correct formatting preservation
- ✅ No duplication of content in output

#### Phase 3.5: Cross-Service Newline Consistency

**Goal**: Ensure consistent newline handling across all pipeline services.

**Tasks**:
1. Update ParserService to standardize initial newline handling:
   - Ensure consistent newline preservation during parsing
   - Add context awareness for parsing with variables

2. Update InterpreterService for context propagation:
   - Ensure context is propagated during interpretation
   - Maintain consistent handling between original and transformed nodes
   - Fix how transformation state preserves formatting context

3. Update DirectiveService for consistent handler execution:
   - Ensure all directive handlers maintain consistent newline handling
   - Add context propagation between handlers
   - Fix import directive variable propagation with formatting context

4. Implement FormattingContext propagation across service boundaries:
   - Add context to IDirectiveHandler interface
   - Update handler execution methods to respect context
   - Ensure context is properly propagated through transformation pipeline

5. Create cross-service integration tests:
   - Test complete pipeline with different node combinations
   - Verify consistent handling throughout the pipeline
   - Test complex nested structures with imports and embeds

**Exit Criteria**:
- ✅ Consistent newline handling across all services
- ✅ Context properly propagated throughout pipeline
- ✅ All integration tests pass with consistent formatting
- ✅ No regressions in existing functionality

#### Additional Critical Guidance

This expanded revised plan maintains all the critical guidance from the original document, including:

1. **Preserve Test Compatibility**:
   - When modifying output formats, verify against existing test expectations
   - Direct tests against specific output values should be updated
   - All other dependent tests should maintain backward compatibility

2. **Prevent Variable Reference Duplication**:
   - When updating variable resolution, prevent introducing duplication
   - The same content should not appear twice because both original and replacement included
   - Always check surrounding context when replacing variable references

3. **Staged Implementation Approach**:
   - First focus on the nodeToMarkdown method for proper directive transformation handling
   - Then fix call sites to pass proper state
   - Test after each set of changes to isolate failures
   - Make minimal changes to fix each issue
   - Add comprehensive unit tests before wide-ranging variable resolution changes

4. **Context-Aware Variable Processing**:
   - Ensure FormattingContext correctly distinguishes inline and block contexts
   - No extra newlines in inline contexts
   - Tests expect transformed content to maintain original formatting
   - The processVariableReference method affects many tests

5. **Line Number Mismatch Strategy**:
   - Implement fallback when line numbers don't exactly match
   - Use 3 levels of matching: exact line number, closest line number, transformation ID

**Final Exit Criteria**:
- ✅ All sub-phases completed successfully with passing tests
- ✅ Terminology standardized across codebase
- ✅ Consistent newline handling throughout pipeline
- ✅ Proper formatting maintained for all value types in all contexts
- ✅ Directive boundaries correctly handled
- ✅ No duplication of content in variable replacements
- ✅ All original test expectations preserved or explicitly updated
