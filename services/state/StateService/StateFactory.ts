import type { StateNode, StateNodeOptions, IStateFactory, StateOperation } from '@services/state/StateService/types.js';
import { stateLogger as logger } from '@core/utils/logger.js';
import { randomUUID } from 'crypto';
import { Service } from '@core/ServiceProvider.js';
import { injectable } from 'tsyringe';
import cloneDeep from 'lodash/cloneDeep.js';
import type { IStateService } from './IStateService.js';
import type { TransformationOptions } from '@core/types/state.js';

/**
 * Default transformation options
 */
const DEFAULT_TRANSFORMATION_OPTIONS: TransformationOptions = {
  enabled: false,
  preserveOriginal: true,
  transformNested: true,
};

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
    const now = Date.now();
    const parentTransformationOptions = options?.parentState?.transformationOptions;

    const state: StateNode = {
      stateId: randomUUID(),
      variables: {
        text: new Map(),
        data: new Map(),
        path: new Map()
      },
      commands: new Map(),
      imports: new Set(),
      nodes: [],
      transformedNodes: undefined,
      filePath: options?.filePath,
      transformationOptions: parentTransformationOptions ?? DEFAULT_TRANSFORMATION_OPTIONS,
      createdAt: now,
      modifiedAt: now,
      source: options?.source as StateNode['source']
    };

    this.logOperation({
      type: 'create',
      timestamp: now,
      source: options?.source ?? 'createState',
      details: {
        operation: 'createState'
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
        operation: 'createChildState'
      }
    });

    return child;
  }

  mergeStates(parent: StateNode, child: StateNode): StateNode {
    const now = Date.now();
    const text = cloneDeep(parent.variables.text);
    const data = cloneDeep(parent.variables.data);
    const path = cloneDeep(parent.variables.path);
    const commands = cloneDeep(parent.commands);

    for (const [key, value] of child.variables.text) {
      text.set(key, cloneDeep(value));
    }
    for (const [key, value] of child.variables.data) {
      data.set(key, cloneDeep(value));
    }
    for (const [key, value] of child.variables.path) {
      path.set(key, cloneDeep(value));
    }
    for (const [key, value] of child.commands) {
      commands.set(key, cloneDeep(value));
    }

    const merged: StateNode = {
      variables: {
        text,
        data,
        path
      },
      commands,
      imports: new Set([...parent.imports, ...child.imports]),
      nodes: [...parent.nodes, ...child.nodes],
      transformedNodes: child.transformedNodes !== undefined 
          ? [...(parent.transformedNodes || []), ...child.transformedNodes] 
          : parent.transformedNodes ? [...parent.transformedNodes] : undefined,
      filePath: child.filePath ?? parent.filePath,
      stateId: parent.stateId,
      transformationOptions: parent.transformationOptions,
      createdAt: parent.createdAt,
      modifiedAt: now,
      source: 'merge'
    };

    this.logOperation({
      type: 'merge',
      timestamp: now,
      source: 'mergeStates',
      details: {
        operation: 'mergeStates'
      }
    });

    return merged;
  }

  updateState(state: StateNode, updates: Partial<Omit<StateNode, 'stateId' | 'createdAt' | 'parentServiceRef'>>): StateNode {
    const now = Date.now();
    
    const source = (updates as any)?.source || 'unknown_update';
    const approxBeforeTextSize = JSON.stringify(state.variables.text).length;
    const approxBeforeDataSize = JSON.stringify(state.variables.data).length;
    const approxBeforePathSize = JSON.stringify(state.variables.path).length;
    const approxBeforeCommandSize = JSON.stringify(state.commands).length;
    process.stdout.write(`DEBUG [StateFactory.updateState ENTRY] Source: ${source}, StateID: ${state.stateId}, ApproxSizes: Text=${approxBeforeTextSize}, Data=${approxBeforeDataSize}, Path=${approxBeforePathSize}, Cmd=${approxBeforeCommandSize}\n`);

    const existingParentRef = state.parentServiceRef;

    // --- Corrected Map Merging Logic --- 
    // NOTE: [StateFactory Map Handling - 2024-08-XX]
    // This logic was corrected to directly use the maps provided in the 'updates' object
    // (updates.variables.text, updates.commands, etc.) when they exist. The previous logic
    // copied the original state maps and only applied .set() operations from the update maps.
    // This meant deletions performed *before* calling updateState (like in StateService.removeVariable)
    // were not persisted, as the deleted key was never iterated over in the .set() loop.
    // This fix ensures that if an entirely new map (with deletions) is passed in `updates`,
    // that new map is used for the resulting state node.
    // This change might be related to fixes for previous API integration test failures.
    
    // Determine the final maps to use
    const finalTextMap = updates.variables?.text ?? new Map(state.variables.text);
    const finalDataMap = updates.variables?.data ?? new Map(state.variables.data);
    const finalPathMap = updates.variables?.path ?? new Map(state.variables.path);
    const finalCommandsMap = updates.commands ?? new Map(state.commands);

    const updated: StateNode = {
      stateId: state.stateId,
      variables: {
        text: finalTextMap, // Use the final maps
        data: finalDataMap,
        path: finalPathMap
      },
      commands: finalCommandsMap, // Use the final map
      // Carry over other properties, applying updates if they exist
      imports: updates.imports ? new Set(updates.imports) : new Set(state.imports), 
      nodes: updates.nodes ? [...updates.nodes] : [...state.nodes], 
      transformedNodes: updates.transformedNodes !== undefined 
                          ? [...updates.transformedNodes] 
                          : state.transformedNodes ? [...state.transformedNodes] : undefined, 
      filePath: updates.filePath ?? state.filePath,
      transformationOptions: updates.transformationOptions ?? state.transformationOptions,
      createdAt: state.createdAt,
      modifiedAt: now,
      source: (updates.source as StateNode['source']) ?? state.source
    };

    this.logOperation({
      type: 'update',
      timestamp: now,
      source: 'updateState',
      details: {
        operation: 'updateState',
        key: 'updatedKeys', 
        value: Object.keys(updates)
      }
    });

    return updated;
  }

  createClonedState(originalState: StateNode, options?: StateNodeOptions): StateNode {
    const now = Date.now();

    const source = options?.source || 'createClonedState';
    const approxBeforeTextSize = JSON.stringify(originalState.variables.text).length;
    const approxBeforeDataSize = JSON.stringify(originalState.variables.data).length;
    const approxBeforePathSize = JSON.stringify(originalState.variables.path).length;
    const approxBeforeCommandSize = JSON.stringify(originalState.commands).length;
    process.stdout.write(`DEBUG [StateFactory.createClonedState ENTRY] Source: ${source}, OriginalStateID: ${originalState.stateId}, ApproxSizes: Text=${approxBeforeTextSize}, Data=${approxBeforeDataSize}, Path=${approxBeforePathSize}, Cmd=${approxBeforeCommandSize}\n`);

    const clonedVariables = {
        text: cloneDeep(originalState.variables.text),
        data: cloneDeep(originalState.variables.data),
        path: cloneDeep(originalState.variables.path)
    };
    const clonedCommands = cloneDeep(originalState.commands);

    const clonedState: StateNode = {
      stateId: randomUUID(),
      variables: clonedVariables,
      commands: clonedCommands,
      imports: new Set(originalState.imports),
      nodes: [...originalState.nodes],
      transformedNodes: originalState.transformedNodes ? [...originalState.transformedNodes] : undefined,
      filePath: options?.filePath ?? originalState.filePath,
      transformationOptions: originalState.transformationOptions,
      createdAt: now,
      modifiedAt: now,
      source: source as StateNode['source']
    };

    this.logOperation({
      type: 'create',
      timestamp: now,
      source: source,
      details: {
        operation: 'createClonedState'
      }
    });

    return clonedState;
  }

  private logOperation(operation: StateOperation): void {
    this.operations.push(operation);
  }
} 