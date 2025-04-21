import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { container, type DependencyContainer } from 'tsyringe';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';

describe('CircularityService', () => {
  let testContainer: DependencyContainer;
  let service: ICircularityService;
  let mockResolutionService: DeepMockProxy<IResolutionService>;

  beforeEach(async () => {
    testContainer = container.createChildContainer();

    mockResolutionService = mockDeep<IResolutionService>();

    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance('DependencyContainer', testContainer);
    
    testContainer.register<ICircularityService>('ICircularityService', { useClass: CircularityService });
    
    service = testContainer.resolve<ICircularityService>('ICircularityService');
    
    expect(service).toBeInstanceOf(CircularityService);
  });

  afterEach(async () => {
    testContainer?.dispose();
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
      
      expect(() => {
        service.beginImport('fileA.meld');
      }).toThrow(MeldImportError);
      
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
        expect(importError.details).toBeDefined();
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

  describe('Path normalization', () => {
    it('should normalize paths with backslashes', () => {
      service.beginImport('C:\\path\\to\\file.meld');
      expect(service.isInStack('C:/path/to/file.meld')).toBe(true);
    });

    it('should normalize paths with forward slashes', () => {
      service.beginImport('/path/to/file.meld');
      expect(service.isInStack('/path/to/file.meld')).toBe(true); 
    });

    it('should detect circular imports with different path formats', () => {
      service.beginImport('/path/to/file.meld');
      service.beginImport('/path/to/another.meld');
      expect(() => service.beginImport('\\path\\to\\file.meld'))
        .toThrow(MeldImportError);
    });

    it('should correctly end import with different path formats', () => {
      service.beginImport('/path/to/file.meld');
      service.endImport('\\path\\to\\file.meld');
      expect(service.getImportStack()).toEqual([]);
    });
  });
}); 