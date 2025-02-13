# DirectiveService

Below is a comprehensive design for the DirectiveService that aligns with the new services-based architecture. The service is organized into definition directives (@text, @data, @path, @define) and execution directives (@run, @embed, @import), with all variable resolution handled by the ResolutionService.

─────────────────────────────────────────────────────────────────────────
1. OVERVIEW
─────────────────────────────────────────────────────────────────────────

DirectiveService is responsible for:
• Receiving AST nodes from the InterpreterService
• Routing to appropriate handlers based on directive kind
• Coordinating between ValidationService and ResolutionService
• Storing raw values in StateService
• Managing directive dependencies

The service ensures:
• Definition directives store raw values
• Execution directives use ResolutionService
• Proper validation before execution
• Clean separation of concerns

ASCII diagram of the new flow:

┌───────────────┐
│ DirectiveNode │      ...from InterpreterService
└───────┬───────┘
        │
        ▼
┌─────────────────────┐
│  DirectiveService   │
├─────────────────────┤
│ Definition Handlers │──┐
│ • @text            │  │    ┌─────────────┐
│ • @data            │  ├───▶│ StateService│
│ • @path            │  │    └─────────────┘
│ • @define          │  │    ┌─────────────┐
├─────────────────────┤  ├───▶│ Resolution  │
│ Execution Handlers  │  │    │  Service    │
│ • @run             │  │    └─────────────┘
│ • @embed           │  │    ┌─────────────┐
│ • @import          │──┘    │ Validation  │
└─────────────────────┘      │  Service    │
                            └─────────────┘

─────────────────────────────────────────────────────────────────────────
2. FILE / FOLDER STRUCTURE
─────────────────────────────────────────────────────────────────────────

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

─────────────────────────────────────────────────────────────────────────
3. CORE INTERFACES
─────────────────────────────────────────────────────────────────────────

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

─────────────────────────────────────────────────────────────────────────
4. DEFINITION HANDLERS
─────────────────────────────────────────────────────────────────────────

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
    // 1. Validate directive
    await this.validationService.validate(node);

    // 2. Store raw value (no resolution)
    const { name, value } = node.directive;
    await this.stateService.setTextVar(name, value);
  }
}
```

Key points for definition handlers:
• Store raw values without resolution
• Validate directive structure
• Update state directly
• No dependency resolution

─────────────────────────────────────────────────────────────────────────
5. EXECUTION HANDLERS
─────────────────────────────────────────────────────────────────────────

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
    // 1. Validate directive
    await this.validationService.validate(node);

    // 2. Create resolution context using factory
    const resolutionContext = ResolutionContextFactory.forRunDirective();

    // 3. Resolve command and arguments
    const { command, args } = node.directive;
    const resolvedCommand = await this.resolutionService.resolveCommand(
      command,
      args,
      resolutionContext
    );

    // 4. Execute command
    // ... command execution logic
  }
}
```

Key points for execution handlers:
• Use ResolutionService for all variable resolution
• Pass appropriate resolution context
• Handle resolution errors
• Execute resolved values

─────────────────────────────────────────────────────────────────────────
6. DIRECTIVE DEPENDENCIES
─────────────────────────────────────────────────────────────────────────

Dependencies between directives are handled by ResolutionService:

1. @define → @run
• DefineHandler stores raw command definition
• RunHandler uses ResolutionService to resolve command
• ResolutionService detects command reference cycles

2. @text/@data → variable interpolation
• TextHandler/DataHandler store raw values
• ResolutionService handles ${var} and #{data} resolution
• ResolutionService detects variable reference cycles

3. @path → path contexts
• PathHandler stores raw path
• ResolutionService handles $path resolution
• Note: File import cycles are handled by CircularityService

Example flow:
```typescript
// 1. Store command definition
@define greet(name) = @run [echo "Hello ${name}"]

// DefineHandler stores raw definition in StateService
state.setCommand('greet', {
  params: ['name'],
  body: 'echo "Hello ${name}"'
});

// 2. Use command
@text greeting = @run [$greet(${user})]

// RunHandler uses ResolutionService
const resolved = await resolutionService.resolveCommand(
  'greet',
  ['${user}'],
  context
);
```

─────────────────────────────────────────────────────────────────────────
7. ERROR HANDLING
─────────────────────────────────────────────────────────────────────────

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

─────────────────────────────────────────────────────────────────────────
8. TESTING APPROACH
─────────────────────────────────────────────────────────────────────────

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

─────────────────────────────────────────────────────────────────────────
CONCLUSION
─────────────────────────────────────────────────────────────────────────

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
