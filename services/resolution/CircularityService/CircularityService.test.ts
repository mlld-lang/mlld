import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

describe('CircularityService', () => {
  const helpers = TestContextDI.createTestHelpers();
  let context: TestContextDI;
  let service: ICircularityService; // Use interface type

  beforeEach(async () => {
    // Use helper
    context = helpers.setupWithStandardMocks();
    // Await init
    await context.resolve('IFileSystemService'); // Resolve something to wait
    
    // Resolve service (expecting real implementation)
    service = await context.resolve('ICircularityService');
    
    // Verify we got the real service
    expect(service).toBeInstanceOf(CircularityService);
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
        // Check if details and importChain exist before accessing
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
    // These tests might be less relevant if PathService handles normalization
    // but good to keep for verifying internal normalization if any exists.
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