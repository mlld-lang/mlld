# Implementation Plan

## Issues 

During the first production run of Meld, we've identified several critical issues with output processing. These issues prevent Meld from correctly processing directives and generating clean output as specified in the grammar.

## Issue 1: Directive Definitions Appearing in Output ⏳ (In Progress)

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

## Issue 2: Directives Not Being Processed ⏳ (In Progress)

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

## Issue 3: @embed Variable Input (Pending)

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

---

# Additional Context and Constraints

### Path Handling
- Currently using enhanced PathService for all path-related functionality
- Path resolution is consistent across @import, @embed, and @path directives
- Security constraints are maintained through PathService
- Path validation happens in PathService
- See [dev/PATHS.md] for more detail

### Testing Infrastructure
- Tests co-located with implementation files
- TestContext provides central test harness
- Mock services available through test factories
- High test coverage (484 passing tests)
- See [docs/TESTS.md] for more detail

---

# PLAN FOR ADDRESSING ISSUES

## Incremental Implementation Strategy

### Phase 1: Add New Functionality Without Breaking Existing ✅ (Completed)

1. **StateService Enhancement (Step 1)** ✅
- Added transformation support to StateNode interface
- Implemented transformation methods in StateService
- Added comprehensive tests for transformation functionality
- All tests passing

2. **DirectiveHandler Interface Update (Step 2)** ✅
- Added DirectiveResult interface with replacement node support
- Updated base handler implementation
- Maintained backward compatibility

3. **InterpreterService Feature Flag (Step 3)** ✅
- Added transformation feature flag
- Implemented node transformation support
- Maintained existing behavior when disabled

### Phase 2: Gradual Handler Migration ✅ (Completed)

1. **EmbedDirectiveHandler Migration** ✅ (Completed)
   - Update to support node replacement
   - Maintain path handling through PathService
   - Add transformation tests
   - Verify both with feature flag on/off

2. **RunDirectiveHandler Migration** ✅ (Completed)
   - Similar process to EmbedDirectiveHandler
   - Focus on command execution results
   - Add transformation tests
   - Verify both behaviors

3. **Other Handlers** ✅ (Completed)
   - ImportDirectiveHandler successfully migrated
   - Added handler-specific transformation tests
   - Verified behavior in both modes

### Phase 3: OutputService Update (Pending)

1. **Add Dual-Mode Support**
```typescript
class OutputService {
    async convert(state: IStateService, format: OutputFormat): Promise<string> {
        const nodes = this.useNewTransformation 
            ? state.getTransformedNodes()
            : state.getNodes();
        return this.nodesToFormat(nodes, format);
    }
}
```

2. **Update Tests**
   - Add transformation-aware tests
   - Verify output with both modes
   - Test complex scenarios

### Phase 3 Implementation Notes

1. **Key Learnings from Handler Migration**
   - All handlers now support both modes through `isTransformationEnabled()`
   - Transformed nodes preserve original location for error reporting
   - Each handler type has specific transformation behavior:
     - EmbedDirectiveHandler: Replaces with embedded content
     - RunDirectiveHandler: Replaces with command output
     - ImportDirectiveHandler: Removes from output (empty text node)

2. **State Management Insights**
   - Transformation state is tracked via `isTransformationEnabled()`
   - State cloning preserves transformation status
   - Child states inherit transformation mode
   - All state mutations maintain immutability

3. **Testing Strategy for OutputService**
   - Create separate transformation test file
   - Test each directive type's output behavior
   - Verify complex documents with mixed content
   - Test error cases in both modes
   - Ensure proper cleanup of directive metadata

4. **Potential Challenges**
   - Handling mixed content (directives + text)
   - Preserving formatting and whitespace
   - Managing directive-specific output rules
   - Error reporting with transformed nodes

5. **Success Criteria for Phase 3**
   - No directive definitions in output
   - Clean, properly formatted content
   - Correct handling of all directive types
   - Proper error reporting
   - Backward compatibility maintained

### Phase 4: Cleanup (Pending)

Once all handlers are migrated and tests pass:

