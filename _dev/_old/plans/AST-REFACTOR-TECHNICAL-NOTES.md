# AST Refactor Technical Notes

## Critical Implementation Details

### ResolutionContext Structure
The ResolutionContext must include these methods for ResolutionService to work:
```typescript
const resolutionContext = {
  state: state,  // CRITICAL: Must pass state for variable lookup
  strict: options.strict,
  currentPath: options.filePath,
  depth: 0,
  flags: {},
  withIncreasedDepth: function() { return { ...this, depth: this.depth + 1 }; },
  withStrictMode: function(strict: boolean) { return { ...this, strict }; }
};
```

### Handler Registration Pattern
To avoid circular dependencies, use lazy registration:
```typescript
export class DirectiveService {
  private handlersInitialized = false;
  
  private ensureHandlersRegistered(): void {
    if (!this.handlersInitialized) {
      HandlerRegistry.registerWithService(this, this.container);
      this.handlersInitialized = true;
    }
  }
  
  async handleDirective(...) {
    this.ensureHandlersRegistered();  // Call before using handlers
    // ... rest of method
  }
}
```

### State Mutation Pattern
**WRONG** (creates child states):
```typescript
private async applyStateChanges(state: IStateService, changes: StateChanges) {
  const newState = state.createChild();  // DON'T DO THIS
  // Apply changes to newState
  return newState;
}
```

**RIGHT** (mutates in place):
```typescript
private async applyStateChanges(state: IStateService, changes: StateChanges) {
  if (changes.variables) {
    for (const [name, variable] of Object.entries(changes.variables)) {
      state.setVariable(variable);  // Mutate existing state
    }
  }
  return state;  // Return same instance
}
```

### AST Value Locations
Quick reference for where to find values in directive AST nodes:

| Directive | Identifier | Value/Content |
|-----------|-----------|---------------|
| text | `directive.raw.identifier` | `directive.values.content` (array) |
| data | `directive.raw.identifier` | `directive.values.value` (parsed JSON) |
| path | `directive.raw.identifier` | `directive.values.content` |
| run | n/a | `directive.values.command` or `directive.values.code` |
| exec | n/a | `directive.values.command` or `directive.values.code` |
| add | n/a | `directive.values.identifier` |
| import | n/a | `directive.values.path` |

### Service Dependencies
Real service methods vs what we thought:

| Service | Expected Method | Actual Location |
|---------|----------------|-----------------|
| exists() | PathService | FileSystemService |
| stat() | PathService | FileSystemService |
| resolvePath() | PathService | PathService ✓ |
| resolveNodes() | Takes state directly | Takes ResolutionContext with state |

### Handler Return Pattern
All handlers should return DirectiveResult:
```typescript
return {
  stateChanges: {
    variables: {
      [identifier]: variable  // Object, not array!
    }
  },
  replacement?: MeldNode[]  // Optional, for run/exec
};
```

### Testing Integration
- Use `api/index.new.ts` and `api/smoke.new.test.ts` for integration testing
- The api/ tests are the true integration tests - unit tests with mocks don't catch these issues
- When state flows through multiple directives, that's when issues appear

### Common Pitfalls
1. **Import cycles**: Watch for services importing each other
2. **Missing DI tokens**: Ensure all services registered in di-config.new.ts
3. **Adapter methods**: StateServiceAdapter needs both old and new method names
4. **Variable resolution**: Without proper ResolutionContext, variables won't interpolate
5. **Child containers**: Must register handlers in child containers too

## Important Distinctions

### TextNode vs @text Directive
- **TextNode**: Represents literal text content in the AST (between directives)
- **@text directive**: Creates a variable in state with text content
- Don't confuse these - they serve completely different purposes

### Node Types and Discriminated Unions
All AST nodes follow this pattern:
```typescript
interface SomeNode {
  type: 'SomeType';  // Discriminator for TypeScript narrowing
  nodeId: string;    // Required for state tracking
  location?: Location;  // Optional source location
  // ... node-specific properties
}
```

Use type narrowing:
```typescript
if (node.type === 'Text') {
  // TypeScript knows this is TextNode
  console.log(node.content);
}
```

### Historical Context
Previous attempts tried to add complex metadata to StateNode (parent references, transformation context, etc.). Our current approach keeps state simple - just storage, with intelligence in the AST types and handlers.