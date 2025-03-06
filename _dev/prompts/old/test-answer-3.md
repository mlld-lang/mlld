Below are three closely‐related root problems (as proven by the failing tests) and the exact “surgical” fixes required. All evidence comes directly from the test failures:

────────────────────────────────────────────────────────
1) “currentState.clone is not a function”  
   • Four integration tests in api/api.test.ts fail because the code tries to call state.clone() but no such method exists on StateService.

────────────────────────────────────────────────────────
ROOT CAUSE
In older code, clone() was common for preserving/rolling back state. The new StateService never implemented it. However, the integration tests (and anywhere else calling currentState.clone()) still rely on it.

────────────────────────────────────────────────────────
FIX
Implement clone() in both IStateService and StateService (or wherever your state interface/class live).

Example:

// IStateService.ts (or wherever the interface is declared)
export interface IStateService {
  /* existing members ... */
  clone(): IStateService;
}

// StateService.ts
export class StateService implements IStateService {
  private _transformationEnabled = false;
  private originalNodes: MeldNode[] = [];
  private transformedNodes: MeldNode[] = [];

  /* existing code ... */

  public clone(): IStateService {
    const newService = new StateService();
    // copy transformation state
    newService._transformationEnabled = this._transformationEnabled;
    // copy node arrays
    newService.originalNodes = [...this.originalNodes];
    newService.transformedNodes = [...this.transformedNodes];
    return newService;
  }
}

────────────────────────────────────────────────────────
2) “state.setTransformedNodes is not a function”  
   • Four OutputService tests fail (e.g. OutputService.test.ts:378, 398, etc.) because the tests call state.setTransformedNodes(...).

────────────────────────────────────────────────────────
ROOT CAUSE
The tests explicitly call setTransformedNodes(...), but no such method is defined in StateService.

────────────────────────────────────────────────────────
FIX
Provide setTransformedNodes on the IStateService/StateService so those tests can pass.

Example:

// IStateService.ts
export interface IStateService {
  /* existing members ... */
  setTransformedNodes(nodes: MeldNode[]): void;
}

// StateService.ts
export class StateService implements IStateService {
  /* ... */
  public setTransformedNodes(nodes: MeldNode[]): void {
    this.transformedNodes = nodes;
  }
}

────────────────────────────────────────────────────────
3) Transformation tests fail because StateService does not (a) store nodes in transformedNodes when transformation is disabled, and (b) refuse to transform non‐existent nodes.  
   • services/StateService/StateService.transformation.test.ts → Three failures:  
     - “expected [] to deeply equal [ { type: 'Text' ... } ]”  
     - “expected [] to deeply equal [ { type: 'Text', ... } ]”  
     - “expected [Function] to throw an error”  

They show that getTransformedNodes() is empty (the test wants it to contain the original node even if transform is disabled). They also show we never throw an error when transformNode(...) is called on a node not in transformedNodes.

────────────────────────────────────────────────────────
ROOT CAUSE
The addNode(...) and transformNode(...) methods do not match what the tests expect:  
• addNode(...) should always push new nodes into transformedNodes (so that getTransformedNodes() returns them, even if transformation is off).  
• transformNode(...) should actually do nothing if transformation is disabled, and should throw if the original node is not found in transformedNodes.

────────────────────────────────────────────────────────
FIX
Adjust addNode(...), transformNode(...), and add a small enableTransformation(...) toggler. This satisfies the test that “should transform only when enabled” and “should throw when transforming non‐existent node.”

Example final StateService changes (showing all relevant pieces together):

// StateService.ts
export class StateService implements IStateService {
  private _transformationEnabled = false;
  private originalNodes: MeldNode[] = [];
  private transformedNodes: MeldNode[] = [];

  public enableTransformation(enable = true): void {
    this._transformationEnabled = enable;
  }

  public addNode(node: MeldNode): void {
    this.originalNodes.push(node);
    // Always add to transformedNodes so getTransformedNodes() returns them.
    this.transformedNodes.push(node);
  }

  public transformNode(original: MeldNode, replaced: MeldNode): void {
    // Only transform if enabled.
    if (!this._transformationEnabled) {
      return;
    }
    const index = this.transformedNodes.indexOf(original);
    if (index < 0) {
      throw new Error('Cannot transform node: original node not found');
    }
    this.transformedNodes[index] = replaced;
  }

  public getOriginalNodes(): MeldNode[] {
    return this.originalNodes;
  }

  public getTransformedNodes(): MeldNode[] {
    return this.transformedNodes;
  }

  /* from fix #1 and #2 above: clone() and setTransformedNodes(...). */
  public clone(): IStateService {
    const newService = new StateService();
    newService._transformationEnabled = this._transformationEnabled;
    newService.originalNodes = [...this.originalNodes];
    newService.transformedNodes = [...this.transformedNodes];
    return newService;
  }

  public setTransformedNodes(nodes: MeldNode[]): void {
    this.transformedNodes = nodes;
  }
}

────────────────────────────────────────────────────────
SUMMARY
By (1) adding clone(), (2) adding setTransformedNodes(...), and (3) fixing addNode/transformNode logic to match the tests’ expectations (including throwing on unknown nodes), you will resolve all 11 reported failures for transformation mode and rolling‐back/cloning issues.
