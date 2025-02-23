# Detailed Method Inventory Analysis

# Meld Codebase Audit

This is part of a systematic audit of the Meld codebase, focusing on transformation issues, state management bugs, and service implementation mismatches.

## FORMATTING REQUIREMENTS

- Use markdown tables for comparisons
- Use code blocks with language tags
- Include line numbers for all code references
- Format method signatures consistently
- Separate sections with clear headers
- Include evidence for all findings

## ANALYSIS REQUIREMENTS

- Base all findings on concrete evidence from the code
- Do not make assumptions without supporting code
- Highlight any contradictions found
- Note any missing or incomplete implementations
- Identify patterns across multiple files
- Flag any potential architectural issues

## PREVIOUS FINDINGS

-------------------------
Model: o1
System: _meld/audit/partials/auditor.md
Response:
# Interface & Implementation Audit for StateService

Below is a detailed analysis of the StateService interface (IStateService.ts) and its implementation (StateService.ts), including method comparisons, usage patterns in production code, and notes about test coverage or mock usage.

--------------------------------------------------------------------------------
## 1. Method Inventory & Signature Comparison

This table compares all methods defined in IStateService (left) with the corresponding implementations in StateService (right). Line numbers refer to the code blocks provided in your snippet.

| IStateService                          | Approx. Line in IStateService.ts | StateService                                   | Approx. Line in StateService.ts | Match?  | Notes                                                                                  |
|----------------------------------------|-----------------------------------|-------------------------------------------------|---------------------------------|---------|----------------------------------------------------------------------------------------|
| getTextVar(name: string): string|undefined                            | L6-7                                   | getTextVar(name: string): string|undefined                            | L34-37                                 | Yes     | Signatures match exactly                                                              |
| setTextVar(name: string, value: string): void                          | L8-9                                   | setTextVar(name: string, value: string): void                           | L39-48                                 | Yes     | Signatures match exactly                                                              |
| getAllTextVars(): Map<string,string>                                    | L10-11                                 | getAllTextVars(): Map<string,string>                                    | L49-52                                 | Yes     | Matches                                                                               |
| getLocalTextVars(): Map<string,string>                                  | L12-13                                 | getLocalTextVars(): Map<string,string>                                  | L54-57                                 | Yes     | Matches                                                                               |
| getDataVar(name: string): any                                           | L15                                     | getDataVar(name: string): unknown                                      | L61-64                                 | Partial | Return type mismatch: Interface uses "any", Implementation uses "unknown"             |
| setDataVar(name: string, value: any): void                              | L16-17                                 | setDataVar(name: string, value: unknown): void                          | L66-74                                 | Partial | Parameter type mismatch: Interface uses "any", Implementation uses "unknown"          |
| getAllDataVars(): Map<string,any>                                       | L18-19                                 | getAllDataVars(): Map<string,unknown>                                   | L76-79                                 | Partial | Return type mismatch: "Map<string, any>" vs "Map<string, unknown>"                    |
| getLocalDataVars(): Map<string, any>                                    | L20-21                                 | getLocalDataVars(): Map<string,unknown>                                 | L81-84                                 | Partial | Same mismatch: "any" vs "unknown"                                                     |
| getPathVar(name: string): string|undefined                              | L23                                     | getPathVar(name: string): string|undefined                              | L88-91                                 | Yes     | Matches                                                                               |
| setPathVar(name: string, value: string): void                           | L24-25                                 | setPathVar(name: string, value: string): void                           | L93-96                                 | Yes     | Matches                                                                               |
| getAllPathVars(): Map<string, string>                                   | L26-27                                 | getAllPathVars(): Map<string, string>                                   | L98-102                                | Yes     | Matches                                                                               |
| getCommand(name: string): { command: string; options?: Record<string,unknown> } | L29                   | getCommand(name: string): { command: string; options?: Record<string,unknown> } | L105-110                               | Yes     | Matches                                                                               |
| setCommand(name: string, command: string|{command:string;options?:Record<string,unknown>}): void | L30-31        | setCommand(name: string, command: string|{command:string;options?:Record<string,unknown>}): void | L112-123                                | Yes     | Matches                                                                               |
| getAllCommands(): Map<string,{command:string;options?:Record<string,unknown>}> | L32-33      | getAllCommands(): Map<string,{command:string;options?:Record<string,unknown>}> | L125-139                               | Yes     | Matches                                                                               |
| getNodes(): MeldNode[]                                                  | L35                                     | getNodes(): MeldNode[]                                                 | L141-144                                | Yes     | Matches                                                                               |
| addNode(node: MeldNode): void                                           | L36-37                                 | addNode(node: MeldNode): void                                           | L158-171                                | Yes     | Matches                                                                               |
| appendContent(content: string): void                                    | L38-39                                 | appendContent(content: string): void                                    | L213-222                                | Yes     | Matches                                                                               |
| getTransformedNodes(): MeldNode[]                                       | L41-42                                 | getTransformedNodes(): MeldNode[]                                       | L146-149                                | Yes     | Matches                                                                               |
| setTransformedNodes(nodes: MeldNode[]): void                            | L43-44                                 | setTransformedNodes(nodes: MeldNode[]): void                            | L151-156                                | Yes     | Matches                                                                               |
| transformNode(original: MeldNode, transformed: MeldNode): void          | L45-46                                 | transformNode(original: MeldNode, transformed: MeldNode): void          | L173-188                                | Yes     | Matches                                                                               |
| isTransformationEnabled(): boolean                                      | L47-48                                 | isTransformationEnabled(): boolean                                      | L190-193                                | Yes     | Matches                                                                               |
| enableTransformation(enable: boolean): void                             | L49-50                                 | enableTransformation(enable: boolean): void                             | L195-211                                | Yes     | Matches                                                                               |
| addImport(path: string): void                                           | L52-53                                 | addImport(path: string): void                                           | L224-231                                | Yes     | Matches                                                                               |
| removeImport(path: string): void                                        | L54-55                                 | removeImport(path: string): void                                        | L233-240                                | Yes     | Matches                                                                               |
| hasImport(path: string): boolean                                        | L56-57                                 | hasImport(path: string): boolean                                        | L242-245                                | Yes     | Matches                                                                               |
| getImports(): Set<string>                                               | L58-59                                 | getImports(): Set<string>                                               | L247-252                                | Yes     | Matches                                                                               |
| getCurrentFilePath(): string|null                                       | L61-62                                 | getCurrentFilePath(): string|null                                       | L255-258                                | Yes     | Matches                                                                               |
| setCurrentFilePath(path: string): void                                  | L63-64                                 | setCurrentFilePath(path: string): void                                  | L260-263                                | Yes     | Matches                                                                               |
| hasLocalChanges(): boolean                                              | L66-67                                 | hasLocalChanges(): boolean                                              | L265-267                                | Yes     | Matches (Implementation always returns true)                                          |
| getLocalChanges(): string[]                                             | L68-69                                 | getLocalChanges(): string[]                                             | L269-272                                | Yes     | Matches (Implementation always returns ["state"])                                     |
| setImmutable(): void                                                    | L70-71                                 | setImmutable(): void                                                    | L275-277                                | Yes     | Matches                                                                               |
| isImmutable: boolean (read-only)                                        | L72-73                                 | get isImmutable(): boolean                                              | L279-282                                | Yes     | Implementation uses a getter_ property `_isImmutable`; consistent with read-only      |
| createChildState(): IStateService                                       | L74-75                                 | createChildState(): IStateService                                       | L284-290                                | Yes     | Matches                                                                               |
| mergeChildState(childState: IStateService): void                        | L76-77                                 | mergeChildState(childState: IStateService): void                        | L292-296                                | Yes     | Matches                                                                               |
| clone(): IStateService                                                  | L78-79                                 | clone(): IStateService                                                  | L298-334                                | Yes     | Matches                                                                               |

