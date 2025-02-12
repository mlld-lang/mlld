# DirectiveService

Below is a comprehensive design for the new DirectiveService, organized to align with your overall services-based architecture and testing patterns. The goal is to isolate complexity, keep directives simple and SOLID, and integrate seamlessly with core Meld libraries (meld-ast, llmxml, meld-spec). Everything here assumes no backward-compatibility is needed; we can rewrite directives and their tests from scratch in a clean, maintainable way.

─────────────────────────────────────────────────────────────────────────
1. OVERVIEW
─────────────────────────────────────────────────────────────────────────

DirectiveService is responsible for:
• Receiving an AST node representing a Meld directive (parsed by ParserService using meld-ast).  
• Looking up the correct directive handler (e.g., TextDirectiveHandler, DataDirectiveHandler) via a small registry.  
• Calling supporting services (ValidationService, InterpolationService, PathService, FileSystemService, StateService, etc.) to handle logic.  
• Updating the interpreter state with results (e.g., storing text variables, data objects, running commands).  

Directives remain small, focus on a single job, and rely on other services for heavy-lifting:
• Each directive handler does minimal orchestration.  
• No direct disk I/O or path expansions or environment lookups occur inside the handler itself; instead it calls PathService, FileSystemService, etc.  
• The directive handler then updates the StateService with final results.  

ASCII diagram of how DirectiveService fits into the bigger flow:

┌───────────────┐  
│ AST MeldNode[] │       ...from ParserService  
└───────┬────────┘  
        │ (DirectiveNode, or other node)  
        ▼  
┌─────────────────────────┐  
│    InterpreterService   │  decides "this node is a directive" →  
└───────────┬─────────────┘  
            ▼  
┌─────────────────────────────────────┐  
│         DirectiveService           │  
│   (manages a registry of handlers) │  
└───────┬────────────────────────────┘  
        │  
        │  e.g., node.directive.kind === 'text'?  
        ▼  
   ┌──────────────────────────────┐  
   │  TextDirectiveHandler        │  
   └──────────────────────────────┘  
    calls ValidationService, InterpolationService, etc.  
        │  
        ▼  
   (writes final data to StateService)

─────────────────────────────────────────────────────────────────────────
2. FILE / FOLDER STRUCTURE
─────────────────────────────────────────────────────────────────────────

In your “services/” directory, create a “DirectiveService/” folder:

services/DirectiveService/
 ├─ DirectiveService.ts         # Main entry point for directive handling
 ├─ DirectiveRegistry.ts        # Simple class to map directive kinds → handlers
 ├─ interfaces.ts               # Common DirectiveService-related interfaces (optional)
 ├─ handlers/
 │   ├─ TextDirectiveHandler.ts
 │   ├─ DataDirectiveHandler.ts
 │   ├─ ImportDirectiveHandler.ts
 │   ├─ EmbedDirectiveHandler.ts
 │   ├─ PathDirectiveHandler.ts
 │   ├─ RunDirectiveHandler.ts
 │   ├─ DefineDirectiveHandler.ts
 │   └─ (others, as needed by grammar)
 └─ __tests__/
     ├─ directiveService.test.ts        # Integration-level tests for DirectiveService
     ├─ handlers/
     │   ├─ textDirectiveHandler.test.ts
     │   ├─ dataDirectiveHandler.test.ts
     │   ├─ ...
     └─ registry.test.ts                # Tests for the registry logic

Here’s how each piece works:

a) DirectiveService.ts  
   • Exports a class or function that receives “DirectiveNode” from the interpreter, finds the correct handler in a DirectiveRegistry, and then calls it.  

b) DirectiveRegistry.ts  
   • A small class that registers each directive handler by “kind” (e.g. "text", "data", “run”) and returns the appropriate handler on request.  

c) interfaces.ts (optional)  
   • If you want typed interfaces like “IDirectiveHandler”, “IDirectiveService”, etc., place them here.  
   • Example:
     interface IDirectiveHandler {
       canHandle(kind: string): boolean;
       execute(node: DirectiveNode, context: DirectiveContext): Promise<void>;
     }

