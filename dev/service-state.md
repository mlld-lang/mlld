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
  - Raw path strings from @path directive (e.g., "$PROJECTPATH/docs/${folder}")
  - Includes special variables ($HOMEPATH/$~, $PROJECTPATH/$.)
  - Includes text variables (${var})
  - NO resolution of any variables (handled by ResolutionService)
  - NO path validation (handled by PathService)
  - NO path normalization (handled by PathService)

• CommandDefinition:  
  - Raw command definitions from @define directive
  - No parameter resolution (handled by ResolutionService)

Example of path variable storage:
```typescript
// When processing @path directive:
// @path docs = [$PROJECTPATH/documentation/${section}]

// StateService stores the raw value exactly as is:
state.setPathVar('docs', '$PROJECTPATH/documentation/${section}');

// Later, when the path needs to be used:
const rawPath = state.getPathVar('docs');  // "$PROJECTPATH/documentation/${section}"
// ResolutionService handles resolving all variables
// PathService handles validation & normalization
```

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