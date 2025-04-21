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
 * Options for creating a new state node
 */
export interface StateNodeOptions {
  readonly parentServiceRef?: IStateService;
  readonly transformationOptions?: TransformationOptions;
  readonly filePath?: string;
  readonly source?: string;
}

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
    const parentOptions = options?.parentServiceRef?.getInternalStateNode()?.transformationOptions;
    const explicitOptions = options?.transformationOptions;

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
      parentServiceRef: options?.parentServiceRef,
      transformationOptions: explicitOptions ?? parentOptions ?? DEFAULT_TRANSFORMATION_OPTIONS,
      createdAt: now,
      modifiedAt: now
    };

    this.logOperation({
      type: 'create',
      timestamp: now,
      source: options?.source ?? 'createState',
      details: {
        operation: 'createState',
        stateId: state.stateId
      }
    });

    return state;
  }

  createChildState(parentService: IStateService, options?: StateNodeOptions): StateNode {
    const parentTransformationOptions = parentService.getTransformationOptions();

    const child = this.createState({
      ...options,
      parentServiceRef: parentService,
      transformationOptions: options?.transformationOptions ?? parentTransformationOptions,
      source: options?.source ?? 'createChildState'
    });

    this.logOperation({
      type: 'create',
      timestamp: Date.now(),
      source: options?.source ?? 'createChildState',
      details: {
        operation: 'createChildState',
        parentStateId: parentService.getStateId(),
        stateId: child.stateId
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
      parentServiceRef: parent.parentServiceRef,
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
        operation: 'mergeStates',
        parentStateId: parent.stateId,
        childStateId: child.stateId,
        stateId: merged.stateId
      }
    });

    return merged;
  }

  updateState(state: StateNode, updates: Partial<Omit<StateNode, 'stateId' | 'createdAt' | 'parentServiceRef'>>): StateNode {
    const now = Date.now();
    
    // Always create new maps, cloning from updates if provided, otherwise from original state
    const newTextMap = new Map(
      Array.from(updates.variables?.text ?? state.variables.text,
                 ([key, value]) => [key, cloneDeep(value)])
    );
    const newDataMap = new Map(
      Array.from(updates.variables?.data ?? state.variables.data,
                 ([key, value]) => [key, cloneDeep(value)])
    );
    const newPathMap = new Map(
      Array.from(updates.variables?.path ?? state.variables.path,
                 ([key, value]) => [key, cloneDeep(value)])
    );
    const newCommandsMap = new Map(
      Array.from(updates.commands ?? state.commands,
                 ([key, value]) => [key, cloneDeep(value)])
    );

    const updated: StateNode = {
      stateId: state.stateId,
      variables: {
        text: newTextMap,
        data: newDataMap,
        path: newPathMap
      },
      commands: newCommandsMap,
      imports: updates.imports ? new Set(updates.imports) : new Set(state.imports), // Ensure new Set
      nodes: updates.nodes ? [...updates.nodes] : [...state.nodes], // Ensure new array
      transformedNodes: updates.transformedNodes !== undefined 
                          ? [...updates.transformedNodes] 
                          : state.transformedNodes ? [...state.transformedNodes] : undefined, // Ensure new array if exists
      filePath: updates.filePath ?? state.filePath,
      parentServiceRef: state.parentServiceRef,
      transformationOptions: updates.transformationOptions ?? state.transformationOptions,
      createdAt: state.createdAt,
      modifiedAt: now,
      source: state.source
    };

    this.logOperation({
      type: 'update',
      timestamp: now,
      source: 'updateState',
      details: {
        operation: 'updateState',
        stateId: updated.stateId,
        updatedKeys: Object.keys(updates)
      }
    });

    return updated;
  }

  createClonedState(originalState: StateNode, options?: StateNodeOptions): StateNode {
    const now = Date.now();
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
      parentServiceRef: options?.parentServiceRef ?? originalState.parentServiceRef,
      transformationOptions: options?.transformationOptions ?? originalState.transformationOptions,
      createdAt: now,
      modifiedAt: now,
      source: 'clone'
    };

    this.logOperation({
      type: 'create',
      timestamp: now,
      source: options?.source ?? 'createClonedState',
      details: {
        operation: 'createClonedState',
        originalStateId: originalState.stateId,
        stateId: clonedState.stateId
      }
    });

    return clonedState;
  }

  private logOperation(operation: StateOperation): void {
    this.operations.push(operation);
  }
} 