// TODO: [StateService Merge Tracking Test Failure - 2024-08-26]
// The test 'StateService > State Tracking > should track merge relationships via client'
// consistently fails. 
// Expected: After mockReset(trackingClient), service.mergeChildState(child) should make exactly 
// one call to trackingClient.registerRelationship with type 'merge-source'.
// Actual: It makes 0 calls after the reset.
// Investigation Notes:
// - StateService.mergeChildState code *appears* correct, calling this.trackingClient.addRelationship('merge-source').
// - Test setup uses TestContextDI and correctly registers the mockTrackingClientFactory.
// - Tried both with and without mockReset before the merge call; failure mode changes but persists.
// - All other tests in this suite pass, including other trackingClient interactions (create, clone).
// - Linter errors are resolved.
// Potential Cause: Unknown. Suspect subtle interaction between DI, mocking, StateTrackingServiceClientFactory,
// or the specific internal logic within mergeChildState preventing the client call under test conditions.
// Decision: Pausing investigation to proceed with Phase 2 refactoring. Revisit if becomes blocker or during
// tracking service refactor.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { StateService } from '@services/state/StateService/StateService.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import type { IStateEventService, StateEvent } from '@services/state/StateEventService/IStateEventService.js';
import type { MeldNode, TextNode } from '@core/syntax/types/index.js';
import { VariableType, PathContentType, ICommandDefinition, IFilesystemPathState, IUrlPathState, createTextVariable, createDataVariable, RelativePath, createPathVariable } from '@core/types/index.js';
import { unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient.js';

describe('StateService', () => {
  let state: StateService;
  let mockEventService: IStateEventService;
  let stateFactory: StateFactory;
  let trackingClient: IStateTrackingServiceClient;

  beforeEach(() => {
    mockEventService = mock<IStateEventService>();
    trackingClient = mock<IStateTrackingServiceClient>();
    stateFactory = new StateFactory();
    const trackingClientFactory = { createClient: vi.fn().mockReturnValue(trackingClient) };
    state = new StateService(stateFactory, mockEventService, trackingClientFactory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic functionality', () => {
    it('should set and get text variables', () => {
      const variable = state.setTextVar('greeting', 'Hello');
      expect(variable).toMatchObject({
        type: VariableType.TEXT,
        name: 'greeting',
        value: 'Hello',
      });
      expect(variable.metadata).toBeDefined();

      const retrieved = state.getTextVar('greeting');
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value).toBe('Hello');
    });

    it('should return undefined for non-existent text variables', () => {
      expect(state.getTextVar('nonexistent')).toBeUndefined();
    });

    it('should get all text variables', () => {
      state.setTextVar('greeting', 'Hello');
      state.setTextVar('farewell', 'Goodbye');

      const vars = state.getAllTextVars();
      expect(vars.size).toBe(2);
      expect(vars.get('greeting')).toMatchObject({ type: VariableType.TEXT, name: 'greeting', value: 'Hello' });
      expect(vars.get('farewell')).toMatchObject({ type: VariableType.TEXT, name: 'farewell', value: 'Goodbye' });
    });

    it('should set and get data variables', () => {
      const dataValue = { foo: 'bar', nested: { num: 1 } };
      const variable = state.setDataVar('config', dataValue);
      expect(variable).toMatchObject({
        type: VariableType.DATA,
        name: 'config',
        value: dataValue,
      });
      expect(variable.metadata).toBeDefined();

      const retrieved = state.getDataVar('config');
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value).toEqual(dataValue);
    });

    it('should set and get path variables (filesystem)', () => {
      const fsPathValue: IFilesystemPathState = {
        contentType: PathContentType.FILESYSTEM,
        originalValue: './some/path.txt',
        isValidSyntax: true,
        isSecure: true,
        isAbsolute: false,
        validatedPath: unsafeCreateValidatedResourcePath('./some/path.txt') as RelativePath,
        exists: undefined
      };
      const variable = state.setPathVar('local', fsPathValue);
      
      expect(variable.name).toBe('local');
      expect(variable.value).toEqual(fsPathValue);
      expect(variable.type).toBe(VariableType.PATH);
      
      const retrieved = state.getPathVar('local');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('local');
      expect(retrieved?.value).toEqual(fsPathValue);
      expect(retrieved?.type).toBe(VariableType.PATH);
    });
    
    it('should set and get path variables (URL)', () => {
      const urlValue: IUrlPathState = {
        contentType: PathContentType.URL,
        originalValue: 'https://example.com',
        isValidated: true,
        fetchStatus: 'not_fetched',
        validatedPath: unsafeCreateValidatedResourcePath('https://example.com')
      };
      const variable = state.setPathVar('remote', urlValue);
      
      expect(variable.name).toBe('remote');
      expect(variable.value).toEqual(urlValue);
      expect(variable.type).toBe(VariableType.PATH);
      
      const retrieved = state.getPathVar('remote');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('remote');
      expect(retrieved?.value).toEqual(urlValue);
      expect(retrieved?.type).toBe(VariableType.PATH);
    });

    it('should set and get command variables', () => {
      const commandDef: ICommandDefinition = { 
        type: 'basic',
        command: 'echo "{{msg}}"', 
        parameters: ['msg'] 
      };
      const variable = state.setCommandVar('echoCmd', commandDef);
      
      expect(variable).toMatchObject({
        type: VariableType.COMMAND,
        name: 'echoCmd',
        value: expect.objectContaining({
          type: 'basic',
          command: 'echo "{{msg}}"',
          parameters: expect.arrayContaining(['msg'])
        })
      });
      expect(variable.metadata).toBeDefined();

      const retrieved = state.getCommandVar('echoCmd');
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value).toEqual(commandDef);
    });

    it('should add and get nodes', () => {
      const node: TextNode = {
        type: 'Text',
        content: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      state.addNode(node);
      expect(state.getNodes()).toEqual([node]);
    });

    it('should add and check imports', () => {
      state.addImport('test.md');
      expect(state.hasImport('test.md')).toBe(true);
    });

    it('should emit events for state operations', () => {
      const handler = vi.fn();
      mockEventService.on('transform', handler);

      state.setCurrentFilePath('test.meld');
      state.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'transform',
        source: 'setTextVar:test'
      }));
    });

    it('should create child state with inherited properties (typed)', () => {
      const parentTextVar = state.setTextVar('parentText', 'value');
      const parentDataVar = state.setDataVar('parentData', { key: 'data' });
      const parentPathVar = state.setPathVar('parentPath', { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './parent', 
        isValidSyntax: true, 
        isSecure: true, 
        isAbsolute: false 
      } as IFilesystemPathState);
      const parentCmdVar = state.setCommandVar('parentCmd', { type: 'basic', command: 'echo parent' } as ICommandDefinition);
      
      const child = state.createChildState();
      
      expect(child.getTextVar('parentText')).toEqual(parentTextVar);
      expect(child.getDataVar('parentData')).toEqual(parentDataVar);
      expect(child.getPathVar('parentPath')).toEqual(parentPathVar);
      expect(child.getCommandVar('parentCmd')).toEqual(parentCmdVar);
      
      child.setTextVar('childText', 'childValue');
      expect(state.getTextVar('childText')).toBeUndefined();
      child.setTextVar('parentText', 'newValueInChild');
      expect(state.getTextVar('parentText')?.value).toBe('value');
    });

    it('should clone state properly (deep copy)', () => {
      const originalText = state.setTextVar('originalText', 'value');
      const originalData = state.setDataVar('originalData', { nested: { val: 1 } });
      const originalPathValue: IFilesystemPathState = { contentType: PathContentType.FILESYSTEM, originalValue: './orig', isValidSyntax: true, isSecure: true, isAbsolute: false };
      const originalPath = state.setPathVar('originalPath', originalPathValue);
      const originalCmdValue: ICommandDefinition = { type: 'basic', command: 'echo orig' };
      const originalCmd = state.setCommandVar('originalCmd', originalCmdValue);
      state.setTransformationEnabled(true);
      state.setTransformationOptions({ enabled: true, preserveOriginal: false, transformNested: false});
      
      const clone = state.clone();
      
      expect(clone).toBeInstanceOf(StateService);
      expect(clone.getStateId()).not.toBe(state.getStateId());
      expect(clone.isTransformationEnabled()).toBe(true);
      expect(clone.getTransformationOptions()).toEqual({ enabled: true, preserveOriginal: false, transformNested: false});
      
      expect(clone.getTextVar('originalText')?.value).toBe('value');
      expect(clone.getDataVar('originalData')?.value).toEqual({ nested: { val: 1 } });
      expect(clone.getPathVar('originalPath')?.value).toEqual(originalPathValue);
      expect(clone.getCommandVar('originalCmd')?.value).toEqual(originalCmdValue);
      
      clone.setTextVar('originalText', 'clonedValue');
      expect(state.getTextVar('originalText')?.value).toBe('value');
      
      const clonedDataVar = clone.getDataVar('originalData');
      (clonedDataVar?.value as any).nested.val = 2;
      expect((state.getDataVar('originalData')?.value as any).nested.val).toBe(1);
      
      const clonedPathVar = clone.getPathVar('originalPath');
      (clonedPathVar?.value as IFilesystemPathState).originalValue = './cloned';
      expect((state.getPathVar('originalPath')?.value as IFilesystemPathState).originalValue).toBe('./orig');
      
      const clonedCmdVar = clone.getCommandVar('originalCmd');
      (clonedCmdVar?.value as any).command = 'echo cloned'; 
      expect((state.getCommandVar('originalCmd')?.value as any).command).toBe('echo orig');

      clone.setTextVar('new', 'value');
      expect(state.getTextVar('new')).toBeUndefined();
    });
  });
  
  describe('Generic Variable Methods', () => {
    beforeEach(() => {
      state.setTextVar('myText', 'text val');
      state.setDataVar('myData', { key: 'data val' });
      state.setPathVar('myPath', { contentType: PathContentType.FILESYSTEM, originalValue: './path', isValidSyntax: true } as IFilesystemPathState);
      state.setCommandVar('myCmd', { type: 'basic', command: 'echo cmd' } as ICommandDefinition);
    });

    it('getVariable should retrieve variable by name, checking types in order', () => {
      expect(state.getVariable('myText')?.value).toBe('text val');
      expect(state.getVariable('myData')?.value).toEqual({ key: 'data val' });
      expect((state.getVariable('myPath')?.value as IFilesystemPathState)?.originalValue).toBe('./path');
      expect((state.getVariable('myCmd')?.value as ICommandDefinition)?.command).toBe('echo cmd');
      expect(state.getVariable('nonExistent')).toBeUndefined();
    });

    it('getVariable should retrieve variable by name and specific type', () => {
      expect(state.getVariable('myText', VariableType.TEXT)?.value).toBe('text val');
      expect(state.getVariable('myText', VariableType.DATA)).toBeUndefined();
      expect(state.getVariable('myData', VariableType.DATA)?.value).toEqual({ key: 'data val' });
      expect(state.getVariable('myData', VariableType.PATH)).toBeUndefined();
      expect(state.getVariable('myPath', VariableType.PATH)).toBeDefined();
      expect(state.getVariable('myCmd', VariableType.COMMAND)).toBeDefined();
    });

    it('setVariable should store variables correctly based on type', () => {
      const newTextVar = createTextVariable('newText', 'new');
      const newDataVar = createDataVariable('newData', [1, 2]);
      state.setVariable(newTextVar);
      state.setVariable(newDataVar);
      expect(state.getTextVar('newText')).toEqual(newTextVar);
      expect(state.getDataVar('newData')).toEqual(newDataVar);
    });

    it('hasVariable should check existence by name', () => {
      expect(state.hasVariable('myText')).toBe(true);
      expect(state.hasVariable('myData')).toBe(true);
      expect(state.hasVariable('myPath')).toBe(true);
      expect(state.hasVariable('myCmd')).toBe(true);
      expect(state.hasVariable('nonExistent')).toBe(false);
    });

    it('hasVariable should check existence by name and specific type', () => {
      expect(state.hasVariable('myText', VariableType.TEXT)).toBe(true);
      expect(state.hasVariable('myText', VariableType.DATA)).toBe(false);
      expect(state.hasVariable('myData', VariableType.DATA)).toBe(true);
      expect(state.hasVariable('myPath', VariableType.PATH)).toBe(true);
      expect(state.hasVariable('myCmd', VariableType.COMMAND)).toBe(true);
    });

    it('removeVariable should remove variable by name (all types)', () => {
      expect(state.removeVariable('myText')).toBe(true);
      expect(state.hasVariable('myText')).toBe(false);
      expect(state.removeVariable('myData')).toBe(true);
      expect(state.hasVariable('myData')).toBe(false);
      expect(state.removeVariable('nonExistent')).toBe(false);
    });

    it('removeVariable should remove variable by name and specific type', () => {
      expect(state.removeVariable('myText', VariableType.DATA)).toBe(false);
      expect(state.hasVariable('myText', VariableType.TEXT)).toBe(true);
      expect(state.removeVariable('myText', VariableType.TEXT)).toBe(true);
      expect(state.hasVariable('myText', VariableType.TEXT)).toBe(false);
    });
  });
  
  describe('Node management', () => {
    it('should handle empty nodes array', () => {
      expect(state.getNodes()).toEqual([]);
    });
  });
  
  describe('Immutability', () => {
    it('should be mutable by default', () => {
      expect(state.isImmutable()).toBe(false);
    });

    it('should become immutable when setImmutable is called', () => {
      state.setImmutable(true);
      expect(state.isImmutable()).toBe(true);
    });

    it('should throw error on modification attempts when immutable', () => {
      state.setImmutable(true);
      expect(() => state.setTextVar('test', 'value')).toThrow();
    });
  });
  
  describe('Cloning and Merging', () => {
    it('should clone the current state', () => {
      const cloned = state.clone();
      expect(cloned).toBeInstanceOf(StateService);
      expect(cloned.getStateId()).not.toBe(state.getStateId());
    });

    it('should create a child state inheriting variables', () => {
      const parentTextVar = state.setTextVar('parentText', 'value');
      const parentDataVar = state.setDataVar('parentData', { key: 'data' });
      const parentPathVar = state.setPathVar('parentPath', { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './parent', 
        isValidSyntax: true, 
        isSecure: true, 
        isAbsolute: false 
      } as IFilesystemPathState);
      const parentCmdVar = state.setCommandVar('parentCmd', { type: 'basic', command: 'echo parent' } as ICommandDefinition);
      
      const child = state.createChildState();
      
      expect(child.getTextVar('parentText')).toEqual(parentTextVar);
      expect(child.getDataVar('parentData')).toEqual(parentDataVar);
      expect(child.getPathVar('parentPath')).toEqual(parentPathVar);
      expect(child.getCommandVar('parentCmd')).toEqual(parentCmdVar);
      
      child.setTextVar('childText', 'childValue');
      expect(state.getTextVar('childText')).toBeUndefined();
      child.setTextVar('parentText', 'newValueInChild');
      expect(state.getTextVar('parentText')?.value).toBe('value');
    });

    it('should merge variables from child state', () => {
      const childState = state.createChildState();
      childState.setTextVar('childVar', 'childValue');
      vi.clearAllMocks();
      state.mergeChildState(childState);
      expect(trackingClient.registerRelationship).toHaveBeenCalledTimes(1);
      expect(trackingClient.registerRelationship).toHaveBeenCalledWith(
        expect.objectContaining({ 
            sourceId: state.getStateId(), 
            targetId: childState.getStateId(), 
            type: 'merge-source' 
        })
      );
    });

    it('should not overwrite existing parent variables on merge by default', () => {
      const childState = state.createChildState();
      childState.setTextVar('childVar', 'childValue');
      state.mergeChildState(childState);
      expect(state.getTextVar('childVar')).toBeUndefined();
    });
  });

  describe('State Tracking', () => {
    it('should track merge relationships via client', () => {
      const childState = state.createChildState();
      childState.setTextVar('childVar', 'childValue');
      vi.clearAllMocks();
      state.mergeChildState(childState);
      expect(trackingClient.registerRelationship).toHaveBeenCalledTimes(1);
      expect(trackingClient.registerRelationship).toHaveBeenCalledWith(
        expect.objectContaining({ 
            sourceId: state.getStateId(), 
            targetId: childState.getStateId(), 
            type: 'merge-source' 
        })
      );
    });
  });

  describe('Event Emission', () => {
    it('should emit stateChange event on updateState', async () => {
      const handler = vi.fn();
      state.on('stateChange', handler);

      state.setCurrentFilePath('test.meld');
      state.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'stateChange',
        source: 'stateChange'
      }));
    });

    it('should emit variableSet event', async () => {
      const handler = vi.fn();
      state.on('variableSet', handler);

      state.setCurrentFilePath('test.meld');
      state.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'variableSet',
        source: 'variableSet'
      }));
    });

    it('should emit nodeAdded event', async () => {
      const handler = vi.fn();
      state.on('nodeAdded', handler);

      const node: TextNode = {
        type: 'Text',
        content: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      state.addNode(node);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'nodeAdded',
        source: 'nodeAdded'
      }));
    });
  });
}); 