### Additional Implementation-Only Methods
• checkMutable(): void (line 336-340 in StateService.ts)
• updateState(updates: Partial<StateNode>, source: string): void (line 342-351 in StateService.ts)

These two methods are private/internal helpers (not in IStateService). No issues unless they are invoked externally, which they do not appear to be.

--------------------------------------------------------------------------------
## 2. Implementation vs. Usage in Production Code

Below are key observations on how StateService methods are used in the provided production code, primarily in DirectiveService and related directive handlers:

1. In DirectiveService.ts:
   • processDirectives (around line 244) calls "currentState.createChildState()" and "mergeChildState(updatedState)".
   • handleDataDirective (around line 419) calls "this.stateService!.setDataVar(directive.identifier, value)".
   • handleTextDirective (around line 354) calls "this.stateService!.setTextVar(directive.identifier, directive.value)".
   • handleImportDirective and handleEmbedDirective both create child states via "createChildState()" and eventually merge them. (See lines ~507-516 for embed, ~451-480 for import)

2. In various DirectiveHandlers (e.g., DataDirectiveHandler.ts, DefineDirectiveHandler.ts, PathDirectiveHandler.ts):
   • setDataVar, getDataVar, setTextVar, and setPathVar are used exactly as in the interface.
   • setCommand(...) is used in DefineDirectiveHandler (line ~67).
   • No calls to checkMutable() or updateState() from outside; they remain internal.

