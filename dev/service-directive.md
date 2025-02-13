# DirectiveService

Below is a comprehensive design for the DirectiveService, which processes raw AST nodes from meld-ast and routes them to appropriate handlers. This service does NOT perform any variable resolution itself - that is handled exclusively by the ResolutionService.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. OVERVIEW & POSITION IN THE ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The DirectiveService is responsible for:
1) Receiving raw AST nodes from meld-ast (via InterpreterService)
2) Routing each node to the appropriate handler based on directive type
3) Storing raw values without premature resolution
4) Coordinating with ResolutionService when values need to be resolved
5) Managing directive dependencies and execution order

It does NOT:
• Perform any variable resolution (ResolutionService does that)
• Parse the AST (meld-ast does that)
• Handle I/O (FileSystemService does that)
• Manage state directly (StateService does that)

Here's how it fits into the flow:

┌──────────────────────┐
│ meld-ast            │
│ (basic AST parsing) │
└──────────┬───────────┘
           │ Raw AST nodes
           │ (no resolution)
           ▼
┌──────────────────────┐
│ DirectiveService     │
├──────────────────────┤
│ • Routes to handlers │
│ • Stores raw values │
│ • Manages order     │
└──────────┬───────────┘
           │ When resolution
           │ is needed
           ▼
┌──────────────────────┐
│ ResolutionService    │
│ (handles ALL         │
│  resolution)         │
└──────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
II. DIRECTIVE HANDLERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DirectiveService uses two types of handlers:

1. Definition Handlers
   • Store raw values from AST without resolution
   • Example: @define stores raw text with unresolved ${vars}
   • Resolution happens later when values are needed

2. Execution Handlers
   • Use ResolutionService to resolve values when needed
   • Example: @run resolves command args before execution
   • Handle errors if resolution fails

Example flow:

```typescript
// 1. Raw AST from meld-ast
const node = {
  type: 'Directive',
  directive: {
    kind: 'define',
    name: 'greeting',
    value: 'Hello ${name}!' // Raw, unresolved
  }
};

// 2. Definition handler stores raw value
await defineHandler.handle(node);
// Stored in state: { greeting: 'Hello ${name}!' }

// 3. Later, when value is needed
const context = ResolutionContextFactory.forTextDirective();
const resolved = await resolutionService.resolveInContext(
  state.get('greeting'),
  context
);
// Result: "Hello World!" (if name = "World")
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
III. FILE / FOLDER STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

services/DirectiveService/
 ├─ DirectiveService.ts       # Main service implementation
 ├─ DirectiveService.test.ts  # Tests next to implementation
 ├─ IDirectiveService.ts      # Service interface
 ├─ DirectiveContext.ts       # Context for directive execution
 ├─ handlers/
 │   ├─ definition/          # Handlers that define variables
 │   │   ├─ TextHandler.ts
 │   │   ├─ TextHandler.test.ts
 │   │   ├─ DataHandler.ts
 │   │   ├─ DataHandler.test.ts
 │   │   ├─ PathHandler.ts
 │   │   ├─ PathHandler.test.ts
 │   │   ├─ DefineHandler.ts
 │   │   └─ DefineHandler.test.ts
 │   └─ execution/           # Handlers that use variables
 │       ├─ RunHandler.ts
 │       ├─ RunHandler.test.ts
 │       ├─ EmbedHandler.ts
 │       ├─ EmbedHandler.test.ts
 │       ├─ ImportHandler.ts
 │       └─ ImportHandler.test.ts
 └─ errors/
     ├─ DirectiveError.ts
     └─ DirectiveError.test.ts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IV. CORE INTERFACES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IDirectiveService.ts:
```typescript
export interface DirectiveContext {
  currentFilePath?: string;
  parentState?: IStateService;
}

