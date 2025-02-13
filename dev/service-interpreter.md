# InterpreterService

Below is a proposed design for the InterpreterService that works with raw AST nodes from meld-ast. This service orchestrates the interpretation of Meld documents while ensuring compatibility with the core Meld libraries and maintaining a clean, SOLID architecture.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. OVERVIEW & POSITION IN THE ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) The InterpreterService is responsible for orchestrating the high-level "interpretation" phase of Meld documents.  
2) It receives raw AST nodes from meld-ast (which only handles basic parsing), routes these unprocessed nodes to DirectiveService, and ensures the final state is merged into StateService.  
3) It does NOT handle I/O directly (FileSystemService does that), does NOT expand paths (PathService does that), and does NOT do variable resolution (ResolutionService does that).

Here's how it fits into the flow:

┌──────────────────────────────────┐  
│ meld-ast (basic AST parsing)     │  
└─────────────┬───────────────────┘  
              │ Raw MeldNode[]  
              ▼  
┌─────────────────────────────────────────────────────┐  
│          InterpreterService (focus of this doc)     │  
│  • Iterates raw AST nodes                          │  
│  • Routes each directive to DirectiveService        │  
│  • No resolution/interpolation at this stage        │  
└─────────────┬───────────────────────────────────────┘  
              ▼ raw nodes, unresolved content  
┌─────────────────────────────────────────────────────┐  
│        Next steps: (DirectiveService handles)       │  
└─────────────────────────────────────────────────────┘  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
II. FILE & CLASS STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Following the services-based architecture:

services/
 ├─ InterpreterService/
 │   ├─ InterpreterService.ts       # Main service implementation
 │   ├─ InterpreterService.test.ts  # Tests next to implementation
 │   ├─ IInterpreterService.ts      # Service interface
 │   ├─ InterpreterOptions.ts       # Options for interpretation
 │   └─ errors/
 │       ├─ InterpreterError.ts     # Interpreter-specific errors
 │       └─ InterpreterError.test.ts

Inside IInterpreterService.ts:

```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '../StateService/IStateService';
import type { IDirectiveService } from '../DirectiveService/IDirectiveService';

export interface InterpreterOptions {
  /**
   * Initial state to use for interpretation
   * If not provided, a new state will be created
   */
  initialState?: IStateService;

  /**
   * Current file path for error reporting
   */
  filePath?: string;

  /**
   * Whether to merge the final state back to the parent
   * @default true
   */
  mergeState?: boolean;
}

export interface IInterpreterService {
  /**
   * Initialize the InterpreterService with required dependencies
   */
  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void;

  /**
   * Interpret a sequence of Meld nodes
   * @returns The final state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService>;

  /**
   * Interpret a single Meld node
   * @returns The state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService>;

  /**
   * Create a new interpreter context with a child state
   * Useful for nested interpretation (import/embed)
   */
  createChildContext(
    parentState: IStateService,
    filePath?: string
  ): Promise<IStateService>;
}
```

Inside InterpreterService.ts:

