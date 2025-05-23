import { randomUUID } from 'crypto';
import type { MeldNode } from '@core/ast/types';
import type { MeldVariable } from '@core/types';
import type { IStateService } from './IStateService';

/**
 * Minimal implementation of StateService.
 * 
 * This is a simple container that stores variables and nodes.
 * No transformation logic, no event system, no complex state management.
 */
export class StateService implements IStateService {
  readonly stateId: string;
  currentFilePath: string | null = null;
  
  private variables = new Map<string, MeldVariable>();
  private nodes: MeldNode[] = [];
  
  constructor() {
    this.stateId = randomUUID();
  }
  
  // Variable storage methods
  
  getVariable(name: string): MeldVariable | undefined {
    return this.variables.get(name);
  }
  
  setVariable(variable: MeldVariable): void {
    this.variables.set(variable.name, variable);
  }
  
  getAllVariables(): Map<string, MeldVariable> {
    // Return a copy to prevent external mutations
    return new Map(this.variables);
  }
  
  // Node storage methods
  
  addNode(node: MeldNode): void {
    this.nodes.push(node);
  }
  
  getNodes(): MeldNode[] {
    // Return a copy to prevent external mutations
    return [...this.nodes];
  }
  
  // State management
  
  createChild(): IStateService {
    const child = new StateService();
    child.currentFilePath = this.currentFilePath;
    
    // Copy variables by reference - child starts with parent's variables
    this.variables.forEach((variable, name) => {
      child.variables.set(name, variable);
    });
    
    // Child starts with empty nodes array
    // (nodes are document-specific, not inherited)
    
    return child;
  }
}