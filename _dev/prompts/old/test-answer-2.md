Below are the only three real underlying problems causing all four failing “currentState.clone is not a function” tests, followed by the exact minimal code changes needed to fix them. All four failing tests share the same root cause and do not require any other changes.

────────────────────────────────────────────────────────
1) The IStateService interface does not declare clone()
────────────────────────────────────────────────────────
• Evidence:
  - Every failing test complains that “currentState.clone is not a function.”  
  - By convention, the interpreter and integration tests call state.clone() when spinning up child contexts or rolling back state.  

• Required Fix:
  In your IStateService definition file (e.g. IStateService.ts), add the clone() signature:

--------------------------------------------------------------------------------
export interface IStateService {
  // … existing methods …

  /**
   * Creates a full copy of the current state, including all nodes,
   * transformations, and any relevant internal fields.
   */
  clone(): IStateService;
}
--------------------------------------------------------------------------------


────────────────────────────────────────────────────────────────┐
2) StateService never implements the missing clone() method     │
────────────────────────────────────────────────────────────────┘
• Evidence:
  - StateService is the concrete class backing IStateService.  
  - The failing tests show that StateService instances have no .clone().  

• Required Fix:
  In your StateService implementation file (e.g. StateService.ts), implement clone() exactly as follows. Make sure you copy over any other internal state fields (not shown here) so tests expecting immutability and transformation state also pass:

--------------------------------------------------------------------------------
import { IStateService } from './IStateService';

export class StateService implements IStateService {
  private originalNodes: MeldNode[] = [];
  private transformedNodes: MeldNode[] = [];

  // ... existing constructor, addNode, transformNode, etc. ...

  public clone(): IStateService {
    const newState = new StateService();
    // Clone node arrays (shallow copy is sufficient unless you store nested objects)
    newState.originalNodes = [...this.originalNodes];
    newState.transformedNodes = [...this.transformedNodes];
    // If you track other fields (e.g. a “transformationEnabled” flag), copy them too:
    // newState.transformationEnabled = this.transformationEnabled;

    return newState;
  }
}
--------------------------------------------------------------------------------


─────────────────────────────────────────────────────────────────────
3) Tests rely on clone() to preserve nodes/transformation state
─────────────────────────────────────────────────────────────────────
• Evidence:
  - The failing “SDK Integration Tests” explicitly test partial merges,
    pipeline continuity, or transformation-mode runs that require clone().
  - Without a proper clone, the interpreter cannot proceed and throws
    “currentState.clone is not a function” at various line/column references.

• Required Fix:
  As shown above, ensure your clone() method copies every piece of state the integration tests expect. At minimum, copy originalNodes, transformedNodes, plus any flags controlling transformation. If your code tracks more advanced fields (e.g. environment variables, included files, or path overrides), clone those as well.

────────────────────────────────────────────────────────────────────────────────
After these three atomic changes, you will have a working clone() method plus
the interface declaration that fixes all four failing tests. The message
“currentState.clone is not a function” will no longer appear, and the
parse→interpret→convert pipeline tests should pass.
