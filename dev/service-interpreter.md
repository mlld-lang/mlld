# InterpreterService

Below is a proposed design for the InterpreterService that works with meld-spec's AST nodes and types. This service orchestrates the interpretation of Meld documents while ensuring compatibility with the core Meld libraries and maintaining a clean, SOLID architecture.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. OVERVIEW & POSITION IN THE ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) The InterpreterService is responsible for orchestrating the high-level "interpretation" phase of Meld documents.  
2) It processes an AST (from meld-spec), identifies directive nodes, routes them to DirectiveService, and ensures the final state is merged into StateService.  
3) It does NOT handle I/O directly (FileSystemService does that), does NOT expand paths (PathService does that), and does NOT do final output formatting (OutputService does that).

Here's how it fits into the flow:

┌──────────────────────────────────┐  
│ meld-spec (generates AST)        │  
└─────────────┬───────────────────┘  
              │ MeldNode[]  
              ▼  
┌─────────────────────────────────────────────────────┐  
│          InterpreterService (focus of this doc)     │  
│  • Iterates AST nodes                               │  
│  • For each directive, calls DirectiveService       │  
│  • Merges changes into StateService                 │  
└─────────────┬───────────────────────────────────────┘  
              ▼ updated variables, embedded content  
┌─────────────────────────────────────────────────────┐  
│        Next steps: (OutputService / final usage)    │  
└─────────────────────────────────────────────────────┘  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
II. FILE & CLASS STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A recommended place for the InterpreterService:

services/  
  ├─ InterpreterService/  
  │   ├─ InterpreterService.ts  
  │   ├─ InterpreterService.test.ts  
  │   └─ (any sub-files if we want private helpers)  

Inside InterpreterService.ts:

--------------------------------------------------------------------------------
import { MeldNode, DirectiveNode, TextNode } from 'meld-spec';
import { IDirectiveService } from '../DirectiveService/DirectiveService';
import { IStateService } from '../StateService/StateService';
import { MeldInterpretError } from '../../core/errors/MeldError';

export interface IInterpreterService {
  interpret(nodes: MeldNode[]): Promise<void>;  
}

export class InterpreterService implements IInterpreterService {
  constructor(
    private readonly directiveService: IDirectiveService,
    private readonly stateService: IStateService
  ) {}

  public async interpret(nodes: MeldNode[]): Promise<void> {
    for (const node of nodes) {
      await this.handleNode(node);
    }
  }

  private async handleNode(node: MeldNode): Promise<void> {
    switch (node.type) {
      case 'Text':
        this.handleTextNode(node);
        break;
      case 'Directive':
        await this.handleDirectiveNode(node);
        break;
      default:
        throw new MeldInterpretError(`Unknown node type: ${node.type}`);
    }
  }

  private handleTextNode(node: TextNode) {
    // Store or track literal text lines
    this.stateService.addTextNode(node);
  }

  private async handleDirectiveNode(node: DirectiveNode) {
    // Defer to the directive service
    await this.directiveService.execute(node, this.stateService);
  }
}
--------------------------------------------------------------------------------

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
