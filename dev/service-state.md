# StateService

Below is a detailed design for the StateService that aligns with meld-spec's type definitions and the Meld grammar. This service focuses purely on variable storage and state management, while delegating all resolution logic to the ResolutionService.

TABLE OF CONTENTS
────────────────────────────────────────────────────────────────────────────
1) Overview & Goals
2) Variable Types from meld-spec
3) State Service Responsibilities
4) Code Structure & Interfaces
5) Example Usage
6) Testing Strategy
7) Integration with ResolutionService
8) Conclusion

────────────────────────────────────────────────────────────────────────────
1) OVERVIEW & GOALS
────────────────────────────────────────────────────────────────────────────

We want a dedicated "StateService" that:

• Holds the current set of Meld variables using meld-spec types
• Provides pure storage and retrieval of variables
• Maintains state hierarchy for nested "import" or "embed" usage
• Is fully testable in isolation, following SOLID
• Exposes a clear API for ResolutionService and DirectiveService

We explicitly separate concerns:
• "StateService" is ONLY about storing and managing state
• All resolution logic lives in ResolutionService
• All validation logic lives in ValidationService
• All path handling lives in PathService

────────────────────────────────────────────────────────────────────────────
2) VARIABLE TYPES FROM MELD-SPEC
────────────────────────────────────────────────────────────────────────────

According to meld-spec, we store:

• TextVariable:  
  - Raw string values from @text directive
  - No interpolation (handled by ResolutionService)

• DataVariable:  
  - Raw JSON-like objects from @data directive
  - No field resolution (handled by ResolutionService)

• PathVariable:  
  - Raw path strings from @path directive
  - No path resolution (handled by ResolutionService)

• CommandDefinition:  
  - Raw command definitions from @define directive
  - No parameter resolution (handled by ResolutionService)

────────────────────────────────────────────────────────────────────────────
3) STATE SERVICE RESPONSIBILITIES
────────────────────────────────────────────────────────────────────────────

RESPONSIBILITY #1: Pure Variable Storage  
• Store raw variable values without processing
• Maintain variable type information
• Support variable deletion and updates

RESPONSIBILITY #2: State Hierarchy  
• Provide "createChildState()" for imports/embeds
• Handle "mergeChildState(childState)" for hierarchy
• Maintain parent-child relationships

RESPONSIBILITY #3: Type Safety  
• Ensure stored values match meld-spec types
• Preserve type information for ResolutionService
• No type conversion (handled by ResolutionService)

RESPONSIBILITY #4: Import Tracking  
• Track imported files for CircularityService
• Maintain import hierarchy with state hierarchy
• Note: Variable reference cycles are handled by ResolutionService

────────────────────────────────────────────────────────────────────────────
4) CODE STRUCTURE & INTERFACES
────────────────────────────────────────────────────────────────────────────

Project Layout:
services/
 ├─ StateService/
 │   ├─ StateService.ts
 │   ├─ StateService.test.ts      # Tests next to implementation
 │   ├─ IStateService.ts
 │   └─ StateTypes.ts

Implementation:

```typescript
import { 
  TextVariable, 
  DataVariable, 
  PathVariable, 
  CommandDefinition 
} from 'meld-spec';

export interface IStateService {
  // Text variables
  setTextVar(name: string, value: TextVariable): void;
  getTextVar(name: string): TextVariable | undefined;
  hasTextVar(name: string): boolean;
  deleteTextVar(name: string): void;
  getAllTextVars(): Map<string, TextVariable>;

  // Data variables
  setDataVar(name: string, value: DataVariable): void;
  getDataVar(name: string): DataVariable | undefined;
  hasDataVar(name: string): boolean;
  deleteDataVar(name: string): void;
  getAllDataVars(): Map<string, DataVariable>;

  // Path variables
  setPathVar(name: string, value: PathVariable): void;
  getPathVar(name: string): PathVariable | undefined;
  hasPathVar(name: string): boolean;
  deletePathVar(name: string): void;
  getAllPathVars(): Map<string, PathVariable>;

  // Commands
  setCommand(name: string, command: CommandDefinition): void;
  getCommand(name: string): CommandDefinition | undefined;
  hasCommand(name: string): boolean;
  deleteCommand(name: string): void;
  getAllCommands(): Map<string, CommandDefinition>;

  // Import tracking
  addImport(filePath: string): void;
  hasImport(filePath: string): boolean;
  getImports(): Set<string>;

  // State hierarchy
  createChildState(): IStateService;
  mergeChildState(child: IStateService): void;
  getParentState(): IStateService | undefined;
  
  // Utility
  clone(): IStateService;
  clear(): void;
}

export class StateService implements IStateService {
  private textVars = new Map<string, TextVariable>();
  private dataVars = new Map<string, DataVariable>();
  private pathVars = new Map<string, PathVariable>();
  private commands = new Map<string, CommandDefinition>();
  private imports = new Set<string>();
  private parent?: StateService;

  constructor(parent?: StateService) {
    this.parent = parent;
  }

  // Implementation of interface methods...
  // Each method is simple storage/retrieval with parent fallback
  // No processing or resolution of values
}
```

