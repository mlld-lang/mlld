# Detailed Method Inventory: Transformation & State Management

Below is an inventory of only the transformation-related and state-management methods found in IStateService and their corresponding implementation in StateService. All line numbers refer to the provided interface (IStateService.ts) and implementation (StateService.ts) snippets.

--------------------------------------------------------------------------------
## 1. Transformation-Related Methods

These methods govern how nodes are transformed and whether transformation features are enabled.

| Name                   | Signature                                                      | In Interface? | Interface Lines | In Implementation? | Implementation Lines | transformationFlags                | stateModification                                              | usageCount |
|------------------------|---------------------------------------------------------------|---------------|-----------------|--------------------|----------------------|-------------------------------------|----------------------------------------------------------------|-----------|
| getTransformedNodes    | getTransformedNodes(): MeldNode[]                            | Yes           | 41–42           | Yes                | 146–149             | []                                  | [] (read-only)                                                | 0         |
| setTransformedNodes    | setTransformedNodes(nodes: MeldNode[]): void                | Yes           | 43–44           | Yes                | 151–156             | []                                  | [transformedNodes]                                            | 0         |
| transformNode          | transformNode(original: MeldNode, transformed: MeldNode): void | Yes           | 45–46         | Yes                | 173–188             | [_transformationEnabled]            | [transformedNodes]                                            | 0         |
| isTransformationEnabled| isTransformationEnabled(): boolean                           | Yes           | 47–48           | Yes                | 190–193             | [_transformationEnabled]            | [] (read-only)                                                | 0         |
| enableTransformation   | enableTransformation(enable: boolean): void                  | Yes           | 49–50           | Yes                | 195–211             | [_transformationEnabled]            | [transformedNodes (initialized if enable == true)]            | 0         |

### Evidence from Code

• IStateService.ts (lines 41–50):  
  » Declares the five transformation methods above.  
• StateService.ts (lines 146–211):  
  » Implements each method, referencing the class-internal “_transformationEnabled” flag and “transformedNodes” array.

--------------------------------------------------------------------------------
## 2. State-Management Methods

These methods handle immutability, child-state creation, merging, cloning, and local-change tracking.

| Name             | Signature                                                | In Interface? | Interface Lines | In Implementation? | Implementation Lines | deepCopyFields                                        | shallowCopyFields                                                                      | usageCount |
|------------------|----------------------------------------------------------|---------------|-----------------|--------------------|----------------------|-------------------------------------------------------|----------------------------------------------------------------------------------------|-----------|
| createChildState | createChildState(): IStateService                        | Yes           | 74–75           | Yes                | 284–290             | []                                                    | []                                                                                     | 0         |
| mergeChildState  | mergeChildState(childState: IStateService): void         | Yes           | 76–77           | Yes                | 292–296             | Unknown (handled by stateFactory.mergeStates)         | Unknown (depends on internal merges)                                                   | 0         |
| clone            | clone(): IStateService                                   | Yes           | 78–79           | Yes                | 298–334             | []                                                    | [variables.text, variables.data, variables.path, commands, nodes, transformedNodes, imports] | 0         |
| setImmutable     | setImmutable(): void                                     | Yes           | 70–71           | Yes                | 275–277             | []                                                    | []                                                                                     | 0         |
| hasLocalChanges  | hasLocalChanges(): boolean                               | Yes           | 66–67           | Yes                | 265–267             | []                                                    | []                                                                                     | 0         |
| getLocalChanges  | getLocalChanges(): string[]                              | Yes           | Yes (68–69)     | Yes                | 269–272             | []                                                    | []                                                                                     | 0         |

### Deep vs. Shallow Copy Details

• createChildState (lines 284–290):  
  – No direct copying. Instantiates a new StateService with a reference to the parent’s currentState as a parent pointer.  
• mergeChildState (lines 292–296):  
  – Invokes this.stateFactory.mergeStates(...) (not shown), so exact copy depth cannot be confirmed.  
• clone (lines 298–334):  
  – Creates new Map/Set/Array containers for text, data, path, commands, nodes, transformedNodes, and imports.  
  – The individual MeldNode objects, command definitions, or strings remain the same references (shallow copy).  
• setImmutable (lines 275–277):  
  – Simply sets “this._isImmutable = true”; no copying.  
• hasLocalChanges/getLocalChanges (lines 265–272):  
  – Returns stub values; no copying or modifications.  

### Evidence from Code

• IStateService.ts (lines 66–79):  
  » Declares hasLocalChanges, getLocalChanges, setImmutable, createChildState, mergeChildState, and clone.  
• StateService.ts (lines 265–296, 298–334):  
  » Implements each method. “clone” creates new containers but references the same underlying data, resulting in shallow copies.

--------------------------------------------------------------------------------
## Usage Counts

In the provided snippet (StateService.ts alone), none of these methods are invoked internally (beyond their own definitions). Hence, all have a current usageCount of 0 based on this file. External usage (e.g., from other services or tests) was not available in the snippet.

--------------------------------------------------------------------------------
## Notable Observations

• All transformation methods match exactly between interface and implementation.  
• The clone() method performs shallow copies of collection containers (Maps, Sets, Arrays).  
• mergeChildState delegates merging logic to stateFactory.mergeStates, which is not shown.  

No incomplete or contradictory implementations were identified in the snippet itself. Further verification may be required against test files or other services that call these methods.

--------------------------------------------------------------------------------
End of Inventory.
