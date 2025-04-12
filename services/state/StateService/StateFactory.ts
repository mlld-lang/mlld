import type { StateNode, StateNodeOptions, IStateFactory, StateOperation } from '@services/state/StateService/types.js';
import { stateLogger as logger } from '@core/utils/logger.js';
import { randomUUID } from 'crypto';
import { Service } from '@core/ServiceProvider.js';
import { injectable } from 'tsyringe';
import { cloneDeep } from 'lodash';

/**
 * Factory for creating and managing immutable state objects
 */
@injectable()
@Service({
  description: 'Factory for creating and managing immutable state objects'
})
export class StateFactory implements IStateFactory {
  private operations: StateOperation[] = [];

  createState(options?: StateNodeOptions): StateNode {
    const state: StateNode = {
      stateId: randomUUID(),
      variables: {
        text: new Map(options?.parentState?.variables.text ?? []),
        data: new Map(options?.parentState?.variables.data ?? []),
        path: new Map(options?.parentState?.variables.path ?? [])
      },
      commands: new Map(options?.parentState?.commands ?? []),
      imports: new Set(options?.parentState?.imports ?? []),
      nodes: [...(options?.parentState?.nodes ?? [])],
      transformedNodes: options?.parentState?.transformedNodes ? [...options.parentState.transformedNodes] : undefined,
      filePath: options?.filePath ?? options?.parentState?.filePath,
      parentState: options?.parentState
    };

    this.logOperation({
      type: 'create',
      timestamp: Date.now(),
      source: options?.source ?? 'createState',
      details: {
        operation: 'createState',
        value: state
      }
    });

    return state;
  }

  createChildState(parent: StateNode, options?: StateNodeOptions): StateNode {
    const child = this.createState({
      ...options,
      parentState: parent,
      source: options?.source ?? 'createChildState'
    });

    this.logOperation({
      type: 'create',
      timestamp: Date.now(),
      source: options?.source ?? 'createChildState',
      details: {
        operation: 'createChildState',
        value: child
      }
    });

    return child;
  }

  mergeStates(parent: StateNode, child: StateNode): StateNode {
    // Create new maps with parent values as base
    const text = new Map(parent.variables.text);
    const data = new Map(parent.variables.data);
    const path = new Map(parent.variables.path);
    const commands = new Map(parent.commands);

    // Merge child variables - last write wins
    for (const [key, value] of child.variables.text) {
      text.set(key, value);
    }
    for (const [key, value] of child.variables.data) {
      data.set(key, value);
    }
    for (const [key, value] of child.variables.path) {
      path.set(key, value);
    }
    for (const [key, value] of child.commands) {
      commands.set(key, value);
    }

    // Create new state with merged values
    const merged: StateNode = {
      variables: {
        text,
        data,
        path
      },
      commands,
      imports: new Set([...parent.imports, ...child.imports]),
      // Preserve node order by appending all child nodes
      nodes: [...parent.nodes, ...child.nodes],
      // Merge transformed nodes if either parent or child has them
      transformedNodes: child.transformedNodes !== undefined ? [...child.transformedNodes] :
                       parent.transformedNodes !== undefined ? [...parent.transformedNodes] :
                       undefined,
      filePath: child.filePath ?? parent.filePath,
      parentState: parent.parentState,
      // Preserve parent's stateId to maintain identity
      stateId: parent.stateId,
      source: 'merge'
    };

    this.logOperation({
      type: 'merge',
      timestamp: Date.now(),
      source: 'mergeStates',
      details: {
        operation: 'mergeStates',
        value: merged
      }
    });

    return merged;
  }

  updateState(state: StateNode, updates: Partial<StateNode>): StateNode {
    // Create new maps, copying from updates if present, otherwise from original state
    const newTextMap = new Map(updates.variables?.text ?? state.variables.text);
    const newDataMap = new Map(updates.variables?.data ?? state.variables.data);
    const newPathMap = new Map(updates.variables?.path ?? state.variables.path);

    const updated: StateNode = {
      stateId: state.stateId,
      variables: { // Use the newly created maps
        text: newTextMap,
        data: newDataMap,
        path: newPathMap
      },
      commands: new Map(updates.commands ?? state.commands), // Also ensure new maps/sets here
      imports: new Set(updates.imports ?? state.imports),
      nodes: [...(updates.nodes ?? state.nodes)],
      transformedNodes: updates.transformedNodes !== undefined ? [...updates.transformedNodes] : state.transformedNodes,
      filePath: updates.filePath ?? state.filePath,
      parentState: updates.parentState ?? state.parentState
    };

    this.logOperation({
      type: 'update',
      timestamp: Date.now(),
      source: 'updateState',
      details: {
        operation: 'updateState',
        value: updated
      }
    });

    // Log the text variables within the returned node
    logger.debug('[StateFactory.updateState] Returning updated node:', { 
        stateId: updated.stateId,
        updatedTextVars: Array.from(updated.variables.text.entries()).map(([k, v]) => ({ key: k, value: v.value }))
    });

    return updated;
  }

  /**
   * Creates a cloned state that is a deep copy of the original state
   * but with a new stateId and no parentState reference
   */
  createClonedState(originalState: StateNode, options?: StateNodeOptions): StateNode {
    // Use lodash.cloneDeep for a true deep copy
    const clonedState = cloneDeep(originalState);

    // Ensure the cloned state has a unique ID and no parent linkage
    clonedState.stateId = randomUUID();
    // Explicitly remove parentState reference after deep clone
    (clonedState as any).parentState = undefined; // Need 'as any' because parentState is readonly in the interface

    // Set source and potentially override filePath based on options
    clonedState.source = 'clone';
    if (options?.filePath) {
      clonedState.filePath = options.filePath;
    }
    
    // Ensure transformedNodes exists if it should, even if empty (cloneDeep preserves absence)
    if (originalState.transformedNodes && !clonedState.transformedNodes) {
        (clonedState as any).transformedNodes = []; // Use 'as any' for readonly property
    }

    this.logOperation({
      type: 'create',
      timestamp: Date.now(),
      source: options?.source ?? 'createClonedState',
      details: {
        operation: 'createClonedState',
        value: clonedState
      }
    });

    return clonedState;
  }

  private logOperation(operation: StateOperation): void {
    this.operations.push(operation);
    logger.debug('State operation', operation);
  }
} 