export interface IDirectiveService {
  // Main directive handling
  handleDirective(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<void>;

  // Handler registration
  registerHandler(handler: IDirectiveHandler): void;
  hasHandler(kind: string): boolean;

  // Utility methods
  validateDirective(node: DirectiveNode): Promise<void>;
  createChildContext(
    parentContext: DirectiveContext,
    filePath: string
  ): DirectiveContext;
}

export interface IDirectiveHandler {
  readonly kind: string;
  execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<void>;
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V. DEFINITION HANDLERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Example of a definition handler (TextHandler.ts):
```typescript
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService
  ) {}

  async execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<void> {
    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Store raw value from AST - NO resolution
    const { name, value } = node.directive;
    // value might contain ${var}, #{data}, etc. - store as is
    await this.stateService.setTextVar(name, value);
  }
}
```

Key points for definition handlers:
• Store raw AST values without ANY resolution
• Variables in values (${var}, #{data}, etc.) are stored unresolved
• Validate only directive structure
• No dependency resolution at storage time

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VI. EXECUTION HANDLERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Example of an execution handler (RunHandler.ts):
```typescript
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService
  ) {}

  async execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<void> {
    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Get raw values from AST
    const { command, args } = node.directive;
    // command might be "$cmd(${var})" - raw from AST
    // args might contain "${var}" - raw from AST

    // 3. Create resolution context
    const resolutionContext = ResolutionContextFactory.forRunDirective();

    // 4. Use ResolutionService for ALL resolution
    const resolvedCommand = await this.resolutionService.resolveCommand(
      command,  // Raw command with variables
      args,     // Raw args with variables
      resolutionContext
    );

    // 5. Store result if needed
    if (node.directive.output) {
      await this.stateService.setTextVar(
        node.directive.output,
        resolvedCommand
      );
    }
  }
}
```

Key points for execution handlers:
• Get raw values from AST nodes
• Use ResolutionService for ALL variable resolution
• Never attempt resolution themselves
• Handle resolution errors appropriately

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VII. DIRECTIVE DEPENDENCIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Example complete flow showing raw storage and resolution:

1. Store command definition (raw from AST):
```typescript
// AST node from meld-ast for:
// @define greet(name) = @run [echo "Hello ${name}"]

// DefineHandler stores raw definition in StateService
state.setCommand('greet', {
  params: ['name'],
  body: 'echo "Hello ${name}"'  // Stored raw, unresolved
});
```

2. Use command (resolution):
```typescript
// AST node from meld-ast for:
// @run [$greet(${user})]

// RunHandler uses ResolutionService for everything
const resolved = await resolutionService.resolveCommand(
  '$greet(${user})',  // Raw command reference
  [],                 // No direct args
  context
);
// ResolutionService handles:
// 1. Resolving ${user} to actual value
// 2. Looking up greet command
// 3. Substituting parameters
// 4. Resolving final command
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIII. ERROR HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DirectiveError.ts:
```typescript
export class DirectiveError extends Error {
  constructor(
    message: string,
    public readonly kind: string,
    public readonly code: DirectiveErrorCode,
    public readonly details?: {
      node?: DirectiveNode;
      context?: DirectiveContext;
      cause?: Error;
    }
  ) {
    super(`Directive error (${kind}): ${message}`);
    this.name = 'DirectiveError';
  }
}

export enum DirectiveErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  HANDLER_NOT_FOUND = 'HANDLER_NOT_FOUND'
}
```

Error handling strategy:
1. Validation errors - from ValidationService
2. Resolution errors - from ResolutionService
3. Execution errors - from handlers
4. All wrapped in DirectiveError

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IX. TESTING APPROACH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Key test areas:

1. Definition Handlers
• Raw value storage
• Validation handling
• State updates
• No resolution attempts

2. Execution Handlers
• Resolution context creation
• Variable resolution
• Command execution
• Error handling

3. Handler Dependencies
• @define → @run flow
• Variable interpolation
• Path resolution

Example test:
```typescript
describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let resolution: MockResolutionService;
  let state: MockStateService;
  
  beforeEach(() => {
    resolution = new MockResolutionService();
    state = new MockStateService();
    handler = new RunDirectiveHandler(
      new MockValidationService(),
      resolution,
      state
    );
  });

  it('should resolve command before execution', async () => {
    // 1. Setup command
    state.setCommand('greet', {
      params: ['name'],
      body: 'echo "Hello ${name}"'
    });

    // 2. Create directive node
    const node = createDirectiveNode('run', {
      command: '$greet',
      args: ['${user}']
    });

    // 3. Execute
    await handler.execute(node, { currentFilePath: 'test.md' });

    // 4. Verify resolution was called
    expect(resolution.resolveCommand).toHaveBeenCalledWith(
      '$greet',
      ['${user}'],
      expect.any(Object)
    );
  });
});
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCLUSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The DirectiveService provides:
1. Clean separation between definition and execution
2. Proper delegation to ResolutionService
3. Clear handler responsibilities
4. Strong typing and error handling
5. Testable and maintainable design

This design ensures:
• Variables are stored raw
• Resolution is centralized
• Dependencies are explicit
• Testing is straightforward
