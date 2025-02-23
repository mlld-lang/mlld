# Meld Output Processing Issues

## Overview

During the first production run of Meld, we've identified several critical issues with output processing. These issues prevent Meld from correctly processing directives and generating clean output as specified in the grammar.

## Issue 1: Directive Definitions Appearing in Output

### Description
The output currently includes the raw directive definitions themselves instead of just their processed results.

### Expected Behavior
- Plain text/markdown content should appear in output
- Results of 'run' and 'embed' directives should appear in output
- Directive definitions should NOT appear in output
- Definition/import directives (@path, @text, @data, @import, @define) should NOT appear in output
- Comment lines (>>) should NOT appear in output

### Actual Behavior
Looking at example.xml/example.md, we see:
- Directive definitions are being included verbatim
- Directive metadata (kind, identifier, etc.) is being exposed
- XML/MD structure is being created around the directives themselves

### Steps to Reproduce
1. Create a file example.meld with directives
2. Run `meld example.meld`
3. Observe output contains raw directive definitions

### Investigation Notes
- Need to examine OutputService's transformation logic
- Check if AST/State transformation is happening before output generation
- Review how directive results are being stored in state

## Issue 2: Directives Not Being Processed

### Description
The directives' content is not being processed - raw directive content appears instead of processed results.

### Expected Behavior
- @run directives should execute commands and include output
- @embed directives should include file contents
- Variable interpolation should occur
- Results should be properly formatted in output

### Actual Behavior
- Raw directive content appears in output
- Commands are not being executed
- Files are not being embedded
- Variables are not being interpolated

### Steps to Reproduce
1. Create example.meld with @run and @embed directives
2. Run `meld example.meld`
3. Observe raw directives in output instead of processed results

### Investigation Notes
- Need to examine InterpreterService directive processing
- Check DirectiveService handler execution
- Review how results are being stored in State
- Compare with prototype implementation in dev/meld-cli/src

## Issue 3: @embed Variable Input

### Description
The @embed directive is not accepting variables as input, forcing use of @text directives as a workaround.

### Expected Behavior
```meld
@embed [${role_text}]
@embed [#{task.code_review}]
```
Should work as expected, embedding the content referenced by the variables.

