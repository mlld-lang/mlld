# StateService

Below is a detailed design for the StateService that aligns with meld-spec's type definitions and the Meld grammar. This service manages all Meld variables (text, data, path, define commands, etc.) while ensuring type safety and compatibility with the core Meld libraries.

TABLE OF CONTENTS
────────────────────────────────────────────────────────────────────────────
1) Overview & Goals
2) Variable Types from meld-spec
3) State Service Responsibilities
4) Code Structure & Interfaces
5) Example Usage
6) Testing Strategy
7) Future Extensions
8) Conclusion

────────────────────────────────────────────────────────────────────────────
1) OVERVIEW & GOALS
────────────────────────────────────────────────────────────────────────────

We want a dedicated "StateService" that:

• Holds the current set of Meld variables using meld-spec types
• Creates, reads, updates, merges states without polluting business logic
• Maintains merges for nested "import" or "embed" usage
• Is fully testable in isolation, following SOLID
• Exposes a clear API for directive handlers and the InterpreterService

We explicitly separate concerns:  
• "StateService" is about storing and merging state
• "InterpolationService," "PathService," "ValidationService," etc. remain separate

────────────────────────────────────────────────────────────────────────────
2) VARIABLE TYPES FROM MELD-SPEC
────────────────────────────────────────────────────────────────────────────

According to meld-spec, we have:

• TextVariable:  
  - String values from @text directive
  - Used in ${var} interpolation

• DataVariable:  
  - JSON-like objects from @data directive
  - Used in #{var.field} interpolation
  - Must handle nested field access

• PathVariable:  
  - Path strings from @path directive
  - Special handling for $PROJECTPATH, $HOMEPATH
  - Used in path contexts

• CommandDefinition:  
  - From @define directive
  - Contains command content and metadata
  - Used by @run directive

────────────────────────────────────────────────────────────────────────────
3) STATE SERVICE RESPONSIBILITIES
────────────────────────────────────────────────────────────────────────────

RESPONSIBILITY #1: Variable Storage  
• Store TextVariable instances (@text)
• Store DataVariable instances (@data)
• Store PathVariable instances (@path)
• Store CommandDefinition instances (@define)

RESPONSIBILITY #2: Merging of Child States  
• Provide "createChildState()" for imports
• Handle "mergeChild(childState)" with proper type safety

RESPONSIBILITY #3: Type Safety  
• Ensure all variables match meld-spec types
• Validate data structure shapes
• Handle type conversions when needed

RESPONSIBILITY #4: Import Tracking  
• Track imported files for circularity detection
• Use proper types from meld-spec

────────────────────────────────────────────────────────────────────────────
4) CODE STRUCTURE & INTERFACES
────────────────────────────────────────────────────────────────────────────

Project Layout:
services/
 ├─ StateService/
 │   ├─ StateService.ts
 │   ├─ StateService.test.ts
 │   └─ README.md

Implementation:

--------------------------------------------------------------------------------
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

  // Data variables
  setDataVar(name: string, value: DataVariable): void;
  getDataVar(name: string): DataVariable | undefined;

  // Path variables
  setPathVar(name: string, value: PathVariable): void;
  getPathVar(name: string): PathVariable | undefined;

  // Commands
  setCommand(name: string, command: CommandDefinition): void;
  getCommand(name: string): CommandDefinition | undefined;

  // Import tracking
  addImportedFile(filePath: string): void;
  hasImportedFile(filePath: string): boolean;

  // Child states
  createChildState(): IStateService;
  mergeChildState(child: IStateService): void;
}

export class StateService implements IStateService {
  private textVars = new Map<string, TextVariable>();
  private dataVars = new Map<string, DataVariable>();
  private pathVars = new Map<string, PathVariable>();
  private commands = new Map<string, CommandDefinition>();
  private importedFiles = new Set<string>();
  private parent?: StateService;

  constructor(parent?: StateService) {
    this.parent = parent;
  }

  setTextVar(name: string, value: TextVariable): void {
    this.textVars.set(name, value);
  }

  getTextVar(name: string): TextVariable | undefined {
    if (this.textVars.has(name)) {
      return this.textVars.get(name);
    }
    return this.parent?.getTextVar(name);
  }

  setDataVar(name: string, value: DataVariable): void {
    this.dataVars.set(name, value);
  }

  getDataVar(name: string): DataVariable | undefined {
    if (this.dataVars.has(name)) {
      return this.dataVars.get(name);
    }
    return this.parent?.getDataVar(name);
  }

  setPathVar(name: string, value: PathVariable): void {
    this.pathVars.set(name, value);
  }

  getPathVar(name: string): PathVariable | undefined {
    if (this.pathVars.has(name)) {
      return this.pathVars.get(name);
    }
    return this.parent?.getPathVar(name);
  }

  setCommand(name: string, command: CommandDefinition): void {
    this.commands.set(name, command);
  }