3. OutputService.ts frequently checks:
   • isTransformationEnabled() → lines ~56-59 in OutputService.ts.
   • getTransformedNodes() → lines ~57, ~60 in OutputService.ts.
   • getAllTextVars(), getAllDataVars() → lines ~141, ~151 for formatting the state in the output.

4. Implementation Parameter Types vs. Interface:
   • For data variables, the interface uses “any” while the implementation has “unknown”. No runtime breakage is observed in the usage, but it is a strict type mismatch in TypeScript terms.

5. Return Types in Usage:
   • No example found where the rest of the code depends on getDataVar(...) being “any” vs. “unknown”. Most consumption sites treat the value as a generic object or parse JSON from it.
   • No undocumented assumptions about getLocalChanges() or hasLocalChanges()—these return simple stubbed values but are not widely used in the directive logic.

Overall, there are no calls to methods that do not exist in the interface. All usage patterns align with the declared interface methods, except for the minor “any” vs. “unknown” mismatch on data variable methods.

--------------------------------------------------------------------------------
## 3. Test Coverage & Mock Usage

Based on the provided snippets:
• No dedicated test files or mocks for StateService are shown.
• There are no references in the provided code suggesting tests call methods outside the interface.
• No mocking examples of StateService appear in the snippet, so we cannot identify any inconsistencies between test mocks and the real interface.
• The test usage summary is inconclusive because no direct test code was included.

--------------------------------------------------------------------------------
## 4. Findings & Recommendations

1. Type Mismatch on Data Variables
   - Evidence: “getDataVar”, “setDataVar”, “getAllDataVars”, “getLocalDataVars” use “unknown” in StateService.ts (lines 61, 66, 76, 81) but “any” in IStateService.ts.
   - Impact: Potential TypeScript warnings or confusion for developers expecting “any” vs. “unknown”.
   - Recommendation: Standardize on one type across interface and implementation, preferably “unknown” or a narrower type as needed.

2. Private Methods (checkMutable, updateState)
   - Evidence: Lines 336 & 342 in StateService.ts.
   - Impact: None externally, but developer confusion if not strictly private.
   - Recommendation: Confirm these are marked “private” or “protected” in TypeScript to prevent external usage.

3. hasLocalChanges() and getLocalChanges() Hardcoded Behavior
   - Evidence: Lines 265 and 269 in StateService.ts always return “true” and [“state”].
   - Impact: Possibly incomplete state-change tracking. Currently no usage found that contradicts the interface, but it might be a placeholder.
   - Recommendation: Confirm the intended local-change detection logic or document that these methods are placeholders.

