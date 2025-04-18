import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { StateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
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
  TextVariable,
  DataVariable,
  IPathVariable,
  CommandVariable,
  MeldVariable,
  VariableOrigin
} from '@core/types/index.js';
import { unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import type { StateNode } from '@services/state/StateService/types.js';

describe('StateVariableCopier', () => {
  const helpers = TestContextDI.createTestHelpers();
  let context: TestContextDI;
  let sourceState: IStateService;
  let targetState: IStateService;
  let trackingService: IStateTrackingService;
  let copier: StateVariableCopier;
  
  // --- Setup Variables ---
  let textVar1: TextVariable;
  let textVar2: TextVariable;
  let dataVar1: DataVariable;
  let dataVar2: DataVariable;
  let pathVar1: IPathVariable;
  let pathVar2: IPathVariable;
  let cmdVar1: CommandVariable;
  let cmdVar2: CommandVariable;
  let allSourceVariables: Map<string, MeldVariable>;
  
  beforeEach(async () => {
    context = helpers.setupMinimal();
    
    // Create variables for source state
    textVar1 = createTextVariable('textVar1', 'text value 1', VariableOrigin.DIRECT_DEFINITION, undefined, { createdAt: Date.now(), modifiedAt: Date.now() });
    textVar2 = createTextVariable('textVar2', 'text value 2', VariableOrigin.DIRECT_DEFINITION, undefined, { createdAt: Date.now(), modifiedAt: Date.now() });
    dataVar1 = createDataVariable('dataVar1', { key: 'value' }, VariableOrigin.DIRECT_DEFINITION, undefined, { createdAt: Date.now(), modifiedAt: Date.now() });
    dataVar2 = createDataVariable('dataVar2', [1, 2, 3], VariableOrigin.DIRECT_DEFINITION, undefined, { createdAt: Date.now(), modifiedAt: Date.now() });
    const pathValue1: IFilesystemPathState = { contentType: PathContentType.FILESYSTEM, originalValue: '/path/to/somewhere', isValidSyntax: true, isSecure: true, isAbsolute: true, validatedPath: unsafeCreateValidatedResourcePath('/path/to/somewhere'), exists: false };
    pathVar1 = createPathVariable('pathVar1', pathValue1, VariableOrigin.DIRECT_DEFINITION, undefined, { createdAt: Date.now(), modifiedAt: Date.now() });
    const pathValue2: IFilesystemPathState = { contentType: PathContentType.FILESYSTEM, originalValue: './relative/path', isValidSyntax: true, isSecure: true, isAbsolute: false, validatedPath: unsafeCreateValidatedResourcePath('./relative/path'), exists: false };
    pathVar2 = createPathVariable('pathVar2', pathValue2, VariableOrigin.DIRECT_DEFINITION, undefined, { createdAt: Date.now(), modifiedAt: Date.now() });
    const cmdValue1: ICommandDefinition = { type: 'basic', command: 'echo hello' };
    cmdVar1 = createCommandVariable('cmd1', cmdValue1, VariableOrigin.DIRECT_DEFINITION, undefined, { createdAt: Date.now(), modifiedAt: Date.now() });
    const cmdValue2: ICommandDefinition = { type: 'basic', command: 'ls -la', options: { cwd: '/' } };
    cmdVar2 = createCommandVariable('cmd2', cmdValue2, VariableOrigin.DIRECT_DEFINITION, undefined, { createdAt: Date.now(), modifiedAt: Date.now() });

    allSourceVariables = new Map<string, MeldVariable>([
      [textVar1.name, textVar1],
      [textVar2.name, textVar2],
      [dataVar1.name, dataVar1],
      [dataVar2.name, dataVar2],
      [pathVar1.name, pathVar1],
      [pathVar2.name, pathVar2],
      [cmdVar1.name, cmdVar1],
      [cmdVar2.name, cmdVar2],
    ]);

    // --- Create Variable Maps for StateNode --- 
    const textVariables = new Map<string, TextVariable>();
    const dataVariables = new Map<string, DataVariable>();
    const pathVariables = new Map<string, IPathVariable>();
    const commandVariables = new Map<string, CommandVariable>();
    for (const variable of allSourceVariables.values()) {
        if (variable.type === VariableType.TEXT) textVariables.set(variable.name, variable as TextVariable);
        else if (variable.type === VariableType.DATA) dataVariables.set(variable.name, variable as DataVariable);
        else if (variable.type === VariableType.PATH) pathVariables.set(variable.name, variable as IPathVariable);
        else if (variable.type === VariableType.COMMAND) commandVariables.set(variable.name, variable as CommandVariable);
    }

    // --- Create Mock StateNode --- 
    const mockSourceNode: StateNode = {
        stateId: 'source-node-id',
        filePath: '/path/to/file.meld',
        variables: { text: textVariables, data: dataVariables, path: pathVariables },
        commands: commandVariables,
        nodes: [],
        imports: new Set(),
        transformationOptions: { enabled: true, preserveOriginal: true, transformNested: true }, // Example options
        createdAt: Date.now(),
        modifiedAt: Date.now()
    };

    sourceState = MockFactory.createStateService({
      getStateId: vi.fn().mockReturnValue('source-state-id'),
      getCurrentFilePath: vi.fn().mockReturnValue('/path/to/file.meld'),
      // --- Mock Generic Getters ---
      getVariable: vi.fn((name: string, type?: VariableType) => {
        const variable = allSourceVariables.get(name);
        if (!variable) return undefined;
        if (type && variable.type !== type) return undefined;
        return variable;
      }),
      hasVariable: vi.fn((name: string, type?: VariableType) => {
         const variable = allSourceVariables.get(name);
         if (!variable) return false;
         if (type && variable.type !== type) return false;
         return true;
      }),
      // --- Mock getInternalStateNode --- 
      getInternalStateNode: vi.fn().mockReturnValue(mockSourceNode),
    });
    
    // --- Target State Setup --- 
    targetState = MockFactory.createStateService({
      getStateId: vi.fn().mockReturnValue('target-state-id'),
      setVariable: vi.fn().mockImplementation(async (variable) => variable), 
      getVariable: vi.fn(), // Default to undefined
      hasVariable: vi.fn().mockReturnValue(false), // Default to false
    });
    
    // --- Tracking Service & Copier --- 
    trackingService = {
      trackContextBoundary: vi.fn(),
      trackVariableCrossing: vi.fn()
    } as unknown as IStateTrackingService;
    
    copier = new StateVariableCopier(trackingService);
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  describe('copyAllVariables', () => {
    it('should copy all variables from source to target using generic methods', async () => {
      // Act
      const result = await copier.copyAllVariables(sourceState, targetState);
      
      // Assert
      expect(result).toBe(8); // 2 text + 2 data + 2 path + 2 commands
      
      // Verify variables were copied using setVariable
      expect(targetState.setVariable).toHaveBeenCalledWith(textVar1);
      expect(targetState.setVariable).toHaveBeenCalledWith(textVar2);
      expect(targetState.setVariable).toHaveBeenCalledWith(dataVar1);
      expect(targetState.setVariable).toHaveBeenCalledWith(dataVar2);
      expect(targetState.setVariable).toHaveBeenCalledWith(pathVar1);
      expect(targetState.setVariable).toHaveBeenCalledWith(pathVar2);
      expect(targetState.setVariable).toHaveBeenCalledWith(cmdVar1);
      expect(targetState.setVariable).toHaveBeenCalledWith(cmdVar2);
      
      // Verify tracking was called
      expect(trackingService.trackContextBoundary).toHaveBeenCalledTimes(2);
      expect(trackingService.trackVariableCrossing).toHaveBeenCalledTimes(8);
      
      // Verify specific tracking calls (example for textVar1)
      expect(trackingService.trackVariableCrossing).toHaveBeenCalledWith(
        'source-state-id',
        'target-state-id',
        'textVar1',
        VariableType.TEXT, // Use VariableType enum
        'textVar1'
      );
    });
    
    it('should respect skipExisting option using generic methods', async () => {
      // Setup: mock existing variables in target using hasVariable
      (targetState.hasVariable as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
        return name === 'textVar1' || name === 'dataVar1';
      });
      
      // Act
      const result = await copier.copyAllVariables(sourceState, targetState, { skipExisting: true });
      
      // Assert: should copy 6 variables (skipping 2)
      expect(result).toBe(6);
      
      // textVar1 should not be copied because it exists
      expect(targetState.setVariable).not.toHaveBeenCalledWith(textVar1);
      // textVar2 should be copied
      expect(targetState.setVariable).toHaveBeenCalledWith(textVar2);
      
      // dataVar1 should not be copied because it exists
      expect(targetState.setVariable).not.toHaveBeenCalledWith(dataVar1);
      // dataVar2 should be copied
      expect(targetState.setVariable).toHaveBeenCalledWith(dataVar2);
      
      // Paths and Commands should be copied
      expect(targetState.setVariable).toHaveBeenCalledWith(pathVar1);
      expect(targetState.setVariable).toHaveBeenCalledWith(pathVar2);
      expect(targetState.setVariable).toHaveBeenCalledWith(cmdVar1);
      expect(targetState.setVariable).toHaveBeenCalledWith(cmdVar2);
      
      // Verify tracking for skipped vars
      expect(trackingService.trackVariableCrossing).toHaveBeenCalledTimes(6); // Only track copied vars
    });
    
    it('should handle tracking options', async () => {
      // Act: disable tracking
      await copier.copyAllVariables(sourceState, targetState, {
        trackContextBoundary: false,
        trackVariableCrossing: false
      });
      
      // Assert: no tracking calls
      expect(trackingService.trackContextBoundary).not.toHaveBeenCalled();
      expect(trackingService.trackVariableCrossing).not.toHaveBeenCalled();
    });
    
    it('should handle missing getAllVariables gracefully', async () => {
      // Setup: remove getAllVariables method
      delete (sourceState as any).getAllVariables;
      
      // Act
      const result = await copier.copyAllVariables(sourceState, targetState);
      
      // Assert: should copy 0 variables
      expect(result).toBe(0);
      expect(targetState.setVariable).not.toHaveBeenCalled();
    });
    
    it('should handle missing setVariable gracefully', async () => {
      // Setup: remove setVariable method
      delete (targetState as any).setVariable;
      
      // Act
      const result = await copier.copyAllVariables(sourceState, targetState);
      
      // Assert: should return 0, no errors
      expect(result).toBe(0);
      // Can't check not.toHaveBeenCalled since we deleted the method
      // Just verify no errors were thrown during execution
    });
  });
  
  describe('copySpecificVariables', () => {
    it('should copy specific variables by name using generic methods', async () => {
      // Act
      const result = await copier.copySpecificVariables(
        sourceState,
        targetState,
        [
          { name: 'textVar1' }, // Expect textVar1 to be copied
          { name: 'dataVar2' }, // Expect dataVar2 to be copied
          { name: 'pathVar1', alias: 'customPath' } // Expect pathVar1 copied as customPath
        ]
      );
      
      // Assert
      expect(result).toBe(3);
      
      // Variables should be copied using setVariable with correct variable object and alias
      expect(targetState.setVariable).toHaveBeenCalledWith(expect.objectContaining({ name: 'textVar1', value: 'text value 1' }));
      expect(targetState.setVariable).toHaveBeenCalledWith(expect.objectContaining({ name: 'dataVar2', value: [1, 2, 3] }));
      // Check alias: setVariable should be called with a variable object whose 'name' property is 'customPath'
      // and whose value matches pathVar1's value.
      expect(targetState.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        name: 'customPath',
        type: VariableType.PATH,
        value: pathVar1.value // Check the value object matches
      }));
      
      // Tracking should include the alias
      expect(trackingService.trackVariableCrossing).toHaveBeenCalledWith(
        'source-state-id',
        'target-state-id',
        'pathVar1', // Original name
        VariableType.PATH,
        'customPath' // Alias name
      );
    });
    
    it('should skip non-existent variables using generic methods', async () => {
      // Act
      const result = await copier.copySpecificVariables(
        sourceState,
        targetState,
        [
          { name: 'textVar1' },
          { name: 'nonExistentVar' }
        ]
      );
      
      // Assert: only the existing variable should be copied
      expect(result).toBe(1);
      expect(targetState.setVariable).toHaveBeenCalledTimes(1);
      expect(targetState.setVariable).toHaveBeenCalledWith(textVar1);
      expect(targetState.setVariable).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'nonExistentVar' }));
    });
  });
  
  describe('Error handling', () => {
    it('should handle errors when source getVariable throws', async () => {
       // Setup: make sourceState.getVariable throw for a specific variable
      (sourceState.getVariable as ReturnType<typeof vi.fn>).mockImplementation((name: string, type?: VariableType) => {
        if (name === 'dataVar1') {
          throw new Error('Test error getting dataVar1');
        }
        // Return undefined for other vars in this specific test setup
        return undefined; 
      });
      
      // Act
      const result = await copier.copySpecificVariables(
        sourceState,
        targetState,
        [ { name: 'textVar1'}, { name: 'dataVar1' }, { name: 'pathVar1'} ] // text1 & path1 will use the mock above
      );
      
      // Assert: should skip the variable that caused error and continue
      expect(result).toBe(0); // Only dataVar1 was attempted, others returned undefined
      expect(targetState.setVariable).not.toHaveBeenCalled(); // Nothing should be set
    });
    
    it('should handle errors when target setVariable throws', async () => {
      // Setup: make targetState.setVariable throw for a specific variable
      (targetState.setVariable as ReturnType<typeof vi.fn>).mockImplementation(async (variable: MeldVariable) => {
        if (variable.name === 'dataVar1') {
           throw new Error('Test error setting dataVar1');
        }
        // Return variable for successful calls
        return variable;
      });
      
      // Act
      const result = await copier.copySpecificVariables(
        sourceState,
        targetState,
        [ { name: 'textVar1'}, { name: 'dataVar1' }, { name: 'pathVar1'} ]
      );
      
      // Assert: should attempt all copies, result reflects attempts before error
      expect(result).toBe(2); // textVar1 and pathVar1 successfully set
      expect(targetState.setVariable).toHaveBeenCalledWith(textVar1);
      // It WAS called for dataVar1, but it threw
      expect(targetState.setVariable).toHaveBeenCalledWith(dataVar1);
      expect(targetState.setVariable).toHaveBeenCalledWith(pathVar1);
    });
    
    it('should handle errors when getting file path', async () => {
      // Setup: make getCurrentFilePath throw
      sourceState.getCurrentFilePath = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      // Act
      const result = await copier.copyAllVariables(sourceState, targetState);
      
      // Assert: should still copy variables
      expect(result).toBe(8);
      
      // Context boundary should be tracked without file path
      expect(trackingService.trackContextBoundary).toHaveBeenCalledWith(
        'source-state-id',
        'target-state-id',
        'import', // Default context type? Check copier logic.
        undefined // File path is undefined due to error
      );
    });
  });
}); 