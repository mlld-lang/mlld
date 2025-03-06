Below is a clarified, evidence-driven plan for methodically resolving the transformation issues, state management bugs, and mismatches between real and mock services—all while preserving passing tests as we proceed. It incorporates the high-level advice of instrumenting each step, auditing our interfaces, and aligning mocks with real services. It is broken into phases to ensure incremental progress without regressions.

────────────────────────────────────────────────────────────────────
PHASE 0: CONTEXT & GOALS
────────────────────────────────────────────────────────────────────

Before making any changes, we must align on what we are trying to accomplish and how it fits into our existing Meld architecture and testing approach.

1. Context:
   • Meld interprets directive-based text into an AST, processes directives (possibly transforming or removing them), and generates output (Markdown, XML, etc.).  
   • "StateService" manages variables, transformations, and can clone its internal state for nested or repeated directive processing.  
   • "DirectiveService" and its handlers produce results that may replace directives in the final AST (transformation mode).  
   • The "OutputService" consumes nodes: if in transformation mode, it should see only text/code nodes and never see directive definitions.  
   • Mocks in tests sometimes omit partial implementations (like "clone()"), leading to runtime errors in integration or API tests.

2. Key Goals:
   1) Eliminate errors around missing or incorrect state methods (e.g. "currentState.clone is not a function").  
   2) Ensure transformation mode consistently replaces directives with their processed output, so the final output shows "test output" instead of raw directives like "@run [echo test]."  
   3) Maintain high test coverage and pass existing tests (unless a test's expectation is flatly incorrect).

3. High-Level Purpose:
   This plan ensures a stable approach to directive transformation—replacing directives with textual or code content—while retaining a well-defined "StateService" interface and consistent test mocks. By the end of these phases, "run" directives, "embed" directives, and others should yield correct transformed nodes, and all code paths (API, integration, unit) should rely on consistent service initializations.

4. Critical Dependencies:
   • State Management:
     - StateService clone operation must preserve transformation state
     - Child states must inherit transformation settings
     - State merging must handle transformed nodes correctly
   • Handler Flow:
     - Handlers must check transformation mode before replacing nodes
     - Node replacement must preserve source locations
     - Error handling must work in both modes
   • Test Infrastructure:
     - TestContext initialization must support both modes
     - Mock services must implement full interfaces
     - Integration tests must use consistent service setup


────────────────────────────────────────────────────────────────────
PHASE 1: INTERFACE & MOCK ALIGNMENT (2-3 days)
────────────────────────────────────────────────────────────────────

Objective: Rigorously align our service interfaces, the real implementations, and our test mocks before modifying any production code paths for transformation. This prevents repeated "ping-pong" fixes later.

1. Update IStateService Interface:
   ```typescript
   interface IStateService {
     // ... existing methods ...
     
     // Node transformation methods
     isTransformationEnabled(): boolean;
     enableTransformation(enable: boolean): void;
     getTransformedNodes(): MeldNode[];
     setTransformedNodes(nodes: MeldNode[]): void;
     transformNode(original: MeldNode, transformed: MeldNode): void;
   }
   ```

2. Update Test Factory Mocks:
   ```typescript
   export function createMockStateService(): IStateService {
     return {
       // ... existing mock methods ...
       isTransformationEnabled: vi.fn().mockReturnValue(false),
       enableTransformation: vi.fn(),
       getTransformedNodes: vi.fn().mockReturnValue([]),
       setTransformedNodes: vi.fn(),
       transformNode: vi.fn()
     };
   }
   ```

3. Verify StateService Implementation:
   ```typescript
   class StateService implements IStateService {
     private _transformationEnabled: boolean = false;
     private currentState: StateNode;

     enableTransformation(enable: boolean): void {
       if (this._transformationEnabled === enable) return;
       this._transformationEnabled = enable;
       
       // Initialize transformed nodes if enabling
       if (enable) {
         this.updateState({
           transformedNodes: [...this.currentState.nodes]
         }, 'enableTransformation');
       }
     }

     clone(): IStateService {
       const cloned = new StateService();
       cloned.currentState = this.stateFactory.createState({
         source: 'clone',
         filePath: this.currentState.filePath
       });

       // Copy all state including transformation
       cloned.updateState({
         variables: {
           text: new Map(this.currentState.variables.text),
           data: new Map(this.currentState.variables.data),
           path: new Map(this.currentState.variables.path)
         },
         commands: new Map(this.currentState.commands),
         nodes: [...this.currentState.nodes],
         transformedNodes: this.currentState.transformedNodes 
           ? [...this.currentState.transformedNodes] 
           : undefined,
         imports: new Set(this.currentState.imports)
       }, 'clone');

       // Copy flags
       cloned._isImmutable = this._isImmutable;
       cloned._transformationEnabled = this._transformationEnabled;

       return cloned;
     }
   }
   ```

4. Deliverables & Exit Criteria:
   • Updated IStateService with complete transformation interface
   • Updated mock implementations in test factories
   • Verified StateService implementation
   • All existing tests should still pass


────────────────────────────────────────────────────────────────────
PHASE 2: MINI TESTS & EVIDENCE COLLECTION (1-2 days)
────────────────────────────────────────────────────────────────────

Objective: Build small, targeted test suites to verify that the newly aligned real services and mocks behave as expected in isolation. This clarifies where transformation fails or where a "clone" method might be returning incomplete objects.

1. "StateService.clone.test.ts":
   ```typescript
   describe('StateService clone behavior', () => {
     it('properly clones all state including transformation', () => {
       const state = new StateService();
       state.enableTransformation(true);
       state.setTextVar('test', 'value');
       state.addNode(createTextNode('original'));
       
       const cloned = state.clone();
       
       // Verify transformation state
       expect(cloned.isTransformationEnabled()).toBe(true);
       
       // Verify independent copies
       expect(cloned.getNodes()).toEqual(state.getNodes());
       expect(cloned.getNodes()).not.toBe(state.getNodes());
       
       // Verify variables copied
       expect(cloned.getTextVar('test')).toBe('value');
     });

     it('maintains parent/child relationships during clone', () => {
       const parent = new StateService();
       const child = parent.createChildState();
       child.enableTransformation(true);
       
       const clonedChild = child.clone();
       
       expect(clonedChild.isTransformationEnabled()).toBe(true);
       // Verify other relationships...
     });
   });
   ```

2. "TransformationMode.test.ts":
   ```typescript
   describe('transformation pipeline', () => {
     it('replaces directive with output in full pipeline', async () => {
       const state = new StateService();
       state.enableTransformation(true);
       
       const directive = createRunDirective('echo test');
       const interpreter = new InterpreterService();
       // Initialize with real services
       
       const result = await interpreter.interpret([directive], {
         state,
         filePath: 'test.meld'
       });
       
       const transformed = result.getTransformedNodes();
       expect(transformed).toHaveLength(1);
       expect(transformed[0].type).toBe('Text');
       expect(transformed[0].content).toBe('test\n');
     });
   });
   ```

3. Basic Logging / Instrumentation:
   ```typescript
   // Add to StateService
   private logStateOperation(operation: string, details: any) {
     logger.debug('StateService operation', {
       operation,
       transformationEnabled: this._transformationEnabled,
       details,
       stack: new Error().stack
     });
   }
   ```

4. Deliverables & Exit Criteria:
   • Passing isolation tests for clone and transformation
   • Log output showing correct behavior
   • No changes to production code yet
   • Understanding of real service behavior


────────────────────────────────────────────────────────────────────
PHASE 3: INSTRUMENT FAILING INTEGRATION TESTS (1-2 days)
────────────────────────────────────────────────────────────────────

Objective: Now that we trust the StateService and mock setups, locate precisely where the failing large-scope tests diverge from the proven mini-tests.

1. Add Debug Instrumentation:
   ```typescript
   // In api/api.test.ts
   describe('SDK Integration Tests', () => {
     beforeEach(() => {
       // Add detailed logging
       logger.level = 'debug';
     });

     it('should handle execution directives correctly', async () => {
       // Log initial setup
       logger.debug('Test setup', {
         stateType: state.constructor.name,
         hasClone: typeof state.clone === 'function',
         transformationEnabled: state.isTransformationEnabled?.()
       });

       // ... existing test code ...

       // Log after interpretation
       logger.debug('After interpret', {
         resultType: result.constructor.name,
         hasTransformedNodes: Boolean(result.getTransformedNodes?.()),
         nodeTypes: result.getNodes().map(n => n.type)
       });
     });
   });
   ```

2. Compare with Passing Tests:
   ```typescript
   // In a passing test file
   describe('passing transformation test', () => {
     it('works correctly', async () => {
       // Log same data points as failing test
       logger.debug('Passing test setup', {
         stateType: state.constructor.name,
         hasClone: typeof state.clone === 'function'
       });

       // ... test code ...

       // Compare logs with failing test
     });
   });
   ```

3. Deliverables & Exit Criteria:
   • Debug logs for all 7 failing tests
   • Comparison with passing test logs
   • Clear understanding of where behavior diverges
   • No production code changes yet


────────────────────────────────────────────────────────────────────
PHASE 4: HANDLER IMPLEMENTATION & TESTING (2-3 days)
────────────────────────────────────────────────────────────────────

Objective: Update directive handlers to support transformation mode and add comprehensive tests.

1. Update RunDirectiveHandler:
   ```typescript
   class RunDirectiveHandler implements IDirectiveHandler {
     async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
       const output = await this.executeCommand(node.directive.command);
       
       if (context.state.isTransformationEnabled()) {
         return {
           state: context.state,
           replacement: {
             type: 'Text',
             content: output,
             location: node.location // Preserve location for error reporting
           }
         };
       }
       
       return { state: context.state };
     }
   }
   ```

2. Update EmbedDirectiveHandler:
   ```typescript
   class EmbedDirectiveHandler implements IDirectiveHandler {
     async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
       const resolvedPath = await this.resolutionService.resolveInContext(
         node.directive.path,
         context
       );
       
       const content = await this.fileSystemService.readFile(resolvedPath);
       
       if (context.state.isTransformationEnabled()) {
         return {
           state: context.state,
           replacement: {
             type: 'Text',
             content,
             location: node.location
           }
         };
       }
       
       return { state: context.state };
     }
   }
   ```

3. Add Handler Tests:
   ```typescript
   // In RunDirectiveHandler.test.ts
   describe('transformation mode', () => {
     it('replaces directive with command output when transformation enabled', async () => {
       const node = createRunDirective('echo test');
       const context = {
         state: new StateService(),
         currentFilePath: 'test.meld'
       };
       context.state.enableTransformation(true);
       
       const result = await handler.execute(node, context);
       
       expect(result.replacement).toBeDefined();
       expect(result.replacement.type).toBe('Text');
       expect(result.replacement.content).toBe('test\n');
       expect(result.replacement.location).toBe(node.location);
     });

     it('preserves original behavior when transformation disabled', async () => {
       const node = createRunDirective('echo test');
       const context = {
         state: new StateService(),
         currentFilePath: 'test.meld'
       };
       
       const result = await handler.execute(node, context);
       
       expect(result.replacement).toBeUndefined();
     });
   });

   // In EmbedDirectiveHandler.test.ts
   describe('transformation mode', () => {
     it('replaces directive with file contents when transformation enabled', async () => {
       const node = createEmbedDirective('test.md');
       const context = {
         state: new StateService(),
         currentFilePath: 'test.meld'
       };
       context.state.enableTransformation(true);
       fileSystem.readFile.mockResolvedValue('file contents');
       
       const result = await handler.execute(node, context);
       
       expect(result.replacement).toBeDefined();
       expect(result.replacement.type).toBe('Text');
       expect(result.replacement.content).toBe('file contents');
       expect(result.replacement.location).toBe(node.location);
     });
   });
   ```

4. Deliverables & Exit Criteria:
   • Updated RunDirectiveHandler with transformation support
   • Updated EmbedDirectiveHandler with transformation support
   • Comprehensive handler tests for both modes
   • All existing handler tests still pass


────────────────────────────────────────────────────────────────────
PHASE 5: INTEGRATION & API TEST FIXES (2-3 days)
────────────────────────────────────────────────────────────────────

Objective: Fix failing integration tests by ensuring consistent service initialization and proper transformation handling.

1. Update OutputService:
   ```typescript
   class OutputService {
     async convert(state: IStateService, format: OutputFormat): Promise<string> {
       const nodes = state.isTransformationEnabled()
         ? state.getTransformedNodes()
         : state.getNodes();
         
       return this.nodesToFormat(nodes, format);
     }

     private async nodesToFormat(nodes: MeldNode[], format: OutputFormat): Promise<string> {
       switch (format) {
         case 'markdown':
           return this.nodesToMarkdown(nodes);
         case 'llm':
           return this.nodesToLLMXML(nodes);
         default:
           throw new Error(`Unsupported format: ${format}`);
       }
     }

     private async nodesToMarkdown(nodes: MeldNode[]): Promise<string> {
       const parts: string[] = [];
       for (const node of nodes) {
         switch (node.type) {
           case 'Text':
             parts.push(node.content);
             break;
           case 'CodeFence':
             parts.push(this.formatCodeFence(node));
             break;
           default:
             throw new Error(`Unexpected node type in transformation mode: ${node.type}`);
         }
       }
       return parts.join('\n');
     }
   }
   ```

2. Update API Integration Tests:
   ```typescript
   describe('SDK Integration Tests', () => {
     it('should handle execution directives correctly', async () => {
       const state = new StateService();
       state.enableTransformation(true);
       
       const content = '@run [echo test]';
       const nodes = await parser.parse(content);
       
       const result = await interpreter.interpret(nodes, {
         state,
         filePath: 'test.meld'
       });
       
       expect(result.getTransformedNodes()).toHaveLength(1);
       expect(result.getTransformedNodes()[0].type).toBe('Text');
       expect(result.getTransformedNodes()[0].content).toBe('test\n');
     });
   });
   ```

3. Update OutputService Tests:
   ```typescript
   describe('OutputService', () => {
     describe('Transformation Mode', () => {
       it('uses transformed nodes when transformation is enabled', async () => {
         const state = new StateService();
         state.enableTransformation(true);
         
         const originalNode = createRunDirective('echo test');
         const transformedNode = {
           type: 'Text',
           content: 'test output',
           location: originalNode.location
         };
         
         state.addNode(originalNode);
         state.transformNode(originalNode, transformedNode);
         
         const output = await service.convert(state, 'markdown');
         expect(output).toBe('test output');
       });
     });
   });
   ```

4. Deliverables & Exit Criteria:
   • Fixed OutputService transformation handling
   • Updated API integration tests
   • All 7 previously failing tests now pass
   • No regressions in existing tests


────────────────────────────────────────────────────────────────────
PHASE 6: DIRECTIVE & OUTPUT CONSISTENCY RULES (1-2 days)
────────────────────────────────────────────────────────────────────

Objective: Establish and enforce consistent rules for directive transformation across all handlers.

1. Define Transformation Rules:
   ```typescript
   // In DirectiveService
   interface TransformationRules {
     // Whether this directive type should be removed in transformation mode
     shouldRemove: boolean;
     // Whether this directive should be replaced with its output
     shouldReplace: boolean;
     // Custom transformation logic if needed
     transform?: (node: DirectiveNode) => MeldNode;
   }

   const directiveRules: Record<DirectiveKind, TransformationRules> = {
     'run': {
       shouldRemove: false,
       shouldReplace: true
     },
     'embed': {
       shouldRemove: false,
       shouldReplace: true
     },
     'text': {
       shouldRemove: true,
       shouldReplace: false
     },
     // ... rules for other directives
   };
   ```

2. Implement Rule Checking:
   ```typescript
   class DirectiveService {
     validateTransformation(node: DirectiveNode): void {
       if (!this.state.isTransformationEnabled()) return;
       
       const rules = directiveRules[node.directive.kind];
       if (!rules) {
         throw new Error(`No transformation rules for directive: ${node.directive.kind}`);
       }
       
       if (rules.shouldRemove && !rules.shouldReplace) {
         // Node should be removed entirely
         this.state.removeNode(node);
       } else if (rules.shouldReplace) {
         // Node should be replaced with its output
         const replacement = rules.transform?.(node) ?? this.defaultTransform(node);
         this.state.transformNode(node, replacement);
       }
     }
   }
   ```

3. Add Rule Validation Tests:
   ```typescript
   describe('directive transformation rules', () => {
     it('removes definition directives', async () => {
       const state = new StateService();
       state.enableTransformation(true);
       
       const textDirective = createTextDirective('var', 'value');
       await service.processDirective(textDirective, { state });
       
       expect(state.getTransformedNodes()).toHaveLength(0);
     });

     it('replaces execution directives', async () => {
       const state = new StateService();
       state.enableTransformation(true);
       
       const runDirective = createRunDirective('echo test');
       await service.processDirective(runDirective, { state });
       
       const transformed = state.getTransformedNodes();
       expect(transformed).toHaveLength(1);
       expect(transformed[0].type).toBe('Text');
     });
   });
   ```

4. Deliverables & Exit Criteria:
   • Clear rules for each directive type
   • Consistent transformation behavior
   • Tests verifying rule compliance
   • Updated documentation reflecting rules


────────────────────────────────────────────────────────────────────
PHASE 7: CLEANUP & DOCUMENTATION (1-2 days)
────────────────────────────────────────────────────────────────────

Objective: Clean up implementation, remove debugging code, and update documentation.

1. Update Architecture Documentation:
   ```markdown
   ## Transformation Mode

   When transformation mode is enabled:
   1. Directive nodes are replaced with their processed output
   2. Definition directives (@text, @data, etc.) are removed
   3. Only Text and CodeFence nodes remain in final output
   4. Original node locations are preserved for error reporting

   ### Enabling Transformation

   ```typescript
   const state = new StateService();
   state.enableTransformation(true);
   ```

   ### Handler Implementation

   Handlers must check transformation mode and return replacement nodes:
   ```typescript
   if (state.isTransformationEnabled()) {
     return {
       state,
       replacement: {
         type: 'Text',
         content: processedOutput,
         location: originalNode.location
       }
     };
   }
   ```
   ```

2. Update Test Documentation:
   ```markdown
   ## Testing Transformation Mode

   1. Use TestContext for setup:
   ```typescript
   const context = new TestContext();
   context.services.state.enableTransformation(true);
   ```

   2. Test both modes:
   - Transformation enabled: verify node replacement
   - Transformation disabled: verify original behavior

   3. Common test cases:
   - Command output replacement
   - File content embedding
   - Variable resolution
   - Error handling
   ```

3. Cleanup Tasks:
   • Remove debug logging
   • Remove temporary test code
   • Clean up commented code
   • Update JSDoc comments

4. Deliverables & Exit Criteria:
   • Updated architecture documentation
   • Updated test documentation
   • Clean codebase without debug artifacts
   • All tests passing consistently


────────────────────────────────────────────────────────────────────
TIMELINE & RESOURCE ALLOCATION
────────────────────────────────────────────────────────────────────

Total Timeline: 7-11 days

1. Phase 1: Interface & Mock Alignment (2-3 days)
   • Day 1: Interface updates and mock implementation
   • Day 2-3: Verification and testing

2. Phase 2: Mini Tests & Evidence Collection (1-2 days)
   • Day 1: StateService clone tests
   • Day 2: Transformation mode tests
   • Day 3: Basic logging and instrumentation

3. Phase 3: Instrument Failing Integration Tests (1-2 days)
   • Day 1: Debug logging for failing tests
   • Day 2: Comparison with passing tests

4. Phase 4: Handler Implementation (2-3 days)
   • Day 1: RunDirectiveHandler updates
   • Day 2: EmbedDirectiveHandler updates
   • Day 3: Handler testing

5. Phase 5: Integration & API Test Fixes (2-3 days)
   • Day 1: OutputService updates
   • Day 2: API test fixes
   • Day 3: Integration testing

6. Phase 6: Directive & Output Consistency Rules (1-2 days)
   • Day 1: Transformation rules definition
   • Day 2: Rule implementation and validation

7. Phase 7: Cleanup & Docs (1-2 days)
   • Day 1: Documentation updates
   • Day 2: Final cleanup and verification

Resource Requirements:
• 1 Senior Engineer (full-time)
• 1 Code Reviewer (part-time)
• Test Infrastructure Access
• Development Environment Setup


────────────────────────────────────────────────────────────────────
ROLLBACK PLAN
────────────────────────────────────────────────────────────────────

Each phase can be rolled back independently:

1. Phase 1 Rollback:
   • Revert interface changes
   • Restore original mock implementations
   • Remove new test cases

2. Phase 2 Rollback:
   • Revert handler changes
   • Remove transformation tests
   • Restore original handler behavior

3. Phase 3 Rollback:
   • Revert OutputService changes
   • Restore original test implementations
   • Remove transformation-specific tests

4. Phase 4 Rollback:
   • Revert documentation changes
   • Restore original comments and logs

5. Phase 5 Rollback:
   • Revert rule implementation
   • Remove rule validation tests
   • Restore original rule checking

6. Phase 6 Rollback:
   • Revert rule definition
   • Remove rule tests
   • Restore original transformation behavior

7. Phase 7 Rollback:
   • Revert cleanup tasks
   • Restore debug logging
   • Restore temporary test code

Rollback Triggers:
• Test failures in unrelated areas
• Performance degradation
• Integration issues with external systems
• Security concerns with transformation implementation