4. No Direct Test Coverage Observed
   - Evidence: No references to .spec/.test files or mocking frameworks that call StateService.
   - Impact: Potential test gap for verifying mutation, transformation, and import logic.
   - Recommendation: Add explicit coverage or provide test references to ensure consistent usage of each method.

--------------------------------------------------------------------------------
## 5. Conclusion

• Most of the IStateService interface is correctly implemented by StateService.
• All methods required by the interface exist with matching signatures, except for the minor type mismatch (“any” vs. “unknown” on data variable methods).
• No methods from the implementation are called externally that do not appear in the interface.
• The transformation-related methods (getTransformedNodes, setTransformedNodes, transformNode, enableTransformation) match exactly and are used in OutputService and directive code.
• No test or mock inconsistencies can be confirmed from the snippets provided.

--------------------------------------------------------------------------------
### Next Steps

• Align the interface with the implementation types for data variables (use either “any” or “unknown” consistently).
• Formalize local-change tracking if hasLocalChanges() and getLocalChanges() must do more than return placeholders.
• Ensure any private methods (updateState, checkMutable) remain inaccessible from outside.
• Add or reference tests that confirm correct usage of child states, transformation flags, and clone/merge behaviors.

--------------------------------------------------------------------------------
End of Audit.

## CODE TO ANALYZE

\=== INTERFACE AND IMPLEMENTATION ===

Processing...# IStateService.ts

## Content
```typescript
import type { MeldNode } from 'meld-spec';

export interface IStateService {
  // Text variables
  getTextVar(name: string): string | undefined;
  setTextVar(name: string, value: string): void;
  getAllTextVars(): Map<string, string>;
  getLocalTextVars(): Map<string, string>;

  // Data variables
  getDataVar(name: string): any;
  setDataVar(name: string, value: any): void;
  getAllDataVars(): Map<string, any>;
  getLocalDataVars(): Map<string, any>;

  // Path variables
  getPathVar(name: string): string | undefined;
  setPathVar(name: string, value: string): void;
  getAllPathVars(): Map<string, string>;

  // Commands
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined;
  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void;
  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }>;

  // Nodes
  getNodes(): MeldNode[];
  addNode(node: MeldNode): void;
  appendContent(content: string): void;

  // Node transformation (new)
  getTransformedNodes(): MeldNode[];
  setTransformedNodes(nodes: MeldNode[]): void;
  transformNode(original: MeldNode, transformed: MeldNode): void;
  isTransformationEnabled(): boolean;
  enableTransformation(enable: boolean): void;

  // Imports
  addImport(path: string): void;
  removeImport(path: string): void;
  hasImport(path: string): boolean;
  getImports(): Set<string>;

  // File path
  getCurrentFilePath(): string | null;
  setCurrentFilePath(path: string): void;

  // State management
  hasLocalChanges(): boolean;
  getLocalChanges(): string[];
  setImmutable(): void;
  readonly isImmutable: boolean;
  createChildState(): IStateService;
  mergeChildState(childState: IStateService): void;
  clone(): IStateService;
}
```
# StateService.ts

## Functions
- StateService
- StateService.constructor
- StateService.getTextVar
- StateService.setTextVar
- StateService.getAllTextVars
- StateService.getLocalTextVars
- StateService.getDataVar
- StateService.setDataVar
- StateService.getAllDataVars
- StateService.getLocalDataVars
- StateService.getPathVar
- StateService.setPathVar
- StateService.getAllPathVars
- StateService.getCommand
- StateService.setCommand
- StateService.getAllCommands
- StateService.getNodes
- StateService.getTransformedNodes
- StateService.setTransformedNodes
- StateService.addNode
- StateService.transformNode
- StateService.isTransformationEnabled
- StateService.enableTransformation
- StateService.appendContent
- StateService.addImport
- StateService.removeImport
- StateService.hasImport
- StateService.getImports
- StateService.getCurrentFilePath
- StateService.setCurrentFilePath
- StateService.hasLocalChanges
- StateService.getLocalChanges
- StateService.setImmutable
- StateService.createChildState
- StateService.mergeChildState
- StateService.clone
- StateService.checkMutable
- StateService.updateState

