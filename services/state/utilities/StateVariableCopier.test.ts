import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { StateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';

describe('StateVariableCopier', () => {
  const helpers = TestContextDI.createTestHelpers();
  let context: TestContextDI;
  let sourceState: IStateService;
  let targetState: IStateService;
  let trackingService: IStateTrackingService;
  let copier: StateVariableCopier;
  
  beforeEach(async () => {
    context = helpers.setupMinimal();
    
    sourceState = MockFactory.createStateService({
      getStateId: vi.fn().mockReturnValue('source-state-id'),
      getCurrentFilePath: vi.fn().mockReturnValue('/path/to/file.meld'),
      
      // Text variables
      getAllTextVars: vi.fn().mockReturnValue(new Map([
        ['textVar1', 'text value 1'],
        ['textVar2', 'text value 2']
      ])),
      getTextVar: vi.fn((name) => sourceState.getAllTextVars!().get(name)),
      
      // Data variables
      getAllDataVars: vi.fn().mockReturnValue(new Map([
        ['dataVar1', { key: 'value' }],
        ['dataVar2', [1, 2, 3]]
      ])),
      getDataVar: vi.fn((name) => sourceState.getAllDataVars!().get(name)),
      
      // Path variables
      getAllPathVars: vi.fn().mockReturnValue(new Map([
        ['pathVar1', '/path/to/somewhere'],
        ['pathVar2', './relative/path']
      ])),
      getPathVar: vi.fn((name) => sourceState.getAllPathVars!().get(name)),
      
      // Commands
      getAllCommands: vi.fn().mockReturnValue(new Map([
        ['cmd1', { command: 'echo hello' }],
        ['cmd2', { command: 'ls -la', options: { cwd: '/' } }]
      ])),
      getCommand: vi.fn((name) => sourceState.getAllCommands!().get(name)),
    });
    
    targetState = MockFactory.createStateService({
      getStateId: vi.fn().mockReturnValue('target-state-id'),
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn()
    });
    
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
    it('should copy all variables from source to target', () => {
      // Act
      const result = copier.copyAllVariables(sourceState, targetState);
      
      // Assert
      expect(result).toBe(8); // 2 text + 2 data + 2 path + 2 commands
      
      // Verify text variables were copied
      expect(targetState.setTextVar).toHaveBeenCalledWith('textVar1', 'text value 1');
      expect(targetState.setTextVar).toHaveBeenCalledWith('textVar2', 'text value 2');
      
      // Verify data variables were copied
      expect(targetState.setDataVar).toHaveBeenCalledWith('dataVar1', { key: 'value' });
      expect(targetState.setDataVar).toHaveBeenCalledWith('dataVar2', [1, 2, 3]);
      
      // Verify path variables were copied
      expect(targetState.setPathVar).toHaveBeenCalledWith('pathVar1', '/path/to/somewhere');
      expect(targetState.setPathVar).toHaveBeenCalledWith('pathVar2', './relative/path');
      
      // Verify commands were copied
      expect(targetState.setCommand).toHaveBeenCalledWith('cmd1', { command: 'echo hello' });
      expect(targetState.setCommand).toHaveBeenCalledWith('cmd2', { command: 'ls -la', options: { cwd: '/' } });
      
      // Verify tracking was called
      expect(trackingService.trackContextBoundary).toHaveBeenCalledTimes(2);
      expect(trackingService.trackVariableCrossing).toHaveBeenCalledTimes(8);
    });
    
    it('should respect skipExisting option', () => {
      // Setup: mock existing variables in target
      targetState.getTextVar = vi.fn((name) => name === 'textVar1' ? 'existing value' : undefined);
      targetState.getDataVar = vi.fn((name) => name === 'dataVar1' ? { existing: true } : undefined);
      
      // Act
      const result = copier.copyAllVariables(sourceState, targetState, { skipExisting: true });
      
      // Assert: should copy 6 variables (skipping 2)
      expect(result).toBe(6);
      
      // textVar1 should not be copied because it exists
      expect(targetState.setTextVar).not.toHaveBeenCalledWith('textVar1', expect.anything());
      // textVar2 should be copied
      expect(targetState.setTextVar).toHaveBeenCalledWith('textVar2', 'text value 2');
      
      // dataVar1 should not be copied because it exists
      expect(targetState.setDataVar).not.toHaveBeenCalledWith('dataVar1', expect.anything());
      // dataVar2 should be copied
      expect(targetState.setDataVar).toHaveBeenCalledWith('dataVar2', [1, 2, 3]);
    });
    
    it('should handle tracking options', () => {
      // Act: disable tracking
      copier.copyAllVariables(sourceState, targetState, {
        trackContextBoundary: false,
        trackVariableCrossing: false
      });
      
      // Assert: no tracking calls
      expect(trackingService.trackContextBoundary).not.toHaveBeenCalled();
      expect(trackingService.trackVariableCrossing).not.toHaveBeenCalled();
    });
    
    it('should handle missing methods gracefully', () => {
      // Setup: remove some methods from the state
      delete (sourceState as any).getAllTextVars;
      delete (targetState as any).setDataVar;
      
      // Act
      const result = copier.copyAllVariables(sourceState, targetState);
      
      // Assert: should only copy variables where methods exist
      expect(result).toBe(4); // 0 text + 0 data + 2 path + 2 commands
      
      // No text variables copied (missing getAllTextVars)
      expect(targetState.setTextVar).not.toHaveBeenCalled();
      
      // No data variables copied (missing setDataVar)
      // Can't check not.toHaveBeenCalled since we deleted the method
      // Just verify no errors were thrown
    });
  });
  
  describe('copySpecificVariables', () => {
    it('should copy specific variables by name', () => {
      // Act
      const result = copier.copySpecificVariables(
        sourceState,
        targetState,
        [
          { name: 'textVar1' },
          { name: 'dataVar2' },
          { name: 'pathVar1', alias: 'customPath' }
        ]
      );
      
      // Assert
      expect(result).toBe(3);
      
      // Variables should be copied with correct names/aliases
      expect(targetState.setTextVar).toHaveBeenCalledWith('textVar1', 'text value 1');
      expect(targetState.setDataVar).toHaveBeenCalledWith('dataVar2', [1, 2, 3]);
      expect(targetState.setPathVar).toHaveBeenCalledWith('customPath', '/path/to/somewhere');
      
      // Tracking should include the alias
      expect(trackingService.trackVariableCrossing).toHaveBeenCalledWith(
        'source-state-id',
        'target-state-id',
        'pathVar1',
        'path',
        'customPath'
      );
    });
    
    it('should skip non-existent variables', () => {
      // Act
      const result = copier.copySpecificVariables(
        sourceState,
        targetState,
        [
          { name: 'textVar1' },
          { name: 'nonExistentVar' }
        ]
      );
      
      // Assert: only the existing variable should be copied
      expect(result).toBe(1);
      expect(targetState.setTextVar).toHaveBeenCalledWith('textVar1', 'text value 1');
    });
  });
  
  describe('Error handling', () => {
    it('should handle errors when getting variables', () => {
      // Setup: make getAllTextVars throw
      sourceState.getAllTextVars = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      // Act
      const result = copier.copyAllVariables(sourceState, targetState);
      
      // Assert: should continue with other variable types
      expect(result).toBe(6); // 0 text + 2 data + 2 path + 2 commands
    });
    
    it('should handle errors when getting file path', () => {
      // Setup: make getCurrentFilePath throw
      sourceState.getCurrentFilePath = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      // Act
      const result = copier.copyAllVariables(sourceState, targetState);
      
      // Assert: should still copy variables
      expect(result).toBe(8);
      
      // Context boundary should be tracked without file path
      expect(trackingService.trackContextBoundary).toHaveBeenCalledWith(
        'source-state-id',
        'target-state-id',
        'import',
        undefined
      );
    });
  });
}); 