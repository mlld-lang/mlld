import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CircularityService } from './CircularityService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import { ICircularityService } from './ICircularityService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

describe('CircularityService', () => {
  let context: TestContextDI;
  let service: CircularityService;

  beforeEach(async () => {
    // Create context with DI
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Resolve service from DI container with await
    service = await context.resolve(CircularityService);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('Basic import tracking', () => {
    it('should track imports in stack', () => {
      service.beginImport('fileA.meld');
      expect(service.isInStack('fileA.meld')).toBe(true);
      expect(service.getImportStack()).toEqual(['fileA.meld']);
    });

    it('should remove imports from stack', () => {
      service.beginImport('fileA.meld');
      service.endImport('fileA.meld');
      expect(service.isInStack('fileA.meld')).toBe(false);
      expect(service.getImportStack()).toEqual([]);
    });

    it('should handle multiple imports in LIFO order', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');
      service.beginImport('fileC.meld');

      expect(service.getImportStack()).toEqual([
        'fileA.meld',
        'fileB.meld',
        'fileC.meld'
      ]);

      service.endImport('fileC.meld');
      expect(service.getImportStack()).toEqual([
        'fileA.meld',
        'fileB.meld'
      ]);

      service.endImport('fileB.meld');
      expect(service.getImportStack()).toEqual([
        'fileA.meld'
      ]);

      service.endImport('fileA.meld');
      expect(service.getImportStack()).toEqual([]);
    });

    it('should handle ending imports in any order', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');
      service.beginImport('fileC.meld');

      service.endImport('fileA.meld');
      expect(service.getImportStack()).toEqual([
        'fileB.meld',
        'fileC.meld'
      ]);

      service.endImport('fileC.meld');
      expect(service.getImportStack()).toEqual([
        'fileB.meld'
      ]);

      service.endImport('fileB.meld');
      expect(service.getImportStack()).toEqual([]);
    });

    it('should handle duplicate file paths correctly', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');
      
      // Expect an error when attempting to import fileA.meld again (circular import)
      expect(() => {
        service.beginImport('fileA.meld');
      }).toThrow(MeldImportError);
      
      // The stack should remain unchanged
      expect(service.getImportStack()).toEqual([
        'fileA.meld',
        'fileB.meld'
      ]);
    });
  });

  describe('Circular import detection', () => {
    it('should detect direct circular imports', () => {
      service.beginImport('fileA.meld');
      
      expect(() => {
        service.beginImport('fileA.meld');
      }).toThrow(MeldImportError);
    });

    it('should detect indirect circular imports', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');
      service.beginImport('fileC.meld');
      
      expect(() => {
        service.beginImport('fileA.meld');
      }).toThrow(MeldImportError);
    });

    it('should include import chain in error', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');
      
      try {
        service.beginImport('fileA.meld');
        expect.fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldImportError);
        const importError = error as MeldImportError;
        expect(importError.details?.importChain).toEqual([
          'fileA.meld',
          'fileB.meld',
          'fileA.meld'
        ]);
      }
    });
  });

  describe('Reset functionality', () => {
    it('should clear the import stack', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');
      
      service.reset();
      
      expect(service.getImportStack()).toEqual([]);
      expect(service.isInStack('fileA.meld')).toBe(false);
      expect(service.isInStack('fileB.meld')).toBe(false);
    });
  });
}); 