  getCommand(name: string): CommandDefinition | undefined {
    if (this.commands.has(name)) {
      return this.commands.get(name);
    }
    return this.parent?.getCommand(name);
  }

  addImportedFile(filePath: string): void {
    this.importedFiles.add(filePath);
  }

  hasImportedFile(filePath: string): boolean {
    if (this.importedFiles.has(filePath)) {
      return true;
    }
    return this.parent?.hasImportedFile(filePath) || false;
  }

  createChildState(): IStateService {
    return new StateService(this);
  }

  mergeChildState(child: IStateService): void {
    // Merge all variables from child into this state
    // This implementation assumes child is a StateService
    const childState = child as StateService;
    
    // Merge text variables
    childState.textVars.forEach((value, key) => {
      this.textVars.set(key, value);
    });

    // Merge data variables
    childState.dataVars.forEach((value, key) => {
      this.dataVars.set(key, value);
    });

    // Merge path variables
    childState.pathVars.forEach((value, key) => {
      this.pathVars.set(key, value);
    });

    // Merge commands
    childState.commands.forEach((value, key) => {
      this.commands.set(key, value);
    });

    // Merge imported files
    childState.importedFiles.forEach(file => {
      this.importedFiles.add(file);
    });
  }
}
--------------------------------------------------------------------------------

────────────────────────────────────────────────────────────────────────────
5) EXAMPLE USAGE
────────────────────────────────────────────────────────────────────────────

From a directive handler:

--------------------------------------------------------------------------------
class TextDirectiveHandler {
  constructor(private state: IStateService) {}

  execute(node: DirectiveNode): void {
    const { name, value } = node.directive;
    // value is already validated as TextVariable by meld-spec
    this.state.setTextVar(name, value);
  }
}
--------------------------------------------------------------------------------

For imports with child states:

--------------------------------------------------------------------------------
class ImportDirectiveHandler {
  constructor(
    private state: IStateService,
    private interpreter: IInterpreterService
  ) {}

  async execute(node: DirectiveNode): Promise<void> {
    const childState = this.state.createChildState();
    await this.interpreter.interpret(subAst, childState);
    this.state.mergeChildState(childState);
  }
}
--------------------------------------------------------------------------------

────────────────────────────────────────────────────────────────────────────
6) TESTING STRATEGY
────────────────────────────────────────────────────────────────────────────

Unit Tests:

--------------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { StateService } from './StateService';
import { TextVariable, DataVariable } from 'meld-spec';

describe('StateService', () => {
  let state: StateService;

  beforeEach(() => {
    state = new StateService();
  });

  it('stores and retrieves text variables', () => {
    const textVar: TextVariable = 'Hello';
    state.setTextVar('greeting', textVar);
    expect(state.getTextVar('greeting')).toBe(textVar);
  });

  it('handles child state merging', () => {
    const child = state.createChildState();
    child.setTextVar('childVar', 'child value');
    state.mergeChildState(child);
    expect(state.getTextVar('childVar')).toBe('child value');
  });

  it('follows meld-spec types for data variables', () => {
    const dataVar: DataVariable = { key: 'value' };
    state.setDataVar('config', dataVar);
    expect(state.getDataVar('config')).toEqual(dataVar);
  });
});
--------------------------------------------------------------------------------

Integration Tests:

--------------------------------------------------------------------------------
describe('StateService Integration', () => {
  let context: TestContext;
  let state: StateService;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();
    state = new StateService();
  });

  it('handles complex import scenarios', async () => {
    await context.builder.create({
      files: {
        'main.meld': `
          @text parentVar = "parent"
          @import [child.meld]
        `,
        'child.meld': `
          @text childVar = "child"
        `
      }
    });

    // Run the interpreter with our state
    await runMeld('main.meld', { state });

    // Verify both variables exist
    expect(state.getTextVar('parentVar')).toBe('parent');
    expect(state.getTextVar('childVar')).toBe('child');
  });
});
--------------------------------------------------------------------------------

────────────────────────────────────────────────────────────────────────────
7) FUTURE EXTENSIONS
────────────────────────────────────────────────────────────────────────────

1. Enhanced Type Safety
   • Runtime type checking against meld-spec schemas
   • Validation of complex data structures
   • Custom type guards

2. Performance Optimizations
   • Caching for frequently accessed variables
   • Efficient merging strategies
   • Memory management for large states

3. Debugging Support
   • Variable access tracking
   • State change history
   • Detailed error messages

────────────────────────────────────────────────────────────────────────────
8) CONCLUSION
────────────────────────────────────────────────────────────────────────────

This StateService design:

1. Properly uses meld-spec's types
2. Maintains type safety throughout
3. Supports nested states cleanly
4. Provides clear testing patterns
5. Remains extensible for future needs

By leveraging meld-spec's types and following the grammar rules, we create a robust service that fits perfectly into the Meld ecosystem while remaining maintainable and testable.