1. Remove feature flags
2. Remove old state tracking
3. Update documentation
4. Clean up tests

## Testing Strategy

1. **Isolation**
   - New tests in *.transformation.test.ts files
   - Use TestContext for consistent setup
   - Leverage existing mock services

2. **Verification Points**
   - After each step, run full test suite
   - Verify both old and new behavior
   - Check path handling remains correct
   - Validate security constraints

3. **Coverage**
   - Maintain existing test coverage
   - Add transformation-specific cases
   - Test edge cases in both modes

## Rollback Plan

Each phase can be rolled back independently:
1. Feature flags allow quick behavior switches
2. Separate test files ease removal
3. Dual-mode implementation provides fallback

## Success Criteria

1. All 484 existing tests continue to pass
2. New transformation tests pass
3. Path handling remains secure and consistent
4. No regression in existing functionality
5. Clean separation of concerns maintained

## Test Coverage Analysis

### Existing Tests

1. **State Management** ✅
   - Variable storage and retrieval
   - Command definitions
   - State inheritance
   - State cloning

2. **Basic Directive Validation** ✅
   - Syntax validation
   - Required fields
   - Type checking

3. **Path Handling** ✅
   - Path resolution
   - Path validation
   - Directory handling

4. **Import Management** ✅
   - Circular import detection
   - Import scope
   - File resolution

### Tests Needing Changes

1. **OutputService Tests**
   ```typescript
   // Current:
   it('should convert directive nodes to markdown', async () => {
     const nodes = [createDirectiveNode('test', { value: 'example' })];
     const output = await service.convert(nodes, state, 'markdown');
     expect(output).toContain('### test Directive');
   });

   // Needed:
   it('should output directive results not definitions', async () => {
     const nodes = [createDirectiveNode('run', { command: 'echo test' })];
     const output = await service.convert(nodes, state, 'markdown');
     expect(output).toBe('test\n');
   });
   ```

2. **EmbedDirectiveHandler Tests**
   ```typescript
   // Current:
   it('should handle basic embed without modifiers', async () => {
     // Tests state updates but not node replacement
   });

   // Needed:
   it('should replace embed directive with file contents', async () => {
     const node = createEmbedDirective('test.md');
     const result = await handler.execute(node, context);
     expect(result.replacement.type).toBe('Text');
     expect(result.replacement.content).toBe('file contents');
   });
   ```

3. **RunDirectiveHandler Tests**
   ```typescript
   // Needed:
   it('should replace run directive with command output', async () => {
     const node = createRunDirective('echo test');
     const result = await handler.execute(node, context);
     expect(result.replacement.type).toBe('Text');
     expect(result.replacement.content).toBe('test\n');
   });

   it('should timeout long-running commands', async () => {
     const node = createRunDirective('sleep 1000');
     await expect(handler.execute(node, context))
       .rejects.toThrow('Command timed out');
   });
   ```

### New Tests Needed

1. **AST Transformation Tests**
   ```typescript
   describe('AST Transformation', () => {
     it('should transform directive nodes to result nodes', async () => {
       const ast = [
         createTextNode('before\n'),
         createRunDirective('echo test'),
         createTextNode('after\n')
       ];
       const result = await interpreter.process(ast);
       expect(result).toEqual([
         { type: 'Text', content: 'before\n' },
         { type: 'Text', content: 'test\n' },
         { type: 'Text', content: 'after\n' }
       ]);
     });
   });
   ```

2. **Content Verification Tests**
   ```typescript
   describe('Content Processing', () => {
     it('should process mixed content correctly', async () => {
       const input = `
         # Header
         @run [echo test]
         ## Section
         @embed [file.md]
         Footer
       `;
       const output = await process(input);
       expect(output).toBe(`
         # Header
         test
         ## Section
         embedded content
         Footer
       `);
     });
   });
   ```

## Implementation Plan

1. **Phase 1: Node Transformation**
   - Add node replacement to StateService
   - Update handler interface
   - Modify InterpreterService