## Content
```typescript
import type { MeldNode, TextNode } from 'meld-spec';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService } from './IStateService.js';
import type { StateNode, CommandDefinition } from './types.js';
import { StateFactory } from './StateFactory.js';

export class StateService implements IStateService {
  private stateFactory: StateFactory;
  private currentState: StateNode;
  private _isImmutable: boolean = false;
  private _transformationEnabled: boolean = false;

  constructor(parentState?: IStateService) {
    this.stateFactory = new StateFactory();
    this.currentState = this.stateFactory.createState({
      source: 'constructor',
      parentState: parentState ? (parentState as StateService).currentState : undefined
    });
  }

  // Text variables
  getTextVar(name: string): string | undefined {
    return this.currentState.variables.text.get(name);
  }

  setTextVar(name: string, value: string): void {
    this.checkMutable();
    const text = new Map(this.currentState.variables.text);
    text.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        text
      }
    }, `setTextVar:${name}`);
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  // Data variables
  getDataVar(name: string): unknown {
    return this.currentState.variables.data.get(name);
  }

  setDataVar(name: string, value: unknown): void {
    this.checkMutable();
    const data = new Map(this.currentState.variables.data);
    data.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        data
      }
    }, `setDataVar:${name}`);
  }

  getAllDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  getLocalDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  // Path variables
  getPathVar(name: string): string | undefined {
    return this.currentState.variables.path.get(name);
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    const path = new Map(this.currentState.variables.path);
    path.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        path
      }
    }, `setPathVar:${name}`);
  }

  getAllPathVars(): Map<string, string> {
    return new Map(this.currentState.variables.path);
  }

  // Commands
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined {
    const cmd = this.currentState.commands.get(name);
    if (!cmd) return undefined;
    return {
      command: cmd.command,
      options: cmd.options ? { ...cmd.options } : undefined
    };
  }

  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void {
    this.checkMutable();
    const commands = new Map(this.currentState.commands);
    const cmdDef: CommandDefinition = typeof command === 'string'
      ? { command }
      : { command: command.command, options: command.options };
    commands.set(name, cmdDef);
    this.updateState({ commands }, `setCommand:${name}`);
  }

  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }> {
    const commands = new Map<string, { command: string; options?: Record<string, unknown> }>();
    for (const [name, cmd] of this.currentState.commands) {
      commands.set(name, {
        command: cmd.command,
        options: cmd.options ? { ...cmd.options } : undefined
      });
    }
    return commands;
  }

  // Nodes
  getNodes(): MeldNode[] {
    return [...this.currentState.nodes];
  }

  getTransformedNodes(): MeldNode[] {
    return this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : [...this.currentState.nodes];
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    this.checkMutable();
    this.updateState({
      transformedNodes: [...nodes]
    }, 'setTransformedNodes');
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    const updates: Partial<StateNode> = {
      nodes: [...this.currentState.nodes, node]
    };

    updates.transformedNodes = [
      ...(this.currentState.transformedNodes || this.currentState.nodes),
      node
    ];

    this.updateState(updates, 'addNode');
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    this.checkMutable();
    if (!this._transformationEnabled) {
      return;
    }

    const transformedNodes = this.currentState.transformedNodes || this.currentState.nodes;
    const index = transformedNodes.findIndex(node => node === original);
    if (index === -1) {
      throw new Error('Cannot transform node: original node not found');
    }

    const updatedNodes = [...transformedNodes];
    updatedNodes[index] = transformed;
    this.updateState({
      transformedNodes: updatedNodes
    }, 'transformNode');
  }

  isTransformationEnabled(): boolean {
    return this._transformationEnabled;
  }

  enableTransformation(enable: boolean): void {
    if (this._transformationEnabled === enable) {
      return;
    }
    this._transformationEnabled = enable;

    // Initialize transformed nodes if enabling
    if (enable) {
      // Always initialize with a fresh copy of nodes, even if transformedNodes already exists
      this.updateState({
        transformedNodes: [...this.currentState.nodes]
      }, 'enableTransformation');
    }
  }

  appendContent(content: string): void {
    this.checkMutable();
    // Create a text node and add it
    const node: MeldNode = {
      type: 'Text',
      content: content,
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    } as TextNode;
    this.addNode(node);
  }

  // Imports
  addImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.add(path);
    this.updateState({ imports }, `addImport:${path}`);
  }

  removeImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.delete(path);
    this.updateState({ imports }, `removeImport:${path}`);
  }

  hasImport(path: string): boolean {
    return this.currentState.imports.has(path);
  }

  getImports(): Set<string> {
    return new Set(this.currentState.imports);
  }

  // File path
  getCurrentFilePath(): string | null {
    return this.currentState.filePath ?? null;
  }

  setCurrentFilePath(path: string): void {
    this.checkMutable();
    this.updateState({ filePath: path }, 'setCurrentFilePath');
  }

  // State management
  hasLocalChanges(): boolean {
    return true; // In immutable model, any non-empty state has local changes
  }

  getLocalChanges(): string[] {
    return ['state']; // In immutable model, the entire state is considered changed
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(): IStateService {
    const child = new StateService(this);
    logger.debug('Created child state', {
      parentPath: this.getCurrentFilePath(),
      childPath: child.getCurrentFilePath()
    });
    return child;
  }

  mergeChildState(childState: IStateService): void {
    this.checkMutable();
    const child = childState as StateService;
    this.currentState = this.stateFactory.mergeStates(this.currentState, child.currentState);
  }

  clone(): IStateService {
    const cloned = new StateService();

    // Create a completely new state without parent reference
    cloned.currentState = this.stateFactory.createState({
      source: 'clone',
      filePath: this.currentState.filePath
    });

    // Copy all state
    cloned.updateState({
      variables: {
        text: new Map(this.currentState.variables.text),
        data: new Map(this.currentState.variables.data),
        path: new Map(this.currentState.variables.path)
      },
      commands: new Map(this.currentState.commands),
      nodes: [...this.currentState.nodes],
      transformedNodes: this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : undefined,
      imports: new Set(this.currentState.imports)
    }, 'clone');

    // Copy flags
    cloned._isImmutable = this._isImmutable;
    cloned._transformationEnabled = this._transformationEnabled;

    return cloned;
  }

  private checkMutable(): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
  }

  private updateState(updates: Partial<StateNode>, source: string): void {
    this.currentState = this.stateFactory.updateState(this.currentState, updates);
    logger.debug('Updated state', { source, updates });
  }
}
```

