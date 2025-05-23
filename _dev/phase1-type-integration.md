# Phase 1.3: Type Integration Design - AST Type Flow

## Type Flow Overview

```mermaid
graph LR
    Input[Input Text] --> Parser[ParserService]
    Parser --> AST[AST Nodes]
    AST --> Interpreter[InterpreterService]
    Interpreter --> Handler[DirectiveHandler]
    Handler --> SC[StateChanges]
    SC --> State[StateService]
    State --> Output[OutputService]
    Output --> Result[Final Output]
```

## AST Node Type Hierarchy

```typescript
// Base node types
export type MeldNode = 
  | DirectiveNode
  | ContentNode
  | CommentNode
  | SectionNode;

// Directive nodes with discriminated unions
export type DirectiveNode = 
  | TextDirectiveNode
  | DataDirectiveNode
  | PathDirectiveNode
  | RunDirectiveNode
  | ExecDirectiveNode
  | AddDirectiveNode
  | ImportDirectiveNode;

// Each directive has specific shape
export interface TextDirectiveNode {
  type: 'directive';
  kind: 'text';
  identifier: string;
  operator: '=' | '+=';
  values: {
    content: InterpolatableValue;
  };
  location: Location;
}

export interface DataDirectiveNode {
  type: 'directive';
  kind: 'data';
  identifier: string;
  values: {
    value: JsonValue; // Already parsed!
  };
  location: Location;
}

// InterpolatableValue for template content
export type InterpolatableValue = Array<ContentElement>;

export type ContentElement = 
  | { type: 'text'; value: string }
  | { type: 'variable'; node: VariableReferenceNode }
  | { type: 'code'; value: string };
```

## Handler Input/Output Types

```typescript
// Unified handler interface
export interface IDirectiveHandler<T extends DirectiveNode = DirectiveNode> {
  readonly kind: DirectiveKind;
  
  handle(
    directive: T,
    state: IStateService,
    services: HandlerServices
  ): Promise<DirectiveResult>;
}

// Handler services (injected dependencies)
export interface HandlerServices {
  fs: IFileSystemService;
  resolver: IResolutionService;
  interpreter?: IInterpreterService; // For import/run handlers
}

// Handler result
export interface DirectiveResult {
  stateChanges?: StateChanges;
  output?: string;
  error?: Error;
}

// State changes (immutable pattern)
export interface StateChanges {
  variables?: Record<string, MeldVariable>;
  nodes?: MeldNode[];
  filePath?: string;
  childStates?: StateChanges[]; // For imports
}
```

## Resolution Context Flow

```typescript
// Resolution context created from state
export interface ResolutionContext {
  state: IStateService;
  basePath: string;
  currentFilePath: string;
  depth?: number; // For circular reference detection
}

// Resolution input types
export interface ResolutionInput {
  value: string | InterpolatableValue;
  context: ResolutionContext;
  type: 'text' | 'path' | 'command';
}

// Variable resolution
export interface MeldVariable {
  name: string;
  value: JsonValue;
  type: VariableType;
  location?: Location;
}

export type VariableType = 
  | 'text'
  | 'data' 
  | 'path'
  | 'command'
  | 'template';
```

## Type Flow Examples

### 1. Text Directive Flow
```typescript
// Input AST
const textDirective: TextDirectiveNode = {
  type: 'directive',
  kind: 'text',
  identifier: 'greeting',
  operator: '=',
  values: {
    content: [
      { type: 'text', value: 'Hello ' },
      { type: 'variable', node: { name: 'user' } },
      { type: 'text', value: '!' }
    ]
  }
};

// Handler processes
const handler = new TextDirectiveHandler();
const result = await handler.handle(textDirective, state, services);

// Returns state changes
result.stateChanges = {
  variables: {
    greeting: {
      name: 'greeting',
      value: 'Hello Alice!',
      type: 'text'
    }
  }
};
```

### 2. Data Directive Flow
```typescript
// Input AST (value already parsed!)
const dataDirective: DataDirectiveNode = {
  type: 'directive',
  kind: 'data',
  identifier: 'config',
  values: {
    value: { port: 3000, host: 'localhost' }
  }
};

// Handler just stores
const result = await handler.handle(dataDirective, state, services);

// Direct storage
result.stateChanges = {
  variables: {
    config: {
      name: 'config',
      value: { port: 3000, host: 'localhost' },
      type: 'data'
    }
  }
};
```

### 3. Import Directive Flow
```typescript
// Import creates child state
const importDirective: ImportDirectiveNode = {
  type: 'directive',
  kind: 'import',
  source: { type: 'path', path: './config.meld' },
  selections: '*'
};

// Handler processes recursively
const result = await handler.handle(importDirective, state, services);

// Returns child state changes to merge
result.stateChanges = {
  childStates: [{
    variables: { /* imported vars */ }
  }]
};
```

## Type Guards and Validation

```typescript
// Type guards for safety
export function isTextDirective(node: DirectiveNode): node is TextDirectiveNode {
  return node.kind === 'text';
}

export function isVariableReference(elem: ContentElement): elem is VariableReferenceElement {
  return elem.type === 'variable';
}

// Handler type safety
class TextDirectiveHandler implements IDirectiveHandler<TextDirectiveNode> {
  readonly kind = 'text' as const;
  
  async handle(
    directive: TextDirectiveNode, // Type-safe!
    state: IStateService,
    services: HandlerServices
  ): Promise<DirectiveResult> {
    // TypeScript knows directive.values.content exists
    const resolved = await services.resolver.resolve({
      value: directive.values.content,
      context: { state, basePath: '.', currentFilePath: state.currentFilePath || '.' },
      type: 'text'
    });
    
    return {
      stateChanges: {
        variables: {
          [directive.identifier]: {
            name: directive.identifier,
            value: resolved,
            type: 'text'
          }
        }
      }
    };
  }
}
```

## Error Handling Types

```typescript
// Specialized error types
export class MeldDirectiveError extends MeldError {
  constructor(
    message: string,
    public directive: DirectiveNode,
    public cause?: Error
  ) {
    super(message);
  }
}

// Handler error results
interface DirectiveErrorResult {
  error: MeldDirectiveError;
  partial?: StateChanges; // Partial results if any
}
```

## Benefits of This Type Flow

1. **Compile-Time Safety**: TypeScript catches mismatched types
2. **Self-Documenting**: Types show exactly what each handler expects
3. **No Runtime Parsing**: AST already has parsed values
4. **Clear Boundaries**: Each layer has specific types
5. **Easy Testing**: Can construct exact AST nodes for tests

## Integration Points

### Parser → Interpreter
- Parser returns `MeldNode[]`
- Interpreter filters to `DirectiveNode[]`
- Type guards ensure safety

### Interpreter → Handlers
- Interpreter selects handler by `node.kind`
- Passes typed node to handler
- Handler knows exact shape

### Handlers → State
- Handlers return `StateChanges`
- State applies changes atomically
- No direct mutations

### State → Output
- Output reads `state.getNodes()`
- Formats based on node types
- Type-safe rendering