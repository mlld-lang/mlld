import { StateService } from './StateService';
import { StateChanges, MeldVariable } from '@core/types';
import type { IStateService } from './IStateService';
import type { IStateService as ILegacyStateService } from './IStateService.bak';
import { randomUUID } from 'crypto';

/**
 * Adapter that makes the minimal StateService compatible with the legacy interface.
 * This allows gradual migration while services are updated.
 */
export class StateServiceAdapter extends StateService implements ILegacyStateService {
  private transformationEnabled = false;
  private transformationOptions: any = {};
  private imports = new Set<string>();
  private localChanges: string[] = [];
  private transformedNodes: MeldNode[] | null = null;
  
  // Implement missing methods with minimal behavior
  
  addNode(node: MeldNode): void {
    super.addNode(node);
    // If transformation is enabled and we have transformed nodes, add to transformed list too
    if (this.transformationEnabled && this.transformedNodes) {
      this.transformedNodes.push(node);
    }
  }
  
  setEventService(): void {
    // No-op - we don't use events
  }
  
  setTrackingService(): void {
    // No-op - we don't use tracking
  }
  
  getStateId(): string | undefined {
    return this.stateId;
  }
  
  getInternalStateNode() {
    return {
      stateId: this.stateId,
      variables: {
        text: new Map(),
        data: new Map(),
        path: new Map()
      },
      commands: new Map(),
      imports: this.imports
    };
  }
  
  getTransformedNodes() {
    // Return transformed nodes if available, otherwise return original nodes
    return this.transformedNodes || this.getNodes();
  }
  
  setTransformedNodes(nodes: MeldNode[]): Promise<void> {
    this.transformedNodes = nodes;
    return Promise.resolve();
  }
  
  async transformNode(index: number, replacementNodes?: MeldNode[]): Promise<void> {
    // Initialize transformed nodes if not already done
    if (!this.transformedNodes) {
      this.transformedNodes = [...this.getNodes()];
    }
    
    // Apply the transformation
    if (index >= 0 && index < this.transformedNodes.length) {
      if (replacementNodes === undefined || replacementNodes.length === 0) {
        // Remove the node
        this.transformedNodes.splice(index, 1);
      } else {
        // Replace the node with the replacement nodes
        this.transformedNodes.splice(index, 1, ...replacementNodes);
      }
    }
  }
  
  isTransformationEnabled(): boolean {
    return this.transformationEnabled;
  }
  
  async setTransformationEnabled(enabled: boolean): Promise<void> {
    this.transformationEnabled = enabled;
    // Initialize transformed nodes when transformation is enabled
    if (enabled && !this.transformedNodes) {
      this.transformedNodes = [...this.getNodes()];
    }
  }
  
  getTransformationOptions() {
    return this.transformationOptions;
  }
  
  async setTransformationOptions(options: any): Promise<void> {
    this.transformationOptions = options;
  }
  
  async addImport(path: string): Promise<void> {
    this.imports.add(path);
  }
  
  async removeImport(path: string): Promise<void> {
    this.imports.delete(path);
  }
  
  hasImport(path: string): boolean {
    return this.imports.has(path);
  }
  
  getImports(): Set<string> {
    return new Set(this.imports);
  }
  
  getCurrentFilePath(): string | null {
    return this.currentFilePath;
  }
  
  async setCurrentFilePath(path: string): Promise<void> {
    this.currentFilePath = path;
  }
  
  hasLocalChanges(): boolean {
    return this.localChanges.length > 0;
  }
  
  getLocalChanges(): string[] {
    return [...this.localChanges];
  }
  
  setImmutable(): void {
    // No-op - minimal version doesn't have immutability
  }
  
  get isImmutable(): boolean {
    return false;
  }
  
  createChild(): IStateService {
    const child = new StateServiceAdapter();
    child.currentFilePath = this.currentFilePath;
    
    // Copy variables
    this.getAllVariables().forEach((variable, name) => {
      child.setVariable(variable);
    });
    
    // Copy nodes
    this.getNodes().forEach(node => {
      child.addNode(node);
    });
    
    return child;
  }
  
  createChildState(): ILegacyStateService {
    const child = new StateServiceAdapter();
    child.currentFilePath = this.currentFilePath;
    
    // Copy variables
    this.getAllVariables().forEach((variable, name) => {
      child.setVariable(variable);
    });
    
    // Copy nodes
    this.getNodes().forEach(node => {
      child.addNode(node);
    });
    
    // Copy transformation state
    child.transformationEnabled = this.transformationEnabled;
    if (this.transformedNodes) {
      child.transformedNodes = [...this.transformedNodes];
    }
    
    return child;
  }
  