### Actual Behavior
Variables in @embed directives are not being processed, requiring workaround:
```meld
@text role_text = `#{role.architect}`
@embed [${role_text}]
```

### Steps to Reproduce
1. Create file with @embed directive using variable input
2. Run meld on the file
3. Observe variable not being processed

### Investigation Notes
- Not a parser limitation (parser supports this functionality)
- Need to examine DirectiveService/handlers for @embed
- Check variable resolution in ResolutionService
- Review how @embed handler processes its input

### Root Cause
After examining the EmbedDirectiveHandler and ResolutionService, the issue appears to be in the variable resolution flow:

1. **EmbedDirectiveHandler Processing**
   ```typescript
   // 1. Get path from directive
   const { path, section } = node.directive;

   // 2. Create resolution context
   const resolutionContext = {
     currentFilePath: context.currentFilePath,
     state: context.state,
     allowedVariableTypes: {
       text: true,
       data: true,
       path: true,
       command: false
     }
   };

   // 3. Resolve variables in path
   const resolvedPath = await this.resolutionService.resolveInContext(
     path,
     resolutionContext
   );
   ```

2. **Resolution Flow**
   - EmbedDirectiveHandler correctly attempts to resolve variables
   - ResolutionService has proper variable resolution support
   - The issue is in the node transformation gap:
     1. Directive is processed and path is resolved
     2. Content is read and parsed
     3. But no node replacement happens
     4. Original directive remains in AST

3. **Variable Resolution Support**
   - ResolutionService supports:
     - Text variables (${var})
     - Data variables (#{data})
     - Path variables ($path)
   - Resolution context allows all variable types
   - Variable resolution itself works correctly

4. **Missing Transformation**
   ```typescript
   // Current flow:
   1. Process directive -> resolve path -> read content
   2. Store in state
   3. Keep original directive node

   // Needed flow:
   1. Process directive -> resolve path -> read content
   2. Create new text/content node
   3. Replace directive node with content node
   ```

### Required Changes for @embed

1. **Node Transformation**
   ```typescript
   class EmbedDirectiveHandler {
     async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
       // ... existing resolution code ...

       // Create content node to replace directive
       const contentNode = {
         type: 'Text',
         content: processedContent
       };

       // Replace node in AST
       context.state.replaceNode(node, contentNode);

       return newState;
     }
   }
   ```

2. **State Service Enhancement**
   - Add node replacement capability
   - Track node relationships
   - Support AST modifications

3. **Handler Interface Update**
   ```typescript
   interface IDirectiveHandler {
     execute(node: DirectiveNode, context: DirectiveContext): Promise<{
       state: IStateService;
       replacement?: MeldNode;  // Optional replacement node
     }>;
   }
   ```

4. **Integration Changes**
   - Update InterpreterService to handle node replacements
   - Modify DirectiveService to pass replacements
   - Update OutputService to use transformed nodes

### Testing Strategy

1. **Variable Resolution Tests**
   ```typescript
   it('should handle variable input in embed path', async () => {
     const node = createEmbedDirective('${docPath}', undefined, createLocation(1, 1));
     const context = {
       state: stateService,
       currentFilePath: 'test.meld'
     };
     
     stateService.getTextVar.mockReturnValue('doc.md');
     fileSystemService.exists.mockResolvedValue(true);
     fileSystemService.readFile.mockResolvedValue('Test content');
     
     const result = await handler.execute(node, context);
     expect(result.replacement?.type).toBe('Text');
     expect(result.replacement?.content).toBe('Test content');
   });
   ```

2. **Node Replacement Tests**
   ```typescript
   it('should replace directive node with content', async () => {
     const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1));
     const context = { state: stateService };
     
     const result = await handler.execute(node, context);
     expect(stateService.replaceNode).toHaveBeenCalledWith(
       node,
       expect.objectContaining({ type: 'Text' })
     );
   });
   ```

### Implementation Plan

1. **Phase 1: Node Replacement**
   - Add node replacement to StateService
   - Update handler interface
   - Modify InterpreterService

2. **Phase 2: Variable Resolution**
   - Verify resolution context
   - Add variable resolution tests
   - Update error handling

3. **Phase 3: Integration**
   - Connect with OutputService changes
   - Update pipeline flow
   - Add end-to-end tests

## Prototype Implementation Analysis

The prototype in dev/meld-cli/src takes a fundamentally different approach to processing and output:

### Key Differences

1. **Direct AST Transformation**
   - Uses remark/unified pipeline for markdown processing
   - Transforms nodes in-place during processing
   - Replaces directive nodes with their output content
   - No separate state management or output transformation

2. **Processing Pipeline**
   ```typescript
   unified()
     .use(remarkParse)                  // Parse markdown to AST
     .use(remarkMeldDirectives)         // Identify directives
     .use(remarkProcessMeldNodes)       // Process & replace nodes
     .use(remarkMeldDirectiveHandler)   // Final handling
     .use(remarkStringify)              // Output as markdown
   ```

3. **Node Replacement Strategy**
   - When processing a directive node:
     ```typescript
     parent.children[index] = {
       type: 'html',
       value: processedContent
     } as Node;
     ```
   - Original directive node is completely replaced
   - No trace of directive in final output

4. **Command Execution**
   - Synchronous execution during processing
   - Output captured and inserted directly
   - Both stdout/stderr collected in order
   - ANSI codes stripped from output

5. **Import/Embed Handling**
   - Direct file reading and processing
   - Content immediately inserted into AST
   - Supports both markdown and code files
   - Handles section extraction

### Insights for Current Implementation

1. **AST Transformation**
   - Current implementation may be preserving nodes instead of replacing
   - Need to check if DirectiveService is transforming nodes or just processing them
   - OutputService may be seeing original nodes instead of results

2. **State Management**
   - Prototype has no separate state
   - Our StateService might be storing results but not affecting AST
   - Need to verify how state connects to output generation

3. **Processing Flow**
   - Prototype processes synchronously, top-to-bottom
   - Our pipeline may be deferring execution or storing results separately
   - Need to check if InterpreterService is actually executing commands

4. **Output Generation**
   - Prototype's output is a direct result of AST transformation
   - Our OutputService may need similar node replacement strategy
   - Consider adding pre-output transformation step

### Action Items

1. Check DirectiveService implementation:
   - Are we replacing nodes with their results?
   - How are results being stored?
   - Is AST being modified during processing?

2. Review InterpreterService:
   - Verify command execution timing
   - Check how results are being handled
   - Compare with prototype's direct replacement

3. Examine OutputService:
   - Add pre-output AST transformation
   - Consider adopting prototype's replacement strategy
   - Ensure state results are properly integrated

4. Consider Pipeline Changes:
   - May need additional processing step before output
   - Could add node transformation phase
   - Might need to modify how state affects AST

## Next Steps

1. **Investigation Priority**
   - Issue 1: Output processing (most fundamental)
   - Issue 2: Directive processing
   - Issue 3: @embed variable handling

2. **Investigation Approach**
   - Compare with prototype implementation
   - Review service interactions
   - Add logging/debugging
   - Create minimal test cases

3. **Service Focus Areas**
   - OutputService: Issue 1
   - InterpreterService: Issue 2
   - DirectiveService (@embed handler): Issue 3
   - StateService: All issues (state management)

4. **Questions to Answer**
   - How is the prototype handling output processing differently?
   - Where in the pipeline are directive results being lost?
   - How is state being transformed for output?
   - What assumptions were made during architecture design that need revision?

## Current Implementation Analysis

After examining the current implementation, here are the key findings for each issue:

### Issue 1: Directive Definitions in Output

**Root Cause**: The OutputService's `nodeToMarkdown` method is directly converting directive nodes to markdown without transformation:

```typescript
private async nodeToMarkdown(node: MeldNode, options: OutputOptions): Promise<string> {
  switch (node.type) {
    case 'Directive':
      const directiveNode = node as DirectiveNode;
      // Formats directive as JSON instead of processing its result
      return `### ${directiveNode.directive.kind} Directive\n${JSON.stringify(directiveNode.directive, null, 2)}\n\n`;
    // ...
  }
}
```

This shows that:
1. Directive nodes are being preserved in the AST
2. The OutputService is seeing raw directive nodes
3. No transformation of directives to their results is happening

### Issue 2: Directives Not Being Processed

**Root Cause**: The InterpreterService is storing nodes but not transforming them:

```typescript
switch (node.type) {
  case 'Directive':
    const directiveState = currentState.clone();
    // Just adds the node without transformation
    directiveState.addNode(node);
    currentState = await this.directiveService.processDirective(directiveNode, {
      state: directiveState,
      currentFilePath: state.getCurrentFilePath() ?? undefined
    });
    break;
}
```

The issue is:
1. Directives are processed (by DirectiveService)
2. Results are stored in state
3. But the original node is preserved in the AST
4. No node replacement with results is happening

### Issue 3: @embed Variable Input

**Root Cause**: After examining the EmbedDirectiveHandler and ResolutionService, the issue appears to be in the variable resolution flow:

1. **EmbedDirectiveHandler Processing**
   ```typescript
   // 1. Get path from directive
   const { path, section } = node.directive;

   // 2. Create resolution context
   const resolutionContext = {
     currentFilePath: context.currentFilePath,
     state: context.state,
     allowedVariableTypes: {
       text: true,
       data: true,
       path: true,
       command: false
     }
   };

   // 3. Resolve variables in path
   const resolvedPath = await this.resolutionService.resolveInContext(
     path,
     resolutionContext
   );
   ```

2. **Resolution Flow**
   - EmbedDirectiveHandler correctly attempts to resolve variables
   - ResolutionService has proper variable resolution support
   - The issue is in the node transformation gap:
     1. Directive is processed and path is resolved
     2. Content is read and parsed
     3. But no node replacement happens
     4. Original directive remains in AST

3. **Variable Resolution Support**
   - ResolutionService supports:
     - Text variables (${var})
     - Data variables (#{data})
     - Path variables ($path)
   - Resolution context allows all variable types
   - Variable resolution itself works correctly

4. **Missing Transformation**
   ```typescript
   // Current flow:
   1. Process directive -> resolve path -> read content
   2. Store in state
   3. Keep original directive node

   // Needed flow:
   1. Process directive -> resolve path -> read content
   2. Create new text/content node
   3. Replace directive node with content node
   ```

### Required Changes for @embed

1. **Node Transformation**
   ```typescript
   class EmbedDirectiveHandler {
     async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
       // ... existing resolution code ...

       // Create content node to replace directive
       const contentNode = {
         type: 'Text',
         content: processedContent
       };

       // Replace node in AST
       context.state.replaceNode(node, contentNode);

       return newState;
     }
   }
   ```

2. **State Service Enhancement**
   - Add node replacement capability
   - Track node relationships
   - Support AST modifications

3. **Handler Interface Update**
   ```typescript
   interface IDirectiveHandler {
     execute(node: DirectiveNode, context: DirectiveContext): Promise<{
       state: IStateService;
       replacement?: MeldNode;  // Optional replacement node
     }>;
   }
   ```

4. **Integration Changes**
   - Update InterpreterService to handle node replacements
   - Modify DirectiveService to pass replacements
   - Update OutputService to use transformed nodes

### Testing Strategy

1. **Variable Resolution Tests**
   ```typescript
   it('should handle variable input in embed path', async () => {
     const node = createEmbedDirective('${docPath}', undefined, createLocation(1, 1));
     const context = {
       state: stateService,
       currentFilePath: 'test.meld'
     };
     
     stateService.getTextVar.mockReturnValue('doc.md');
     fileSystemService.exists.mockResolvedValue(true);
     fileSystemService.readFile.mockResolvedValue('Test content');
     
     const result = await handler.execute(node, context);
     expect(result.replacement?.type).toBe('Text');
     expect(result.replacement?.content).toBe('Test content');
   });
   ```

2. **Node Replacement Tests**
   ```typescript
   it('should replace directive node with content', async () => {
     const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1));
     const context = { state: stateService };
     
     const result = await handler.execute(node, context);
     expect(stateService.replaceNode).toHaveBeenCalledWith(
       node,
       expect.objectContaining({ type: 'Text' })
     );
   });
   ```

### Implementation Plan

1. **Phase 1: Node Replacement**
   - Add node replacement to StateService
   - Update handler interface
   - Modify InterpreterService

2. **Phase 2: Variable Resolution**
   - Verify resolution context
   - Add variable resolution tests
   - Update error handling

3. **Phase 3: Integration**
   - Connect with OutputService changes
   - Update pipeline flow
   - Add end-to-end tests

### Architecture Gap

The key architectural difference from the prototype:

1. **State vs AST**
   - Prototype: Directly modifies AST, replacing nodes with results
   - Current: Stores results in state but preserves original AST

2. **Processing Flow**
   - Prototype: Immediate node replacement during processing
   - Current: Two-phase approach (process then output) without transformation

3. **Output Generation**
   - Prototype: Simply stringifies transformed AST
   - Current: Tries to handle both AST and state, but only uses AST

### Required Changes

1. **Node Transformation**
   - Add node transformation phase in InterpreterService
   - Replace directive nodes with their results
   - Keep state for variable tracking only

2. **Output Processing**
   - Modify OutputService to handle transformed nodes
   - Remove directive-specific output formatting
   - Use state only for variable resolution

3. **Handler Updates**
   - Update handlers to return result nodes
   - Modify DirectiveService to handle node replacement
   - Ensure EmbedDirectiveHandler properly resolves variables

4. **Pipeline Modification**
   ```typescript
   // Current flow:
   parse -> interpret -> store in state -> output raw nodes

   // Needed flow:
   parse -> interpret -> transform nodes -> output transformed nodes
   ```

### Next Investigation Steps

1. **EmbedDirectiveHandler**
   - Examine implementation
   - Check variable resolution
   - Verify path handling

2. **Node Transformation**
   - Design node replacement strategy
   - Identify transformation point
   - Plan handler modifications

3. **State Management**
   - Review state usage
   - Determine what stays in state
   - Plan state/AST separation 