2. **Phase 2: Output Processing**
   - Update OutputService to use transformed nodes
   - Remove directive-specific output formatting
   - Add content verification tests

3. **Phase 3: Command Execution**
   - Add timeout support to RunDirectiveHandler
   - Improve stdout/stderr handling
   - Add command execution tests

## Next Steps

1. Start with Phase 1 implementation
2. Add core transformation tests
3. Update existing handler tests
4. Add integration tests 

## Detailed Changes Required

### 1. StateService Updates

```typescript
interface IStateService {
  // ... existing methods ...
  
  // Node transformation methods
  addNode(node: MeldNode): void;
  transformNode(original: MeldNode, transformed: MeldNode): void;
  getOriginalNodes(): MeldNode[];
  getTransformedNodes(): MeldNode[];
}

class StateService implements IStateService {
  private originalNodes: MeldNode[] = [];
  private transformedNodes: MeldNode[] = [];

  addNode(node: MeldNode): void {
    this.originalNodes.push(node);
    this.transformedNodes.push(node);
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    const index = this.transformedNodes.indexOf(original);
    // We'll always have the original node during transformation
    this.transformedNodes[index] = transformed;
  }

  getOriginalNodes(): MeldNode[] {
    return this.originalNodes;
  }

  getTransformedNodes(): MeldNode[] {
    return this.transformedNodes;
  }
}
```

### 2. DirectiveHandler Interface Update

```typescript
interface DirectiveResult {
  state: IStateService;
  replacement?: MeldNode;  // Optional replacement node
}

interface IDirectiveHandler {
  // Update return type to include replacement node
  execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult>;
}
```

### 3. Directive Handler Updates

```typescript
class EmbedDirectiveHandler implements IDirectiveHandler {
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    // ... existing resolution code ...

    const content = await this.fileSystemService.readFile(resolvedPath);
    
    // Create transformed node while preserving original location
    const transformed: MeldNode = {
      type: 'Text',
      content,
      location: node.location  // Preserve location for error reporting
    };

    return {
      state: context.state,
      replacement: transformed
    };
  }
}

class RunDirectiveHandler implements IDirectiveHandler {
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    // ... existing command execution code ...

    const output = await executeCommand(command);
    
    // Create replacement node
    const replacement: MeldNode = {
      type: 'Text',
      content: output,
      location: node.location
    };

    return {
      state: context.state,
      replacement
    };
  }
}
```

### 4. InterpreterService Updates

```typescript
class InterpreterService {
  async interpret(nodes: MeldNode[], options: InterpretOptions): Promise<IStateService> {
    let currentState = options.initialState ?? new StateService();

    for (const node of nodes) {
      currentState.addNode(node);  // Track original node

      if (node.type === 'Directive') {
        // Process directive and get result
        const result = await this.directiveService.processDirective(node, {
          state: currentState,
          currentFilePath: options.filePath
        });

        // Transform node if handler provided replacement
        if (result.replacement) {
          currentState.transformNode(node, result.replacement);
        }

        currentState = result.state;
      }
    }

    return currentState;
  }
}
```

### 5. OutputService Simplification