d) handlers/*  
   • Each directive kind has its own small class implementing an interface like “IDirectiveHandler”. Minimal logic; calls ValidationService, PathService, StateService, etc.  

─────────────────────────────────────────────────────────────────────────
3. HOW DIRECTIVES CALL SUPPORTING SERVICES
─────────────────────────────────────────────────────────────────────────

We want keep each directive file very short, letting the rest of the system do the real work. Example:

(TextDirectiveHandler.ts)  
─────────────────────────────────────────────────────────────────────
import { IDirectiveHandler } from '../interfaces';
import { ValidationService } from '../../ValidationService/ValidationService';
import { InterpolationService } from '../../InterpolationService/InterpolationService';
import { StateService } from '../../StateService/StateService';

export class TextDirectiveHandler implements IDirectiveHandler {
  constructor(
    private validation: ValidationService,
    private interpolation: InterpolationService,
    private state: StateService
  ) {}

  canHandle(kind: string): boolean {
    return kind === 'text';
  }

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    // 1) Validate directive
    this.validation.validateTextDirective(node);

    // 2) Extract name/value
    const { name, value } = node.directive;

    // 3) Interpolate if necessary
    const resolvedValue = this.interpolation.resolveText(value, context);

    // 4) Update state
    this.state.setTextVar(name, resolvedValue);
  }
}
─────────────────────────────────────────────────────────────────────

Key points:  
• validation.validateTextDirective checks grammar constraints (variable naming, etc.)  
• interpolation.resolveText handles “${var}” expansions from the StateService variables  
• state.setTextVar writes to the global state.  

─────────────────────────────────────────────────────────────────────────
4. DIRECTIVES → CLEAN, ISOLATED, & SOLID
─────────────────────────────────────────────────────────────────────────

Each directive is a small self-contained piece:

• No file I/O directly in “@embed” or “@import”; instead they call FileSystemService.  
• No path expansions in “@path”; the directive calls PathService for expansions.  
• No environment variable expansions in “@run”; the directive calls EnvironmentService or InterpolationService (depending on how environment is stored).  

Hence, each directive is short, easy to read:

(ImportDirectiveHandler.ts)
─────────────────────────────────────────────────────────────────────────
export class ImportDirectiveHandler implements IDirectiveHandler {
  constructor(
    private validation: ValidationService,
    private fs: FileSystemService,
    private path: PathService,
    private circular: CircularityService,
    private state: StateService
  ) {}

  canHandle(kind: string): boolean {
    return kind === 'import';
  }

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    // 1) Validate
    this.validation.validateImportDirective(node);

    // 2) Expand file path
    const { source } = node.directive; // e.g. "@import [some_path]"
    const resolvedSource = await this.path.resolve(source);

    // 3) Detect circular import
    if (this.circular.hasSeen(resolvedSource)) {
      throw new MeldError('Circular import detected...');
    }
    this.circular.markSeen(resolvedSource);

    // 4) Read file
    const content = await this.fs.readFile(resolvedSource);

    // 5) Possibly parse or sub-interpret, etc.
    //    Often we might call the interpreter recursively with a child context

    // 6) Update state as needed
    // ...
  }
}
─────────────────────────────────────────────────────────────────────────

─────────────────────────────────────────────────────────────────────────
5. THE DIRECTIVESERVICE & REGISTRY FLOW
─────────────────────────────────────────────────────────────────────────

ASCII:  

┌────────────────────────────────────────┐  
│                DirectiveService       │  
└───────────────┬───────────────────────┘  
                │ handleDirective(node)  
                ▼  
       ┌───────────────────────────┐  
       │ DirectiveRegistry:  Map   │  
       │   "text"   → TextHandler  │  
       │   "data"   → DataHandler  │  
       │   "import" → ImportHdlr   │  
       │   ...                     │  
       └───────────────────────────┘  
                │ find handler  
                ▼  
         [some DirectiveHandler].execute(node, context)  

Inside DirectiveService.ts:

─────────────────────────────────────────────────────────────────────
import { DirectiveRegistry } from './DirectiveRegistry';

export class DirectiveService {
  constructor(private registry: DirectiveRegistry) {}

  async handleDirective(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    const handler = this.registry.findHandler(node.directive.kind);
    if (!handler) {
      throw new MeldError(`No handler for directive kind: ${node.directive.kind}`);
    }
    await handler.execute(node, context);
  }
}
─────────────────────────────────────────────────────────────────────

And DirectiveRegistry.ts:

─────────────────────────────────────────────────────────────────────
import { IDirectiveHandler } from './interfaces';

export class DirectiveRegistry {
  private handlers: IDirectiveHandler[] = [];

  register(handler: IDirectiveHandler): void {
    this.handlers.push(handler);
  }

  findHandler(kind: string): IDirectiveHandler | undefined {
    return this.handlers.find(h => h.canHandle(kind));
  }
}
─────────────────────────────────────────────────────────────────────

Then in your main wiring code, you’d do something like:

─────────────────────────────────────────────────────────────────────
const registry = new DirectiveRegistry();
registry.register(new TextDirectiveHandler(validation, interpolation, state));
registry.register(new DataDirectiveHandler(...));
registry.register(new ImportDirectiveHandler(...));
// etc.

const directiveService = new DirectiveService(registry);

─────────────────────────────────────────────────────────────────────

─────────────────────────────────────────────────────────────────────────
6. TESTING STRATEGY FOR DIRECTIVES
─────────────────────────────────────────────────────────────────────────

This design integrates perfectly with the new testing setup. We rely on:

• MemfsTestFileSystem or whichever approach for file mocks.  
• The same TestContext approach you proposed for end-to-end or integration.  
• For each directive's UNIT test, we can fully mock out FileSystemService / PathService / StateService to confirm the directive’s logic is correct.  
• For full integration tests, we create an entire scenario with Meld AST parsing.

Hence we have:

a) Unit tests (tests/unit/DirectiveService/handlers/TextDirectiveHandler.test.ts)  
   - Mocks out everything except the TextDirectiveHandler.  
   - Verify it calls “validationService.validateTextDirective(...).  
   - Check it calls “state.setTextVar(...)” with correct final string, etc.  

b) Integration tests (tests/integration/interpreterDirectives.test.ts)  
   - Use real ParserService to parse a meld doc with multiple directives.  
   - Use real DirectiveService, real Registry, real services if we like.  
   - Check that after “interpret()” the final state is as expected.  
   - Possibly check file system updates if we have “@import” or “@embed”.  

EXAMPLE UNIT TEST for “TextDirectiveHandler”:

tests/unit/DirectiveService/handlers/TextDirectiveHandler.test.ts  
─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { TextDirectiveHandler } from '../../../../services/DirectiveService/handlers/TextDirectiveHandler';
import { ValidationService } from '../../../../services/ValidationService/ValidationService';
import { InterpolationService } from '../../../../services/InterpolationService/InterpolationService';
import { StateService } from '../../../../services/StateService/StateService';
import { DirectiveNode } from 'meld-spec';

describe('TextDirectiveHandler', () => {
  it('stores text after validation/interpolation', async () => {
    // 1) create mocks
    const mockValidation = { validateTextDirective: vi.fn() } as unknown as ValidationService;
    const mockInterpolation = { resolveText: vi.fn().mockReturnValue("Hello Resolved") } as unknown as InterpolationService;
    const mockState = { setTextVar: vi.fn() } as unknown as StateService;

    // 2) build directive handler
    const handler = new TextDirectiveHandler(mockValidation, mockInterpolation, mockState);

    // 3) create a test node
    const node: DirectiveNode = {
      type: 'Directive',
      directive: { kind: 'text', name: 'greeting', value: 'Hello ${person}' },
      location: { start: { line:1, column:1 }, end: { line:1, column:20 } }
    };

    // 4) call execute
    await handler.execute(node, { /* directive context object */ } as any);

    // 5) assert calls
    expect(mockValidation.validateTextDirective).toHaveBeenCalledWith(node);
    expect(mockInterpolation.resolveText).toHaveBeenCalledWith('Hello ${person}', expect.anything());
    expect(mockState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Resolved');
  });
});
─────────────────────────────────────────────────────────────────────