## YOUR TASK

Create a detailed method inventory focusing ONLY on transformation and state management methods:

1. For each transformation-related method:
   ```typescript
   {
     name: string;
     signature: string;
     inInterface: boolean;
     inImplementation: boolean;
     transformationFlags: string[];
     stateModification: string[];
     usageCount: number;
   }
   ```

2. For each state management method (clone, createChild, etc):
   ```typescript
   {
     name: string;
     signature: string;
     inInterface: boolean;
     inImplementation: boolean;
     deepCopyFields: string[];
     shallowCopyFields: string[];
     usageCount: number;
   }
   ```

DO NOT INCLUDE methods that aren't related to transformation or state management.
BE PRECISE about the types and fields that are deep vs shallow copied.
INCLUDE line numbers for each finding.

## RESPONSE QUALITY REQUIREMENTS

1. EVIDENCE-BASED ANALYSIS
   - Every finding must reference specific code
   - Include relevant line numbers and file paths
   - Quote critical code segments when relevant
   - Link findings to specific test failures or logs

2. STRUCTURED OUTPUT
   - Use tables for comparisons and summaries
   - Use bullet points for lists of findings
   - Use code blocks for code examples
   - Use headers to organize sections

3. ACTIONABLE RESULTS
   - Clearly state each issue found
   - Provide concrete examples of problems
   - Link issues to specific code locations
   - Suggest specific next steps or areas for investigation

DO NOT GUESS. DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE.