  // Async version for compatibility
  async createChildStateAsync(): Promise<ILegacyStateService> {
    return this.createChildState();
  }
  
  async mergeChildState(childState: ILegacyStateService): Promise<void> {
    // Simple merge - just copy variables from child
    const variables = childState.getAllVariables();
    variables.forEach((variable) => {
      this.setVariable(variable);
    });
  }
  
  clone(): ILegacyStateService {
    return this.createChildState();
  }
  
  getParentState(): ILegacyStateService | undefined {
    return undefined; // Minimal version doesn't track parents
  }
  
  // Type-specific getters (delegate to base getVariable)
  
  getTextVar(name: string) {
    const variable = this.getVariable(name);
    return variable?.type === 'text' ? variable : undefined;
  }
  
  getDataVar(name: string) {
    const variable = this.getVariable(name);
    return variable?.type === 'data' ? variable : undefined;
  }
  
  getPathVar(name: string) {
    const variable = this.getVariable(name);
    return variable?.type === 'path' ? variable : undefined;
  }
  
  getCommandVar(name: string) {
    const variable = this.getVariable(name);
    return variable?.type === 'command' ? variable : undefined;
  }
  
  // Type-specific setters (create typed variables and use base setVariable)
  
  async setTextVar(name: string, value: string): Promise<void> {
    const { createTextVariable } = await import('@core/types');
    this.setVariable(createTextVariable(name, value));
  }
  
  async setDataVar(name: string, value: any): Promise<void> {
    const { createDataVariable } = await import('@core/types');
    this.setVariable(createDataVariable(name, value));
  }
  
  async setPathVar(name: string, value: any): Promise<void> {
    const { createPathVariable } = await import('@core/types');
    this.setVariable(createPathVariable(name, value));
  }
  
  async setCommandVar(name: string, value: any): Promise<void> {
    const { createCommandVariable } = await import('@core/types');
    this.setVariable(createCommandVariable(name, value));
  }
  
  // Get all by type methods
  
  getAllTextVars(): Map<string, any> {
    const result = new Map();
    this.getAllVariables().forEach((variable, name) => {
      if (variable.type === 'text') {
        result.set(name, variable);
      }
    });
    return result;
  }
  
  getAllDataVars(): Map<string, any> {
    const result = new Map();
    this.getAllVariables().forEach((variable, name) => {
      if (variable.type === 'data') {
        result.set(name, variable);
      }
    });
    return result;
  }
  
  getAllPathVars(): Map<string, any> {
    const result = new Map();
    this.getAllVariables().forEach((variable, name) => {
      if (variable.type === 'path') {
        result.set(name, variable);
      }
    });
    return result;
  }
  
  getAllCommands(): Map<string, any> {
    const result = new Map();
    this.getAllVariables().forEach((variable, name) => {
      if (variable.type === 'command') {
        result.set(name, variable);
      }
    });
    return result;
  }
  
  getLocalTextVars(): Map<string, any> {
    return this.getAllTextVars(); // No parent tracking in minimal version
  }
  
  getLocalDataVars(): Map<string, any> {
    return this.getAllDataVars(); // No parent tracking in minimal version
  }
  
  // Apply state changes - the key method for handler integration
  
  async applyStateChanges(changes: StateChanges): Promise<ILegacyStateService> {
    // Create a new instance
    const newState = new StateServiceAdapter();
    newState.currentFilePath = this.currentFilePath;
    
    // Copy existing variables
    this.getAllVariables().forEach((variable) => {
      newState.setVariable(variable);
    });
    
    // Apply changes
    if (changes.variables) {
      // changes.variables is a Record<string, VariableDefinition>
      for (const [name, variable] of Object.entries(changes.variables)) {
        newState.setVariable(variable);
      }
    }
    
    // Handle other change types if needed
    if (changes.nodes) {
      for (const node of changes.nodes) {
        newState.addNode(node);
      }
    }
    
    return newState;
  }
  
  // Add missing method that DirectiveService type guard checks for
  hasVariable(name: string): boolean {
    return this.getVariable(name) !== undefined;
  }
  
  appendContent(content: string): Promise<void> {
    // Create a simple text node
    const textNode = {
      type: 'Text' as const,
      nodeId: randomUUID(),
      content
    };
    this.addNode(textNode);
    return Promise.resolve();
  }
}