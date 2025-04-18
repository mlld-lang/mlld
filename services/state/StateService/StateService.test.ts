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
import {
  VariableType, 
  PathContentType, 
  ICommandDefinition, 
  IFilesystemPathState, 
  IUrlPathState, 
  createTextVariable, 
  createDataVariable, 
  createPathVariable, 
  createCommandVariable, 
  RelativePath, 
  VariableOrigin,
  TextVariable,
  DataVariable,
  IPathVariable,
  CommandVariable,
  MeldVariable
} from '@core/types/index.js';
import { unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient.js';
import type { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory.js';

describe('StateService', () => {
  let state: StateService;
  let mockEventService: IStateEventService;
  let stateFactory: StateFactory;
  let trackingClient: IStateTrackingServiceClient;

  beforeEach(() => {
    mockEventService = mock<IStateEventService>();
    mockEventService.emit = vi.fn();
    
    trackingClient = mock<IStateTrackingServiceClient>();
    stateFactory = new StateFactory();
    const trackingClientFactory: Pick<StateTrackingServiceClientFactory, 'createClient'> = { 
      createClient: vi.fn().mockReturnValue(trackingClient)
    };
    state = new StateService(stateFactory, mockEventService, trackingClientFactory as StateTrackingServiceClientFactory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic functionality', () => {
    it('should set and get text variables', async () => {
      const variable = await state.setVariable(createTextVariable('greeting', 'Hello')) as TextVariable;
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.TEXT);
      expect(variable.name).toBe('greeting');
      expect(variable.value).toBe('Hello');
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);

      const retrieved = state.getVariable('greeting', VariableType.TEXT);
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
    });

    it('should return undefined for non-existent text variables', () => {
      expect(state.getVariable('nonexistent', VariableType.TEXT)).toBeUndefined();
    });

    it('should get all text variables', async () => {
      const greetingVar = await state.setVariable(createTextVariable('greeting', 'Hello'));
      const farewellVar = await state.setVariable(createTextVariable('farewell', 'Goodbye'));

      const vars = state.getAllVariables(VariableType.TEXT);
      expect(vars.size).toBe(2);
      expect(vars.get('greeting')).toEqual(greetingVar);
      expect(vars.get('farewell')).toEqual(farewellVar);
    });

    it('should set and get data variables', async () => {
      const dataValue = { foo: 'bar', nested: { num: 1 } };
      const variable = await state.setVariable(createDataVariable('config', dataValue)) as DataVariable;
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.DATA);
      expect(variable.name).toBe('config');
      expect(variable.value).toEqual(dataValue);
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);

      const retrieved = state.getVariable('config', VariableType.DATA);
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value).toEqual(dataValue);
    });

    it('should set and get path variables (filesystem)', async () => {
      const fsPathValue: IFilesystemPathState = {
        contentType: PathContentType.FILESYSTEM,
        originalValue: './some/path.txt',
        isValidSyntax: true,
        isSecure: true,
        isAbsolute: false,
        validatedPath: unsafeCreateValidatedResourcePath('./some/path.txt') as RelativePath,
        exists: undefined
      };
      const variable = await state.setVariable(createPathVariable('local', fsPathValue)) as IPathVariable;
      
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.PATH);
      expect(variable.name).toBe('local');
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
      expect(variable.value).toEqual(fsPathValue);
      expect(variable.value.contentType).toBe(PathContentType.FILESYSTEM);
      expect((variable.value as IFilesystemPathState).validatedPath).toEqual(fsPathValue.validatedPath);
      
      const retrieved = state.getVariable('local', VariableType.PATH);
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value.contentType).toBe(PathContentType.FILESYSTEM);
    });
    
    it('should set and get path variables (URL)', async () => {
      const urlValue: IUrlPathState = {
        contentType: PathContentType.URL,
        originalValue: 'https://example.com',
        isValidated: true,
        fetchStatus: 'not_fetched',
        validatedPath: unsafeCreateValidatedResourcePath('https://example.com')
      };
      const variable = await state.setVariable(createPathVariable('remote', urlValue)) as IPathVariable;
      
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.PATH);
      expect(variable.name).toBe('remote');
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
      expect(variable.value).toEqual(urlValue);
      expect(variable.value.contentType).toBe(PathContentType.URL);
      expect((variable.value as IUrlPathState).fetchStatus).toBe('not_fetched');
      
      const retrieved = state.getVariable('remote', VariableType.PATH);
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value.contentType).toBe(PathContentType.URL);
    });

    it('should set and get command variables', async () => {
      const commandDef: ICommandDefinition = { 
        type: 'basic',
        command: 'echo "{{msg}}"', 
        parameters: ['msg'] 
      };
      const variable = await state.setVariable(createCommandVariable('echoCmd', commandDef)) as CommandVariable;
      
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.COMMAND);
      expect(variable.name).toBe('echoCmd');
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
      expect(variable.value).toEqual(commandDef);
      expect(variable.value.type).toBe('basic');
      expect(variable.value.command).toBe('echo "{{msg}}"');

      const retrieved = state.getVariable('echoCmd', VariableType.COMMAND);
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value.parameters).toEqual(['msg']);
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

    // Un-skip this test
    it('should emit events for state operations', async () => {
      const emitSpy = vi.spyOn(mockEventService, 'emit');
      
      state.setCurrentFilePath('test.meld');
      
      // Clear mocks *after* potentially triggering calls, before the call under test
      emitSpy.mockClear(); 
      // vi.clearAllMocks(); // Alternative if needed
      
      // Await the async setVariable call
      await state.setVariable(createTextVariable('test', 'value')); 
      
      // Check if the emit spy was called with the expected event object
      expect(emitSpy).toHaveBeenCalledTimes(1); // Check if called at all first
      expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'transform',
        stateId: state.getStateId(), // Check against the actual state ID
        source: 'setVariable:test', 
        location: { file: 'test.meld' }
      }));
      
      // Restore the spy
      emitSpy.mockRestore();
    });

    it('should create child state with inherited properties (typed)', async () => {
      const parentTextVar = await state.setVariable(createTextVariable('parentText', 'value')) as TextVariable;
      const parentDataVar = await state.setVariable(createDataVariable('parentData', { key: 'data' })) as DataVariable;
      const parentPathVar = await state.setVariable(createPathVariable('parentPath', { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './parent', 
        isValidSyntax: true, 
        isSecure: true, 
        isAbsolute: false 
      } as IFilesystemPathState)) as IPathVariable;
      const parentCmdVar = await state.setVariable(createCommandVariable('parentCmd', { type: 'basic', command: 'echo parent' } as ICommandDefinition)) as CommandVariable;
      
      const child = state.createChildState();
      
      expect(child.getVariable('parentText', VariableType.TEXT)).toEqual(parentTextVar);
      expect(child.getVariable('parentData', VariableType.DATA)).toEqual(parentDataVar);
      expect(child.getVariable('parentPath', VariableType.PATH)).toEqual(parentPathVar);
      expect(child.getVariable('parentCmd', VariableType.COMMAND)).toEqual(parentCmdVar);
      
      await child.setVariable(createTextVariable('childText', 'childValue'));
      expect(state.getVariable('childText', VariableType.TEXT)).toBeUndefined();
      await child.setVariable(createTextVariable('parentText', 'newValueInChild'));
      expect(state.getVariable('parentText', VariableType.TEXT)?.value).toBe('value');
    });

    it('should clone state properly (deep copy)', async () => {
      const originalText = await state.setVariable(createTextVariable('originalText', 'value')) as TextVariable;
      const originalData = await state.setVariable(createDataVariable('originalData', { nested: { val: 1 } })) as DataVariable;
      const originalPathValue: IFilesystemPathState = { contentType: PathContentType.FILESYSTEM, originalValue: './orig', isValidSyntax: true, isSecure: true, isAbsolute: false, exists: false };
      const originalPath = await state.setVariable(createPathVariable('originalPath', originalPathValue)) as IPathVariable;
      const originalCmdValue: ICommandDefinition = { type: 'basic', command: 'echo orig', parameters: ['a'] };
      const originalCmd = await state.setVariable(createCommandVariable('originalCmd', originalCmdValue)) as CommandVariable;
      state.setTransformationEnabled(true);
      state.setTransformationOptions({ enabled: true, preserveOriginal: false, transformNested: false});
      
      const clone = state.clone();
      
      expect(clone).toBeInstanceOf(StateService);
      expect(clone.getStateId()).not.toBe(state.getStateId());
      expect(clone.isTransformationEnabled()).toBe(true);
      expect(clone.getTransformationOptions()).toEqual({ enabled: true, preserveOriginal: false, transformNested: false});
      
      expect(clone.getVariable('originalText', VariableType.TEXT)).toEqual(originalText);
      expect(clone.getVariable('originalData', VariableType.DATA)).toEqual(originalData);
      expect(clone.getVariable('originalPath', VariableType.PATH)).toEqual(originalPath);
      expect(clone.getVariable('originalCmd', VariableType.COMMAND)).toEqual(originalCmd);
      
      await clone.setVariable(createTextVariable('originalText', 'clonedValue'));
      expect(state.getVariable('originalText', VariableType.TEXT)?.value).toBe('value');
      
      const clonedDataVar = clone.getVariable('originalData', VariableType.DATA) as DataVariable;
      expect(clonedDataVar).toBeDefined();
      (clonedDataVar?.value as any).nested.val = 2;
      expect((state.getVariable('originalData', VariableType.DATA)?.value as any).nested.val).toBe(1);
      
      const clonedPathVar = clone.getVariable('originalPath', VariableType.PATH) as IPathVariable;
      expect(clonedPathVar).toBeDefined();
      (clonedPathVar?.value as IFilesystemPathState).originalValue = './cloned';
      (clonedPathVar?.value as IFilesystemPathState).exists = true;
      const originalPathCheck = state.getVariable('originalPath', VariableType.PATH) as IPathVariable;
      expect((originalPathCheck?.value as IFilesystemPathState).originalValue).toBe('./orig');
      expect((originalPathCheck?.value as IFilesystemPathState).exists).toBe(false);
      expect((clonedPathVar?.value as IFilesystemPathState).originalValue).toBe('./cloned');
      expect((clonedPathVar?.value as IFilesystemPathState).exists).toBe(true);
      
      const clonedCmdVar = clone.getVariable('originalCmd', VariableType.COMMAND) as CommandVariable;
      expect(clonedCmdVar).toBeDefined();
      (clonedCmdVar?.value as ICommandDefinition).command = 'echo cloned';
      (clonedCmdVar?.value as ICommandDefinition).parameters?.push('b');
      const originalCmdCheck = state.getVariable('originalCmd', VariableType.COMMAND) as CommandVariable;
      expect((originalCmdCheck?.value as ICommandDefinition).command).toBe('echo orig');
      expect((originalCmdCheck?.value as ICommandDefinition).parameters).toEqual(['a']);
      expect((clonedCmdVar?.value as ICommandDefinition).command).toBe('echo cloned');
      expect((clonedCmdVar?.value as ICommandDefinition).parameters).toEqual(['a', 'b']);

      await clone.setVariable(createTextVariable('newInClone', 'onlyInClone'));
      expect(state.getVariable('newInClone', VariableType.TEXT)).toBeUndefined();
      expect(clone.getVariable('newInClone', VariableType.TEXT)?.value).toBe('onlyInClone');
    });
  });
  
  describe('Generic Variable Methods', () => {
    let textVar: TextVariable;
    let dataVar: DataVariable;
    let pathVar: IPathVariable;
    let cmdVar: CommandVariable;

    beforeEach(async () => {
      textVar = await state.setVariable(createTextVariable('myText', 'text val')) as TextVariable;
      dataVar = await state.setVariable(createDataVariable('myData', { key: 'data val' })) as DataVariable;
      const pathValue: IFilesystemPathState = { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './path', 
        isValidSyntax: true, 
        isSecure: true,
        isAbsolute: false
      };
      pathVar = await state.setVariable(createPathVariable('myPath', pathValue)) as IPathVariable;
      const cmdValue: ICommandDefinition = { type: 'basic', command: 'echo cmd' };
      cmdVar = await state.setVariable(createCommandVariable('myCmd', cmdValue)) as CommandVariable;
    });

    it('getVariable should retrieve variable by name, checking types in order (default)', () => {
      expect(state.getVariable('myText')).toEqual(textVar);
      expect(state.getVariable('myData')).toEqual(dataVar);
      expect(state.getVariable('myPath')).toEqual(pathVar);
      expect(state.getVariable('myCmd')).toEqual(cmdVar);
      expect(state.getVariable('nonExistent')).toBeUndefined();
    });

    it('getVariable should retrieve variable by name and specific type', () => {
      expect(state.getVariable('myText', VariableType.TEXT)).toEqual(textVar);
      expect(state.getVariable('myText', VariableType.DATA)).toBeUndefined();
      expect(state.getVariable('myData', VariableType.DATA)).toEqual(dataVar);
      expect(state.getVariable('myData', VariableType.PATH)).toBeUndefined();
      expect(state.getVariable('myPath', VariableType.PATH)).toEqual(pathVar);
      expect(state.getVariable('myCmd', VariableType.COMMAND)).toEqual(cmdVar);
    });

    it('setVariable should store variables correctly based on type', async () => {
      expect(state.getVariable('myText', VariableType.TEXT)).toEqual(textVar);
      expect(state.getVariable('myData', VariableType.DATA)).toEqual(dataVar);
      expect(state.getVariable('myPath', VariableType.PATH)).toEqual(pathVar);
      expect(state.getVariable('myCmd', VariableType.COMMAND)).toEqual(cmdVar);

      const newVar = createTextVariable('another', 'val');
      const setResult = await state.setVariable(newVar);
      expect(setResult).toEqual(newVar);
      expect(state.getVariable('another', VariableType.TEXT)).toEqual(newVar);
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

    it('removeVariable should remove variable by name (any type found first)', async () => {
      expect(await state.removeVariable('myText')).toBe(true);
      expect(state.hasVariable('myText')).toBe(false);
      expect(await state.removeVariable('myData')).toBe(true);
      expect(state.hasVariable('myData')).toBe(false);
      expect(await state.removeVariable('myPath')).toBe(true);
      expect(state.hasVariable('myPath')).toBe(false);
      expect(await state.removeVariable('myCmd')).toBe(true);
      expect(state.hasVariable('myCmd')).toBe(false);
      expect(await state.removeVariable('nonExistent')).toBe(false);
    });

    it('removeVariable should remove variable by name and specific type', async () => {
      expect(await state.removeVariable('myText', VariableType.DATA)).toBe(false);
      expect(state.hasVariable('myText', VariableType.TEXT)).toBe(true);
      expect(await state.removeVariable('myText', VariableType.TEXT)).toBe(true);
      expect(state.hasVariable('myText', VariableType.TEXT)).toBe(false);
      expect(await state.removeVariable('myData', VariableType.DATA)).toBe(true);
      expect(state.hasVariable('myData', VariableType.DATA)).toBe(false);
    });
  });
  
  describe('Node management', () => {
    it('should handle empty nodes array', () => {
      expect(state.getNodes()).toEqual([]);
    });
  });
  
  describe('Immutability', () => {
    it('should be mutable by default', () => {
      expect(state.isImmutable).toBe(false);
    });

    it('should become immutable when setImmutable is called', () => {
      state.setImmutable();
      expect(state.isImmutable).toBe(true);
    });

    it('should throw error on modification attempts when immutable', async () => {
      state.setImmutable();
      await expect(state.setVariable(createTextVariable('test', 'value'))).rejects.toThrow('Cannot modify immutable state');
    });
  });
  
  describe('Cloning and Merging', () => {
    it('should clone the current state', () => {
      const cloned = state.clone();
      expect(cloned).toBeInstanceOf(StateService);
      expect(cloned.getStateId()).not.toBe(state.getStateId());
      expect(cloned.getParentServiceRef()).toBeUndefined();
    });

    it('should create a child state inheriting variables', async () => {
      const parentTextVar = await state.setVariable(createTextVariable('parentText', 'value'));
      const parentDataVar = await state.setVariable(createDataVariable('parentData', { key: 'data' }));
      const parentPathVar = await state.setVariable(createPathVariable('parentPath', { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './parent', 
        isValidSyntax: true, 
        isSecure: true, 
        isAbsolute: false 
      } as IFilesystemPathState));
      const parentCmdVar = await state.setVariable(createCommandVariable('parentCmd', { type: 'basic', command: 'echo parent' } as ICommandDefinition));
      
      const child = state.createChildState();
      
      expect(child.getVariable('parentText', VariableType.TEXT)).toEqual(parentTextVar);
      expect(child.getVariable('parentData', VariableType.DATA)).toEqual(parentDataVar);
      expect(child.getVariable('parentPath', VariableType.PATH)).toEqual(parentPathVar);
      expect(child.getVariable('parentCmd', VariableType.COMMAND)).toEqual(parentCmdVar);
      
      await child.setVariable(createTextVariable('childText', 'childValue'));
      expect(state.getVariable('childText', VariableType.TEXT)).toBeUndefined();
      await child.setVariable(createTextVariable('parentText', 'newValueInChild'));
      expect(state.getVariable('parentText', VariableType.TEXT)?.value).toBe('value');
    });

    it('should merge variables from child state', async () => {
      const childState = state.createChildState();
      await childState.setVariable(createTextVariable('childVar', 'childValue'));
      vi.clearAllMocks();
      await state.mergeChildState(childState);
      expect(trackingClient.registerRelationship).toHaveBeenCalledTimes(1);
      expect(trackingClient.registerRelationship).toHaveBeenCalledWith(
        expect.objectContaining({ 
            sourceId: state.getStateId(), 
            targetId: childState.getStateId(), 
            type: 'merge-source' 
        })
      );
      expect(state.getVariable('childVar', VariableType.TEXT)?.value).toBe('childValue');
    });

    it('should overwrite existing parent variables and add new child variables on merge', async () => {
      // Test Setup: Parent has 'parentVar', Child adds 'childVar' and overwrites 'parentVar'
      await state.setVariable(createTextVariable('parentVar', 'parentOriginal'));
      const childState = state.createChildState();
      await childState.setVariable(createTextVariable('childVar', 'childValue'));
      await childState.setVariable(createTextVariable('parentVar', 'childOverwritesParent'));
      
      // Action: Merge child into parent
      await state.mergeChildState(childState);
      
      // Assertions: Check parent state after merge
      const childVarAfterMerge = state.getVariable('childVar', VariableType.TEXT);
      expect(childVarAfterMerge).toBeDefined();
      expect(childVarAfterMerge?.value).toBe('childValue'); // Child-only variable should now exist

      const parentVarAfterMerge = state.getVariable('parentVar', VariableType.TEXT);
      expect(parentVarAfterMerge).toBeDefined();
      expect(parentVarAfterMerge?.value).toBe('childOverwritesParent'); // Parent variable should be overwritten
    });
  });

  describe('State Tracking', () => {
    it('should track merge relationships via client', async () => {
      const childState = state.createChildState();
      await childState.setVariable(createTextVariable('childVar', 'childValue'));
      vi.clearAllMocks();
      await state.mergeChildState(childState);
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
}); 