```typescript
export class InterpreterService implements IInterpreterService {
  private directiveService?: IDirectiveService;
  private stateService?: IStateService;
  private initialized = false;

  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void {
    this.directiveService = directiveService;
    this.stateService = stateService;
    this.initialized = true;

    logger.debug('InterpreterService initialized');
  }

  async interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService> {
    this.ensureInitialized();

    const opts = { mergeState: true, ...options };
    let currentState = opts.initialState ?? this.stateService!.createChildState();

    if (opts.filePath) {
      currentState.setCurrentFilePath(opts.filePath);
    }

    logger.debug('Starting interpretation', {
      nodeCount: nodes.length,
      filePath: opts.filePath
    });

    try {
      for (const node of nodes) {
        currentState = await this.interpretNode(node, currentState);
      }

      // If mergeState is true and we have a parent state, merge back
      if (opts.mergeState && opts.initialState) {
        await opts.initialState.mergeChildState(currentState);
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes.length,
        filePath: opts.filePath
      });

      return currentState;
    } catch (error) {
      logger.error('Interpretation failed', {
        nodeCount: nodes.length,
        filePath: opts.filePath,
        error
      });
      throw error;
    }
  }

  async interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService> {
    logger.debug('Interpreting node', {
      type: node.type,
      location: node.location
    });

    try {
      switch (node.type) {
        case 'text':
          // Add text node to state
          state.addNode(node);
          break;

        case 'directive':
          // Process directive using DirectiveService
          await this.directiveService!.processDirective(node);
          break;

        default:
          throw new MeldInterpreterError(
            `Unknown node type: ${node.type}`,
            node.type,
            node.location?.start
          );
      }

      return state;
    } catch (error) {
      // Wrap non-MeldInterpreterErrors
      if (!(error instanceof MeldInterpreterError)) {
        throw new MeldInterpreterError(
          error.message,
          node.type,
          node.location?.start
        );
      }
      throw error;
    }
  }

  async createChildContext(
    parentState: IStateService,
    filePath?: string
  ): Promise<IStateService> {
    const childState = parentState.createChildState();
    
    if (filePath) {
      childState.setCurrentFilePath(filePath);
    }

    logger.debug('Created child interpreter context', { filePath });
    return childState;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('InterpreterService must be initialized before use');
    }
  }
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
III. DEPENDENCIES & ISOLATION STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) DirectiveService  
   - The InterpreterService does NOT itself interpret each directive's arguments or do filesystem I/O.  
   - It only calls directiveService.execute(node, stateService).  

2) StateService  
   - The InterpreterService holds a reference to StateService so that it can pass the same shared state around.  
   - Each directive modifies that same StateService with variables, data, paths, etc.  

3) No direct references to PathService or FileSystemService  
   - That is the directive's concern.  
   - This ensures the InterpreterService remains lean and decoupled.  

4) Generic error throwing with MeldInterpretError  
   - If we see unknown node types or other anomalies, we throw an interpret-level error.  
   - For directive-specific issues, directive handlers throw MeldDirectiveError, MeldEmbedError, etc.  

This design ensures that each piece is testable. The entire pipeline is tested in integration tests, but if the directive logic fails, it's the directive's fault.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IV. FLOW DETAIL (ASCII ILLUSTRATION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Here's a short ASCII diagram of the interpret process:

   interpret(nodes) ──────────────────────────────────────┐
                  for(each node)                         │
                     ▼                                    │
            ┌─────────────────────────┐                   │
            │   node.type === 'Text'  │                   │
            └─────────────────────────┘                   │
                     ▼ else if (Directive)                │
   ┌───────────────────────────────────────────────────┐   │
   │ directiveService.execute(node, stateService)      │   │
   └───────────────────────────────────────────────────┘   │
                     ▼ (updates state)                    │
   ┌───────────────────────────────────────────────────┐   │
   │ stateService merges changes, sets variables, etc.│   │
   └───────────────────────────────────────────────────┘   │
                     ▼ loop next node                    │
   (end) ─────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V. DIRECTIVE HANDLERS EXAMPLE PATTERN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Inside DirectiveService:

--------------------------------------------------------------------------------
export class DirectiveService implements IDirectiveService {
  constructor(
    private validationService: IValidationService,
    private handlers: { [kind: string]: IDirectiveHandler }
  ) {}

  public async execute(directiveNode: DirectiveNode, state: IStateService): Promise<void> {
    const handler = this.handlers[directiveNode.directive.kind];
    if (!handler) {
      throw new MeldInterpretError(`No handler for directive kind: ${directiveNode.directive.kind}`);
    }
    await handler.execute(directiveNode, state);
  }
}
--------------------------------------------------------------------------------

So the InterpreterService calls directiveService.execute(...) for each directive node.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VI. HANDLING SUB-INTERPRETATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For directives that need sub-interpretation (like @import or @embed):

--------------------------------------------------------------------------------
class ImportDirectiveHandler {
  constructor(
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private fileSystemService: IFileSystemService,
    private circularityService: ICircularityService,
  ) {}

  async execute(node: DirectiveNode, state: IStateService): Promise<void> {
    const importPath = node.directive.path;
    // check for circular reference
    this.circularityService.beginImport(importPath);
    const fileContent = await this.fileSystemService.readFile(importPath);
    
    // Use meld-spec to parse the imported content
    const subAst = this.parserService.parse(fileContent);

    // create a child state
    const childState = state.createChild();
    await this.interpreterService.interpret(subAst);

    // merge childState back
    state.mergeChild(childState);
  }
}
--------------------------------------------------------------------------------

This approach places sub-interpretation fully in the directive logic, keeping the main InterpreterService code extremely simple.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VII. TESTING STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) Unit Tests (InterpreterService.test.ts):
   - We give it a mock DirectiveService and a mock StateService.
   - Provide a small set of MeldNodes from meld-spec, ensure interpret() does the right calls.

Example:

--------------------------------------------------------------------------------
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterpreterService } from './InterpreterService';
import { DirectiveNode, TextNode } from 'meld-spec';

describe('InterpreterService (unit)', () => {
  let directiveServiceMock: any;
  let stateServiceMock: any;
  let interpreter: InterpreterService;

  beforeEach(() => {
    directiveServiceMock = { execute: vi.fn() };
    stateServiceMock = { addTextNode: vi.fn() };
    interpreter = new InterpreterService(directiveServiceMock, stateServiceMock);
  });

  it('handles text nodes by calling stateService.addTextNode', async () => {
    const textNode: TextNode = {
      type: 'Text',
      content: 'Hello!',
      location: { start: { line:1, column:1 }, end: { line:1, column:7 } }
    };
    await interpreter.interpret([textNode]);
    expect(stateServiceMock.addTextNode).toHaveBeenCalledWith(textNode);
  });

  it('handles directive nodes by calling directiveService.execute', async () => {
    const directiveNode: DirectiveNode = {
      type: 'Directive',
      directive: { kind: 'text', name: 'greeting', value: 'Hello' },
      location: { start: { line:1, column:1}, end: { line:1, column:10} }
    };
    await interpreter.interpret([directiveNode]);
    expect(directiveServiceMock.execute).toHaveBeenCalledWith(directiveNode, stateServiceMock);
  });

  it('throws error on unknown node type', async () => {
    const weirdNode = { type: 'Weird' } as any;
    await expect(interpreter.interpret([weirdNode])).rejects.toThrow('Unknown node type');
  });
});
--------------------------------------------------------------------------------

2) Integration Tests:
   - We stand up a real DirectiveService with real handlers, StateService, MemfsTestFileSystem.
   - Use meld-spec to parse test content into AST.
   - Then run the interpreter and verify state/output.

Example:

--------------------------------------------------------------------------------
describe('InterpreterService (integration)', () => {
  let context: TestContext;
  let interpreter: InterpreterService;
  let directiveService: DirectiveService;
  let stateService: StateService;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();

    // Build a minimal project
    context.builder.create({
      files: {
        'doc.meld': `
          @text greeting = "Hello!"
          Some plain text line
        `
      }
    });

    // Create the real services
    stateService = new StateService();
    directiveService = new DirectiveService(/* pass handlers */);
    interpreter = new InterpreterService(directiveService, stateService);
  });

  afterEach(() => context.cleanup());

  it('interprets a doc with a text directive + raw text lines', async () => {
    const content = context.fs.readFile('doc.meld');
    // Use meld-spec to parse
    const ast = parserService.parse(content);

    await interpreter.interpret(ast);

    expect(stateService.getTextVar('greeting')).toBe('Hello!');
  });
});
--------------------------------------------------------------------------------

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIII. CONCLUSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This InterpreterService design:

1. Works seamlessly with meld-spec's node types
2. Keeps interpretation logic clean and focused
3. Delegates complex operations to appropriate services
4. Maintains easy testability at both unit and integration levels
5. Provides a solid foundation for the Meld pipeline

By working with meld-spec's AST and keeping the interpreter focused on orchestration, we create a maintainable service that fits perfectly into the broader Meld architecture.