────────────────────────────────────────────────────────────────────────────
5) EXAMPLE USAGE
────────────────────────────────────────────────────────────────────────────

From ResolutionService:

```typescript
class ResolutionService {
  constructor(private state: IStateService) {}

  async resolveTextVar(name: string): Promise<string> {
    const rawValue = this.state.getTextVar(name);
    if (!rawValue) {
      throw new ResolutionError(`Undefined text variable: ${name}`);
    }
    // Get appropriate context for resolution
    const context = ResolutionContextFactory.forTextContext();
    return this.resolveValue(rawValue, context);
  }
}
```

From DirectiveService:

```typescript
class TextDirectiveHandler {
  constructor(
    private state: IStateService,
    private resolution: IResolutionService
  ) {}

  async execute(node: DirectiveNode): Promise<void> {
    const { name, value } = node.directive;
    // Store raw value in state
    this.state.setTextVar(name, value);
  }
}
```

────────────────────────────────────────────────────────────────────────────
6) TESTING STRATEGY
────────────────────────────────────────────────────────────────────────────

Focus on testing:

1. Pure Storage Operations
• Setting and getting variables
• Variable existence checks
• Variable deletion
• Getting all variables of each type

2. State Hierarchy
• Child state creation
• Parent-child variable lookup
• State merging
• Proper isolation between states

3. Import Tracking
• Adding imports
• Import existence checks
• Import inheritance in hierarchy

4. Type Safety
• Proper typing of stored values
• Type preservation during operations
• No accidental type conversion

Example test:

```typescript
describe('StateService', () => {
  let state: StateService;
  
  beforeEach(() => {
    state = new StateService();
  });

  describe('variable storage', () => {
    it('should store and retrieve text variables', () => {
      state.setTextVar('greeting', 'Hello ${name}');
      expect(state.getTextVar('greeting')).toBe('Hello ${name}');
      // Note: No resolution of ${name} - that's ResolutionService's job
    });
  });

  describe('state hierarchy', () => {
    it('should inherit variables from parent', () => {
      state.setTextVar('parent', 'value');
      const child = state.createChildState();
      expect(child.getTextVar('parent')).toBe('value');
    });

    it('should isolate child changes', () => {
      const child = state.createChildState();
      child.setTextVar('child', 'value');
      expect(state.hasTextVar('child')).toBe(false);
    });
  });
});
```

────────────────────────────────────────────────────────────────────────────
7) INTEGRATION WITH RESOLUTIONSERVICE
────────────────────────────────────────────────────────────────────────────

StateService provides raw storage that ResolutionService uses to:

1. Variable Resolution
• Gets raw values from StateService
• Handles all interpolation
• Manages resolution contexts
• Handles circular references

2. Command Resolution
• Gets command definitions from StateService
• Resolves command parameters
• Handles command execution context

3. Path Resolution
• Gets path variables from StateService
• Handles path normalization
• Manages path security

Example integration:

```typescript
class ResolutionService {
  constructor(private state: IStateService) {}

  async resolveValue(value: string, context: ResolutionContext): Promise<string> {
    // 1. Get all referenced variables from state
    const vars = this.extractVarRefs(value);
    const resolved = new Map<string, string>();
    
    for (const varName of vars) {
      if (this.state.hasTextVar(varName)) {
        const rawValue = this.state.getTextVar(varName);
        resolved.set(varName, await this.resolveValue(rawValue, context));
      }
    }
    
    // 2. Perform resolution using raw values
    return this.interpolate(value, resolved, context);
  }
}
```

────────────────────────────────────────────────────────────────────────────
CONCLUSION
────────────────────────────────────────────────────────────────────────────

The StateService provides:
1. Pure variable storage and state management
2. Clear separation from resolution logic
3. Type-safe variable operations
4. Proper state hierarchy support
5. Simple and testable storage operations

This focused design allows:
• ResolutionService to handle all resolution logic
• DirectiveService to store raw values
• Clean separation of concerns
• Easy testing and maintenance
