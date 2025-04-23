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
import { container, type DependencyContainer } from 'tsyringe'; // Import DI container

// Import Services and Interfaces
import { StateService } from '@services/state/StateService/StateService';
import type { IStateService } from '@services/state/StateService/IStateService';
import { StateFactory } from '@services/state/StateService/StateFactory';
import type { IStateFactory } from '@services/state/StateService/types';
import type { IStateEventService, StateEvent } from '@services/state/StateEventService/IStateEventService';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient';
import type { IStateTrackingService, StateMetadata } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';

// Other necessary types
import type { MeldNode, TextNode } from '@core/syntax/types/index';
import {
  VariableType, 
  PathContentType, 
  type ICommandDefinition, 
  type IFilesystemPathState, 
  type IUrlPathState, 
  createTextVariable, 
  createDataVariable, 
  createPathVariable, 
  createCommandVariable, 
  type RelativePath, 
  VariableOrigin,
  type TextVariable,
  type DataVariable,
  type IPathVariable,
  type CommandVariable,
  type MeldVariable,
  type ICommandParameterMetadata,
  type IBasicCommandDefinition
} from '@core/types/index';
import { unsafeCreateValidatedResourcePath } from '@core/types/paths';


describe('StateService', () => {
  let testContainer: DependencyContainer;
  let stateService: IStateService; // Service under test
  let mockEventService: IStateEventService;
  let mockTrackingClient: IStateTrackingServiceClient;
  let mockTrackingClientFactory: StateTrackingServiceClientFactory;
  let mockTrackingService: IStateTrackingService;

  beforeEach(() => {
    testContainer = container.createChildContainer();

    // --- Create Mocks ---
    // Mock Event Service (Manual Object)
    mockEventService = {
        emit: vi.fn(),
        // Add other methods from IStateEventService if they are ever called directly in tests
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
    } as unknown as IStateEventService; // Cast necessary for type checking

    // Mock Tracking Client (Manual Object)
    mockTrackingClient = {
        registerState: vi.fn(),
        registerRelationship: vi.fn(),
        // Add other methods if needed by tests
        getStateHistory: vi.fn(),
        getStateRelationships: vi.fn(),
        generateReport: vi.fn(),
        getRelationshipGraph: vi.fn(),
    } as unknown as IStateTrackingServiceClient; // Cast necessary

    // Mock Tracking Service (Manual Object)
    mockTrackingService = {
        registerState: vi.fn(),
        registerRelationship: vi.fn(),
        addRelationship: vi.fn(),
        getStateLineage: vi.fn().mockReturnValue([]),
        getStateDescendants: vi.fn().mockReturnValue([]),
        getAllStates: vi.fn().mockReturnValue([]),
        getStateMetadata: vi.fn(),
        trackContextBoundary: vi.fn(),
        trackVariableCrossing: vi.fn(),
        getContextBoundaries: vi.fn().mockReturnValue([]),
        getVariableCrossings: vi.fn().mockReturnValue([]),
        getContextHierarchy: vi.fn().mockReturnValue({
            rootStateId: '',
            states: [],
            boundaries: [],
            variableCrossings: []
        })
    } as unknown as IStateTrackingService;

    // Mock Tracking Client Factory (Manual Object returning the manual client)
    mockTrackingClientFactory = {
        createClient: vi.fn().mockReturnValue(mockTrackingClient),
        trackingService: mockTrackingService
    } as unknown as StateTrackingServiceClientFactory; // Cast as factory type

    // --- Register Dependencies ---
    // Register Mocks
    testContainer.registerInstance<IStateEventService>('IStateEventService', mockEventService);
    testContainer.registerInstance<IStateTrackingService>('IStateTrackingService', mockTrackingService);
    testContainer.registerInstance<StateTrackingServiceClientFactory>(StateTrackingServiceClientFactory, mockTrackingClientFactory);

    // Register ParentStateServiceForChild using a factory returning null
    testContainer.register<IStateService | null>('ParentStateServiceForChild', { 
        useFactory: () => null 
    });

    // Register Real Implementations
    testContainer.register<IStateFactory>('IStateFactory', { useClass: StateFactory });
    testContainer.register<IStateService>('IStateService', { useClass: StateService });

    // --> ADDED: Register the container itself <--
    testContainer.registerInstance<DependencyContainer>('DependencyContainer', testContainer); 

    // --- Resolve Service Under Test ---
    stateService = testContainer.resolve<IStateService>('IStateService');

    // Verify factory was called during StateService construction
    expect(mockTrackingClientFactory.createClient).toHaveBeenCalledTimes(1);
    // Verify the tracking client registered the initial state creation
    expect(mockTrackingClient.registerState).toHaveBeenCalledTimes(1);
    expect(mockTrackingClient.registerState).toHaveBeenCalledWith(
        expect.objectContaining({
            id: stateService.getStateId(),
            parentId: undefined,
            source: 'new',
            transformationEnabled: false
        })
    );
    // Clear the initial registerState call before tests run
    (mockTrackingClient.registerState as any).mockClear();
  });

  afterEach(() => {
    testContainer?.dispose();
    vi.restoreAllMocks();
  });

  // --- Tests ---
  // Replace `state.` with `stateService.`
  // Replace direct use of `mockEventService`, `trackingClient` with the mocked instances
  // `mockEventService` and `mockTrackingClient` respectively.

  describe('Basic functionality', () => {
    it('should set and get text variables', async () => {
      // Use stateService resolved from container
      const variable = await stateService.setVariable(createTextVariable('greeting', 'Hello')) as TextVariable;
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.TEXT);
      expect(variable.name).toBe('greeting');
      expect(variable.value).toBe('Hello');
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);

      const retrieved = stateService.getVariable('greeting', VariableType.TEXT);
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
    });

    it('should return undefined for non-existent text variables', () => {
      expect(stateService.getVariable('nonexistent', VariableType.TEXT)).toBeUndefined();
    });

    it('should get all text variables - check individually', async () => {
      const greetingVar = await stateService.setVariable(createTextVariable('greeting', 'Hello'));
      const farewellVar = await stateService.setVariable(createTextVariable('farewell', 'Goodbye'));

      // Check individually using getVariable
      const retrievedGreeting = stateService.getVariable('greeting', VariableType.TEXT);
      const retrievedFarewell = stateService.getVariable('farewell', VariableType.TEXT);
      const retrievedNonExistent = stateService.getVariable('nonexistent', VariableType.TEXT);

      expect(retrievedGreeting).toEqual(greetingVar);
      expect(retrievedFarewell).toEqual(farewellVar);
      expect(retrievedNonExistent).toBeUndefined();
      
      // Optionally, check internal map if really needed (less ideal for testing public interface)
      // const internalNode = state.getInternalStateNode();
      // expect(internalNode.variables.text.size).toBe(2);
      // expect(internalNode.variables.text.get('greeting')).toEqual(greetingVar);
    });

    it('should set and get data variables', async () => {
      const dataValue = { foo: 'bar', nested: { num: 1 } };
      const variable = await stateService.setVariable(createDataVariable('config', dataValue)) as DataVariable;
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.DATA);
      expect(variable.name).toBe('config');
      expect(variable.value).toEqual(dataValue);
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);

      const retrieved = stateService.getVariable('config', VariableType.DATA);
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
      const variable = await stateService.setVariable(createPathVariable('local', fsPathValue)) as IPathVariable;
      
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.PATH);
      expect(variable.name).toBe('local');
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
      expect(variable.value).toEqual(fsPathValue);
      expect(variable.value.contentType).toBe(PathContentType.FILESYSTEM);
      expect((variable.value as IFilesystemPathState).validatedPath).toEqual(fsPathValue.validatedPath);
      
      const retrieved = stateService.getVariable('local', VariableType.PATH) as IPathVariable;
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
      const variable = await stateService.setVariable(createPathVariable('remote', urlValue)) as IPathVariable;
      
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.PATH);
      expect(variable.name).toBe('remote');
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
      expect(variable.value).toEqual(urlValue);
      expect(variable.value.contentType).toBe(PathContentType.URL);
      expect((variable.value as IUrlPathState).fetchStatus).toBe('not_fetched');
      
      const retrieved = stateService.getVariable('remote', VariableType.PATH) as IPathVariable;
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value.contentType).toBe(PathContentType.URL);
    });

    it('should set and get command variables', async () => {
      const params: ICommandParameterMetadata[] = [{ name: 'msg', position: 0 }];
      const commandDef: IBasicCommandDefinition = { 
        type: 'basic',
        name: 'echoCmd',
        commandTemplate: 'echo "{{msg}}"',
        parameters: params,
        isMultiline: false
      };
      const variable = await stateService.setVariable(createCommandVariable('echoCmd', commandDef)) as CommandVariable;
      
      expect(variable).toBeInstanceOf(Object);
      expect(variable.type).toBe(VariableType.COMMAND);
      expect(variable.name).toBe('echoCmd');
      expect(variable.metadata).toBeDefined();
      expect(variable.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
      expect(variable.value).toEqual(commandDef);
      expect((variable.value as IBasicCommandDefinition).type).toBe('basic');
      expect((variable.value as IBasicCommandDefinition).commandTemplate).toBe('echo "{{msg}}"');

      const retrieved = stateService.getVariable('echoCmd', VariableType.COMMAND) as CommandVariable;
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect((retrieved?.value as IBasicCommandDefinition).parameters).toEqual(params);
    });

    it('should add and get nodes', () => {
      const node: TextNode = {
        nodeId: 'test-text-node',
        type: 'Text',
        content: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      stateService.addNode(node);
      expect(stateService.getNodes()).toEqual([node]);
    });

    it('should add and check imports', () => {
      stateService.addImport('test.md');
      expect(stateService.hasImport('test.md')).toBe(true);
    });

    // Un-skip this test
    it('should emit events for state operations', async () => {
      // Spy is no longer needed here as mockEventService.emit is already a vi.fn()
      // const emitSpy = vi.spyOn(mockEventService, 'emit'); // REMOVE

      stateService.setCurrentFilePath('test.meld');

      // Clear the mock function directly
      (mockEventService.emit as any).mockClear();

      await stateService.setVariable(createTextVariable('test', 'value')); 

      // Check the mock function directly
      expect(mockEventService.emit).toHaveBeenCalledTimes(1);
      expect(mockEventService.emit).toHaveBeenCalledWith(expect.objectContaining({
        type: 'transform',
        stateId: stateService.getStateId(), // Check against the actual state ID
        source: 'setVariable:test', 
        location: { file: 'test.meld' }
      }));
      
      // No need to restore here, afterEach handles it
    });

    it('should create child state with inherited properties (typed)', async () => {
      const parentTextVar = await stateService.setVariable(createTextVariable('parentText', 'value')) as TextVariable;
      const parentDataVar = await stateService.setVariable(createDataVariable('parentData', { key: 'data' })) as DataVariable;
      const parentPathVar = await stateService.setVariable(createPathVariable('parentPath', { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './parent', 
        isValidSyntax: true, 
        isSecure: true, 
        isAbsolute: false 
      } as IFilesystemPathState)) as IPathVariable;
      const parentCmdDef: IBasicCommandDefinition = { type: 'basic', name: 'parentCmd', commandTemplate: 'echo parent', parameters: [], isMultiline: false };
      const parentCmdVar = await stateService.setVariable(createCommandVariable('parentCmd', parentCmdDef)) as CommandVariable;
      
      const child = stateService.createChildState();
      
      expect(child.getVariable('parentText', VariableType.TEXT)).toEqual(parentTextVar);
      expect(child.getVariable('parentData', VariableType.DATA)).toEqual(parentDataVar);
      expect(child.getVariable('parentPath', VariableType.PATH)).toEqual(parentPathVar);
      expect(child.getVariable('parentCmd', VariableType.COMMAND)).toEqual(parentCmdVar);
      
      await child.setVariable(createTextVariable('childText', 'childValue'));
      expect(stateService.getVariable('childText', VariableType.TEXT)).toBeUndefined();
      await child.setVariable(createTextVariable('parentText', 'newValueInChild'));
      expect(stateService.getVariable('parentText', VariableType.TEXT)?.value).toBe('value');
    });

    it('should clone state properly (deep copy)', async () => {
      const originalText = await stateService.setVariable(createTextVariable('originalText', 'value')) as TextVariable;
      const originalData = await stateService.setVariable(createDataVariable('originalData', { nested: { val: 1 } })) as DataVariable;
      const originalPathValue: IFilesystemPathState = { contentType: PathContentType.FILESYSTEM, originalValue: './orig', isValidSyntax: true, isSecure: true, isAbsolute: false, exists: false };
      const originalPath = await stateService.setVariable(createPathVariable('originalPath', originalPathValue)) as IPathVariable;
      const originalParams: ICommandParameterMetadata[] = [{ name: 'a', position: 0 }];
      const originalCmdValue: IBasicCommandDefinition = { type: 'basic', name: 'originalCmd', commandTemplate: 'echo orig', parameters: originalParams, isMultiline: false };
      const originalCmd = await stateService.setVariable(createCommandVariable('originalCmd', originalCmdValue)) as CommandVariable;
      stateService.setTransformationEnabled(true);
      stateService.setTransformationOptions({ enabled: true, preserveOriginal: false, transformNested: false});
      
      const clone = stateService.clone();
      
      expect(clone).toBeInstanceOf(StateService);
      expect(clone.getStateId()).not.toBe(stateService.getStateId());
      expect(clone.isTransformationEnabled()).toBe(true);
      expect(clone.getTransformationOptions()).toEqual({ enabled: true, preserveOriginal: false, transformNested: false});
      
      expect(clone.getVariable('originalText', VariableType.TEXT)).toEqual(originalText);
      expect(clone.getVariable('originalData', VariableType.DATA)).toEqual(originalData);
      expect(clone.getVariable('originalPath', VariableType.PATH)).toEqual(originalPath);
      expect(clone.getVariable('originalCmd', VariableType.COMMAND)).toEqual(originalCmd);
      
      await clone.setVariable(createTextVariable('originalText', 'clonedValue'));
      expect(stateService.getVariable('originalText', VariableType.TEXT)?.value).toBe('value');
      
      const clonedDataVar = clone.getVariable('originalData', VariableType.DATA) as DataVariable;
      expect(clonedDataVar).toBeDefined();
      (clonedDataVar?.value as any).nested.val = 2;
      expect((stateService.getVariable('originalData', VariableType.DATA)?.value as any).nested.val).toBe(1);
      
      const clonedPathVar = clone.getVariable('originalPath', VariableType.PATH) as IPathVariable;
      expect(clonedPathVar).toBeDefined();
      (clonedPathVar?.value as IFilesystemPathState).originalValue = './cloned';
      (clonedPathVar?.value as IFilesystemPathState).exists = true;
      const originalPathCheck = stateService.getVariable('originalPath', VariableType.PATH) as IPathVariable;
      expect((originalPathCheck?.value as IFilesystemPathState).originalValue).toBe('./orig');
      expect((originalPathCheck?.value as IFilesystemPathState).exists).toBe(false);
      expect((clonedPathVar?.value as IFilesystemPathState).originalValue).toBe('./cloned');
      expect((clonedPathVar?.value as IFilesystemPathState).exists).toBe(true);
      
      const clonedCmdVar = clone.getVariable('originalCmd', VariableType.COMMAND) as CommandVariable;
      expect(clonedCmdVar).toBeDefined();
      const clonedCmdValue = clonedCmdVar?.value as IBasicCommandDefinition; 
      clonedCmdValue.commandTemplate = 'echo cloned';
      clonedCmdValue.parameters?.push({ name: 'b', position: 1 });
      const originalCmdCheck = stateService.getVariable('originalCmd', VariableType.COMMAND) as CommandVariable;
      const originalCmdCheckValue = originalCmdCheck?.value as IBasicCommandDefinition;
      expect(originalCmdCheckValue.commandTemplate).toBe('echo orig');
      expect(originalCmdCheckValue.parameters).toEqual(originalParams);
      expect(clonedCmdValue.commandTemplate).toBe('echo cloned');
      expect(clonedCmdValue.parameters?.map(p => p.name)).toEqual(['a', 'b']);

      await clone.setVariable(createTextVariable('newInClone', 'onlyInClone'));
      expect(stateService.getVariable('newInClone', VariableType.TEXT)).toBeUndefined();
      expect(clone.getVariable('newInClone', VariableType.TEXT)?.value).toBe('onlyInClone');
    });
  });
  
  describe('Generic Variable Methods', () => {
    let textVar: TextVariable;
    let dataVar: DataVariable;
    let pathVar: IPathVariable;
    let cmdVar: CommandVariable;

    beforeEach(async () => {
      textVar = await stateService.setVariable(createTextVariable('myText', 'text val')) as TextVariable;
      dataVar = await stateService.setVariable(createDataVariable('myData', { key: 'data val' })) as DataVariable;
      const pathValue: IFilesystemPathState = { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './path', 
        isValidSyntax: true, 
        isSecure: true,
        isAbsolute: false
      };
      pathVar = await stateService.setVariable(createPathVariable('myPath', pathValue)) as IPathVariable;
      const cmdValue: IBasicCommandDefinition = { type: 'basic', name: 'myCmd', commandTemplate: 'echo cmd', parameters: [], isMultiline: false };
      cmdVar = await stateService.setVariable(createCommandVariable('myCmd', cmdValue)) as CommandVariable;
    });

    it('getVariable should retrieve variable by name, checking types in order (default)', () => {
      expect(stateService.getVariable('myText')).toEqual(textVar);
      expect(stateService.getVariable('myData')).toEqual(dataVar);
      expect(stateService.getVariable('myPath')).toEqual(pathVar);
      expect(stateService.getVariable('myCmd')).toEqual(cmdVar);
      expect(stateService.getVariable('nonExistent')).toBeUndefined();
    });

    it('getVariable should retrieve variable by name and specific type', () => {
      expect(stateService.getVariable('myText', VariableType.TEXT)).toEqual(textVar);
      expect(stateService.getVariable('myText', VariableType.DATA)).toBeUndefined();
      expect(stateService.getVariable('myData', VariableType.DATA)).toEqual(dataVar);
      expect(stateService.getVariable('myData', VariableType.PATH)).toBeUndefined();
      expect(stateService.getVariable('myPath', VariableType.PATH)).toEqual(pathVar);
      expect(stateService.getVariable('myCmd', VariableType.COMMAND)).toEqual(cmdVar);
    });

    it('setVariable should store variables correctly based on type', async () => {
      expect(stateService.getVariable('myText', VariableType.TEXT)).toEqual(textVar);
      expect(stateService.getVariable('myData', VariableType.DATA)).toEqual(dataVar);
      expect(stateService.getVariable('myPath', VariableType.PATH)).toEqual(pathVar);
      expect(stateService.getVariable('myCmd', VariableType.COMMAND)).toEqual(cmdVar);

      const newVar = createTextVariable('another', 'val');
      const setResult = await stateService.setVariable(newVar);
      expect(setResult).toEqual(newVar);
      expect(stateService.getVariable('another', VariableType.TEXT)).toEqual(newVar);
    });

    it('hasVariable should check existence by name', () => {
      expect(stateService.hasVariable('myText')).toBe(true);
      expect(stateService.hasVariable('myData')).toBe(true);
      expect(stateService.hasVariable('myPath')).toBe(true);
      expect(stateService.hasVariable('myCmd')).toBe(true);
      expect(stateService.hasVariable('nonExistent')).toBe(false);
    });

    it('hasVariable should check existence by name and specific type', () => {
      expect(stateService.hasVariable('myText', VariableType.TEXT)).toBe(true);
      expect(stateService.hasVariable('myText', VariableType.DATA)).toBe(false);
      expect(stateService.hasVariable('myData', VariableType.DATA)).toBe(true);
      expect(stateService.hasVariable('myPath', VariableType.PATH)).toBe(true);
      expect(stateService.hasVariable('myCmd', VariableType.COMMAND)).toBe(true);
    });

    it('removeVariable should remove variable by name (any type found first)', async () => {
      expect(await stateService.removeVariable('myText')).toBe(true);
      expect(stateService.hasVariable('myText')).toBe(false);
      expect(await stateService.removeVariable('myData')).toBe(true);
      expect(stateService.hasVariable('myData')).toBe(false);
      expect(await stateService.removeVariable('myPath')).toBe(true);
      expect(stateService.hasVariable('myPath')).toBe(false);
      expect(await stateService.removeVariable('myCmd')).toBe(true);
      expect(stateService.hasVariable('myCmd')).toBe(false);
      expect(await stateService.removeVariable('nonExistent')).toBe(false);
    });

    it('removeVariable should remove variable by name and specific type', async () => {
      expect(await stateService.removeVariable('myText', VariableType.DATA)).toBe(false);
      expect(stateService.hasVariable('myText', VariableType.TEXT)).toBe(true);
      expect(await stateService.removeVariable('myText', VariableType.TEXT)).toBe(true);
      expect(stateService.hasVariable('myText', VariableType.TEXT)).toBe(false);
      expect(await stateService.removeVariable('myData', VariableType.DATA)).toBe(true);
      expect(stateService.hasVariable('myData', VariableType.DATA)).toBe(false);
    });
  });
  
  describe('Node management', () => {
    it('should handle empty nodes array', () => {
      expect(stateService.getNodes()).toEqual([]);
    });
  });
  
  describe('Immutability', () => {
    it('should be mutable by default', () => {
      expect(stateService.isImmutable).toBe(false);
    });

    it('should become immutable when setImmutable is called', () => {
      stateService.setImmutable();
      expect(stateService.isImmutable).toBe(true);
    });

    it('should throw error on modification attempts when immutable', async () => {
      stateService.setImmutable();
      await expect(stateService.setVariable(createTextVariable('test', 'value'))).rejects.toThrow('Cannot modify immutable state');
    });
  });
  
  describe('Cloning and Merging', () => {
    it('should clone the current state', () => {
      const cloned = stateService.clone();
      expect(cloned).toBeInstanceOf(StateService);
      expect(cloned.getStateId()).not.toBe(stateService.getStateId());
      expect(cloned.getParentState()).toBeUndefined();
    });

    it('should create a child state inheriting variables', async () => {
      const parentTextVar = await stateService.setVariable(createTextVariable('parentText', 'value'));
      const parentDataVar = await stateService.setVariable(createDataVariable('parentData', { key: 'data' }));
      const parentPathVar = await stateService.setVariable(createPathVariable('parentPath', { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './parent', 
        isValidSyntax: true, 
        isSecure: true, 
        isAbsolute: false 
      } as IFilesystemPathState)) as IPathVariable;
      const parentCmdDef: IBasicCommandDefinition = { type: 'basic', name: 'parentCmd', commandTemplate: 'echo parent', parameters: [], isMultiline: false };
      const parentCmdVar = await stateService.setVariable(createCommandVariable('parentCmd', parentCmdDef));
      
      const child = stateService.createChildState();
      
      expect(child.getVariable('parentText', VariableType.TEXT)).toEqual(parentTextVar);
      expect(child.getVariable('parentData', VariableType.DATA)).toEqual(parentDataVar);
      expect(child.getVariable('parentPath', VariableType.PATH)).toEqual(parentPathVar);
      expect(child.getVariable('parentCmd', VariableType.COMMAND)).toEqual(parentCmdVar);
      
      await child.setVariable(createTextVariable('childText', 'childValue'));
      expect(stateService.getVariable('childText', VariableType.TEXT)).toBeUndefined();
      await child.setVariable(createTextVariable('parentText', 'newValueInChild'));
      expect(stateService.getVariable('parentText', VariableType.TEXT)?.value).toBe('value');
    });

    it('should merge variables from child state', async () => {
      const childState = stateService.createChildState();
      await childState.setVariable(createTextVariable('childVar', 'childValue'));

      // Clear the mock function directly before the call
      (mockTrackingClient.registerRelationship as any).mockClear();

      await stateService.mergeChildState(childState);

      // Check the mock function directly
      expect(mockTrackingClient.registerRelationship).toHaveBeenCalledTimes(1);
      expect(mockTrackingClient.registerRelationship).toHaveBeenCalledWith(
        expect.objectContaining({
            sourceId: stateService.getStateId(), 
            targetId: childState.getStateId(), 
            type: 'merge-source' 
        })
      );
      expect(stateService.getVariable('childVar', VariableType.TEXT)?.value).toBe('childValue');
    });

    it('should overwrite existing parent variables and add new child variables on merge', async () => {
      // Test Setup: Parent has 'parentVar', Child adds 'childVar' and overwrites 'parentVar'
      await stateService.setVariable(createTextVariable('parentVar', 'parentOriginal'));
      const childState = stateService.createChildState();
      await childState.setVariable(createTextVariable('childVar', 'childValue'));
      await childState.setVariable(createTextVariable('parentVar', 'childOverwritesParent'));
      
      // Action: Merge child into parent
      await stateService.mergeChildState(childState);
      
      // Assertions: Check parent state after merge
      const childVarAfterMerge = stateService.getVariable('childVar', VariableType.TEXT);
      expect(childVarAfterMerge).toBeDefined();
      expect(childVarAfterMerge?.value).toBe('childValue'); // Child-only variable should now exist

      const parentVarAfterMerge = stateService.getVariable('parentVar', VariableType.TEXT);
      expect(parentVarAfterMerge).toBeDefined();
      expect(parentVarAfterMerge?.value).toBe('childOverwritesParent'); // Parent variable should be overwritten
    });
  });

  describe('State Tracking', () => {
    it('should track merge relationships via client', async () => {
      const childState = stateService.createChildState();
      await childState.setVariable(createTextVariable('childVar', 'childValue'));

      // Clear the mock function directly before the call
      (mockTrackingClient.registerRelationship as any).mockClear();

      await stateService.mergeChildState(childState);
      expect(mockTrackingClient.registerRelationship).toHaveBeenCalledTimes(1);
      expect(mockTrackingClient.registerRelationship).toHaveBeenCalledWith(
        expect.objectContaining({ 
            sourceId: stateService.getStateId(), 
            targetId: childState.getStateId(), 
            type: 'merge-source' 
        })
      );
    });

    // Add tests for create and clone tracking if necessary
    it('should track creation via client', () => {
      // The check for the initial create call is moved to beforeEach
      // This test now verifies that *no additional* create calls happened
      expect(mockTrackingClient.registerState).toHaveBeenCalledTimes(0); // Should be 0 after mockClear in beforeEach
    });

    it('should track clone relationships via client', async () => {
        await stateService.setVariable(createTextVariable('originalText', 'value'));

        // Clear the mock function directly before the call
        (mockTrackingClient.registerRelationship as any).mockClear();

        const clone = stateService.clone();

        // Check the mock function directly
        expect(mockTrackingClient.registerRelationship).toHaveBeenCalledTimes(1);
        expect(mockTrackingClient.registerRelationship).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceId: stateService.getStateId(),
                targetId: clone.getStateId(),
                type: 'clone-original'
            })
        );
    });

    it('should track child state creation relationships via client', async () => {
        const child = stateService.createChildState();
        
        // Verification happens in the beforeEach of the next test block, 
        // but we need to assert the relationship registration here
        // Check the mock function directly
        expect(mockTrackingClient.registerRelationship).toHaveBeenCalledTimes(1);
        expect(mockTrackingClient.registerRelationship).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceId: stateService.getStateId(),
                targetId: child.getStateId(),
                type: 'parent-child'
            })
        );
    });
  });
}); 