```typescript
class OutputService {
  async convert(state: IStateService, format: OutputFormat): Promise<string> {
    // Use transformed nodes for output
    const nodes = state.getTransformedNodes();
    return this.nodesToFormat(nodes, format);
  }

  private async nodeToMarkdown(node: MeldNode): Promise<string> {
    switch (node.type) {
      case 'Text':
        return node.content;
      case 'CodeFence':
        return this.formatCodeFence(node);
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`);
    }
  }
}
```

### 6. Test Updates

1. **StateService Tests**
```typescript
describe('StateService node transformation', () => {
  it('should maintain both original and transformed nodes', () => {
    const state = new StateService();
    const original = createTextNode('original');
    const transformed = createTextNode('transformed');
    
    state.addNode(original);
    state.transformNode(original, transformed);
    
    expect(state.getTransformedNodes()).toEqual([transformed]);
    expect(state.getOriginalNodes()).toEqual([original]);
  });

  it('should preserve node order during transformation', () => {
    const state = new StateService();
    const node1 = createTextNode('one');
    const node2 = createDirectiveNode('run', { command: 'test' });
    const node3 = createTextNode('three');
    const transformed2 = createTextNode('two');
    
    state.addNode(node1);
    state.addNode(node2);
    state.addNode(node3);
    state.transformNode(node2, transformed2);
    
    expect(state.getTransformedNodes()).toEqual([node1, transformed2, node3]);
    expect(state.getOriginalNodes()).toEqual([node1, node2, node3]);
  });
});
```

2. **DirectiveHandler Tests**
```typescript
describe('EmbedDirectiveHandler', () => {
  it('should return replacement node with file contents', async () => {
    const node = createEmbedDirective('test.md');
    fileSystem.readFile.mockResolvedValue('file contents');
    
    const result = await handler.execute(node, context);
    
    expect(result.replacement).toBeDefined();
    expect(result.replacement.type).toBe('Text');
    expect(result.replacement.content).toBe('file contents');
  });
});
```

3. **InterpreterService Tests**
```typescript
describe('directive processing', () => {
  it('should replace directive nodes with their results', async () => {
    const directive = createRunDirective('echo test');
    const replacement = createTextNode('test output');
    
    directiveService.processDirective.mockResolvedValue({
      state: new StateService(),
      replacement
    });
    
    const result = await interpreter.interpret([directive], {});
    expect(result.getNodes()).toEqual([replacement]);
  });
});
```

### Implementation Order

1. **Phase 1a: Core Updates**
   - Add `replaceNode` to StateService
   - Update DirectiveHandler interface
   - Add corresponding tests

2. **Phase 1b: Handler Updates**
   - Update EmbedDirectiveHandler
   - Update RunDirectiveHandler
   - Add replacement node tests

3. **Phase 1c: Interpreter Updates**
   - Modify node processing to handle replacements
   - Add transformation tests
   - Test state management with replacements

4. **Phase 2: Output Cleanup**
   - Remove directive formatting code
   - Update output tests
   - Add integration tests

## Implementation Notes & Learnings

### Phase 1 Completion Notes
1. **StateService Implementation Details**
   - Transformation state is tracked via `_transformationEnabled` boolean flag
   - When enabled, `transformedNodes` array is initialized with a fresh copy of nodes
   - Transformation state and nodes are properly preserved during clone operations
   - All state mutations maintain immutability through StateFactory

2. **Key Design Decisions**
   - Opted for explicit transformation enabling/disabling rather than implicit
   - Maintained original nodes array for backward compatibility
   - Used optional `transformedNodes` in StateNode interface for cleaner typing
   - Preserved node locations for error reporting in transformed nodes

3. **Testing Insights**
   - All transformation tests are isolated in `*.transformation.test.ts` files
   - Current test coverage includes edge cases like:
     - Transformation state during cloning
     - Immutability violations
     - Invalid node transformations
     - State persistence across operations

### Considerations for Phase 2
1. **EmbedDirectiveHandler Migration**
   - Will need to handle both file content and variable interpolation
   - Must preserve file path resolution security
   - Consider caching transformed content for performance
   - Need to handle errors in both transformation and traditional modes

2. **RunDirectiveHandler Complexity**
   - Command execution is asynchronous - consider impact on transformation
   - Output capture needs to handle both stdout and stderr
   - Security implications of command execution during transformation
   - Consider timeout handling in transformation context

3. **Potential Challenges**
   - Circular dependencies in transformations
   - Error propagation through transformation chain
   - Performance impact of transformation overhead
   - Memory usage with large documents

### Critical Path Dependencies
1. **Path Resolution**
   - All file operations must go through PathService
   - Security checks must be maintained during transformation
   - Path variables need to be resolved before transformation

2. **State Management**
   - Transformations must preserve state immutability
   - Child states must handle transformed nodes correctly
   - State merging must account for transformation status

3. **Error Handling**
   - All errors must maintain original node location
   - Transformation errors should not break traditional processing
   - Clear error messages needed for transformation-specific issues
