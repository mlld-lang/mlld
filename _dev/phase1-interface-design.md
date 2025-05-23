# Phase 1.2: Interface Design - AST Knows All

## Design Principles
1. **Smart Types, Dumb Services**: Services are thin coordination layers
2. **Handler Pattern**: All directive logic in dedicated handlers
3. **Immutable State Flow**: Changes returned as data
4. **Minimal Surface Area**: Only essential methods

## Core Interfaces

### IStateService (✓ Already implemented)
```typescript
export interface IStateService {
  // Identity
  readonly stateId: string;
  
  // File context
  currentFilePath: string | null;
  
  // Variable operations (minimal)
  getVariable(name: string): MeldVariable | undefined;
  setVariable(variable: MeldVariable): void;
  getAllVariables(): Map<string, MeldVariable>;
  
  // Node accumulation
  addNode(node: MeldNode): void;
  getNodes(): MeldNode[];
  
  // State hierarchy
  createChild(): IStateService;
}
```

### IResolutionService (Needs update)
```typescript
export interface IResolutionService {
  // Single entry point for all resolution
  resolve(input: ResolutionInput): Promise<string>;
  
  // Path-specific resolution
  resolvePath(path: string, context: ResolutionContext): Promise<string>;
  
  // Section extraction (consider moving to handler)
  extractSection(content: string, section: string): string;
}

export interface ResolutionInput {
  value: string | InterpolatableValue;
  context: ResolutionContext;
  type: 'text' | 'path' | 'command';
}

export interface ResolutionContext {
  state: IStateService;
  basePath: string;
  currentFilePath: string;
  // Add fields as needed, but keep minimal
}
```

### IDirectiveService (✓ Already implemented)
```typescript
export interface IDirectiveService {
  handleDirective(
    directive: DirectiveNode,
    state: IStateService,
    options: DirectiveOptions
  ): Promise<DirectiveResult>;
}

export interface DirectiveOptions {
  fs: IFileSystemService;
  resolver: IResolutionService;
  transformationEnabled?: boolean;
}

export interface DirectiveResult {
  stateChanges?: StateChanges;
  output?: string;
  error?: Error;
}

export interface StateChanges {
  variables?: Record<string, MeldVariable>;
  nodes?: MeldNode[];
  filePath?: string;
}
```

### IInterpreterService (✓ Already implemented)
```typescript
export interface IInterpreterService {
  interpret(
    nodes: MeldNode[],
    options: InterpreterOptions,
    initialState?: IStateService
  ): Promise<InterpretationResult>;
}

export interface InterpreterOptions {
  transformationEnabled?: boolean;
  outputFormat?: string;
}

export interface InterpretationResult {
  state: IStateService;
  output?: string;
  error?: Error;
}
```

### IParserService (Minimal changes)
```typescript
export interface IParserService {
  parse(content: string): ParseResult;
}

export interface ParseResult {
  nodes: MeldNode[];
  parseErrors: ParseError[];
}
```

### IOutputService (Needs state handling update)
```typescript
export interface IOutputService {
  format(
    nodes: MeldNode[],
    format: OutputFormat,
    options?: OutputOptions
  ): string;
}

export type OutputFormat = 'text' | 'markdown' | 'json' | 'xml';

export interface OutputOptions {
  includeComments?: boolean;
  preserveFormatting?: boolean;
}
```

### IFileSystemService (Keep as-is)
```typescript
export interface IFileSystemService {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStat>;
  executeCommand(command: string, options?: ExecutionOptions): Promise<string>;
  getCwd(): string;
  dirname(path: string): string;
}
```

## Handler Interface

```typescript
export interface IDirectiveHandler {
  readonly kind: DirectiveKind;
  
  handle(
    directive: DirectiveNode,
    state: IStateService,
    services: HandlerServices
  ): Promise<DirectiveResult>;
}

export interface HandlerServices {
  fs: IFileSystemService;
  resolver: IResolutionService;
  pathService: IPathService;
}
```

## Service Initialization Pattern

```typescript
// Services are initialized with minimal dependencies
class ResolutionService implements IResolutionService {
  constructor(
    private variableResolver: IVariableResolver,
    private pathResolver: IPathResolver
  ) {}
  
  async resolve(input: ResolutionInput): Promise<string> {
    // Dispatch to appropriate resolver
  }
}

// Handlers are registered lazily
class DirectiveService implements IDirectiveService {
  private handlers = new Map<DirectiveKind, IDirectiveHandler>();
  
  constructor(private handlerRegistry: HandlerRegistry) {}
  
  async handleDirective(...): Promise<DirectiveResult> {
    const handler = this.getHandler(directive.kind);
    return handler.handle(directive, state, this.services);
  }
  
  private getHandler(kind: DirectiveKind): IDirectiveHandler {
    if (!this.handlers.has(kind)) {
      this.handlers.set(kind, this.handlerRegistry.create(kind));
    }
    return this.handlers.get(kind)!;
  }
}
```

## Type Safety Through Discriminated Unions

```typescript
// AST nodes know their shape
type DirectiveNode = 
  | TextDirectiveNode
  | DataDirectiveNode
  | PathDirectiveNode
  | RunDirectiveNode
  | ExecDirectiveNode
  | AddDirectiveNode
  | ImportDirectiveNode;

// Each has specific structure
interface TextDirectiveNode {
  type: 'directive';
  kind: 'text';
  identifier: string;
  values: {
    content: InterpolatableValue;
  };
}

// Handlers can use type guards
function isTextDirective(node: DirectiveNode): node is TextDirectiveNode {
  return node.kind === 'text';
}
```

## Migration Notes

1. **StateService**: Already minimal, just need to remove adapter eventually
2. **ResolutionService**: Biggest change - consolidate all resolution methods
3. **DirectiveService**: Already minimal with lazy loading
4. **InterpreterService**: Minor updates for new state interface
5. **ParserService**: No changes needed
6. **OutputService**: Update to work with new node structure

## Benefits of This Design

1. **Testability**: Each service has single responsibility
2. **Maintainability**: Clear boundaries between services
3. **Extensibility**: Easy to add new handlers/formats
4. **Type Safety**: Discriminated unions catch errors at compile time
5. **Performance**: Minimal interface = less overhead