EXAMPLE INTEGRATION TEST for “DirectiveService” as a whole:

tests/integration/directiveService.test.ts  
─────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../utils/TestContext'; // your memfs + parser + etc
import { DirectiveService } from '../../services/DirectiveService/DirectiveService';
import { DirectiveRegistry } from '../../services/DirectiveService/DirectiveRegistry';
import { TextDirectiveHandler } from '../../services/DirectiveService/handlers/TextDirectiveHandler';
// ...other imports

describe('DirectiveService Integration', () => {
  let context: TestContext;
  let directiveService: DirectiveService;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();

    const registry = new DirectiveRegistry();
    registry.register(new TextDirectiveHandler(context.validation, context.interpolation, context.state));
    // register others too

    directiveService = new DirectiveService(registry);
  });

  afterEach(() => {
    context.cleanup();
  });

  it('handles a text directive end-to-end', async () => {
    // 1) Create a .meld file in memfs
    context.fs.writeFile('example.meld', '@text greeting = "${hello}"');

    // 2) parse
    const ast = context.parseMeld(context.fs.readFile('example.meld'));

    // 3) interpret the directive
    //    simulate a single node interpreter
    await directiveService.handleDirective(ast[0] as DirectiveNode, { /* directive context */ });

    // 4) check state
    expect(context.state.getTextVar('greeting')).toBe('something');
  });
});
─────────────────────────────────────────────────────────────────────

─────────────────────────────────────────────────────────────────────────
7. KEEPING IT SOLID
─────────────────────────────────────────────────────────────────────────

Each principle is well-addressed:

• Single Responsibility: Directive handlers do “one thing”; file I/O is in FileSystemService, path expansions in PathService, etc.  

• Open/Closed: Adding a new directive is easy—just build a new handler, register it. The rest of the system remains untouched.  

• Liskov Substitution: All directive handlers share the IDirectiveHandler interface. Any new directive can be substituted in the registry without breaking clients.  

• Interface Segregation: We have small interfaces for each specialized service. No single big “God interface.”  

• Dependency Inversion: Directive handlers receive references to the necessary services in their constructors, rather than constructing them.  

─────────────────────────────────────────────────────────────────────────
8. FINAL NOTES / WRAP UP
─────────────────────────────────────────────────────────────────────────

With this design:

1) We preserve your bigger architecture, with parsers, interpreters, a stateful pipeline, and llmxml for final outputs.  
2) DirectiveService stays small and clean; it just routes to directive handlers.  
3) Each directive handler is trivially tested.  
4) Integration is tested thoroughly via a hermetic in-memory file system and parse calls from meld-ast.  

The net result is a codebase that is easy to maintain, easy to read, and easy to extend with new directives or new grammar rules. It also strongly aligns with your overarching approach to “make it SOLID, well-tested, and referencing core Meld libraries for heavy-lifting.”

That’s the end state: a well-defined, well-isolated DirectiveService that you (and future team members) can be proud of!
