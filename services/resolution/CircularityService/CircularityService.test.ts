import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CircularityService } from './CircularityService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import { ICircularityService } from './ICircularityService';
import { TestContextDI } from '../../../tests/utils/di/TestContextDI';
import { createService } from '../../../core/ServiceProvider';

describe('CircularityService', () => {
  // Define tests for both DI and non-DI modes
  describe.each([
    { useDI: true, name: 'with DI' },
    { useDI: false, name: 'without DI' },
  ])('$name', ({ useDI }) => {
    let service: ICircularityService;
    let context: TestContextDI;

    beforeEach(() => {
      // Create test context with appropriate DI setting
      context = useDI 
        ? TestContextDI.withDI() 
        : TestContextDI.withoutDI();

      // Get service instance using the appropriate mode
      service = useDI
        ? context.container.resolve<ICircularityService>('ICircularityService')
        : createService(CircularityService);
    });

    afterEach(async () => {
      await context.cleanup();
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
      });
    });

    describe('Circular import detection', () => {
      it('should detect direct circular imports', () => {
        service.beginImport('fileA.meld');
        
        expect(() => service.beginImport('fileA.meld'))
          .toThrow(MeldImportError);
      });

      it('should detect indirect circular imports', () => {
        service.beginImport('fileA.meld');
        service.beginImport('fileB.meld');
        
        expect(() => service.beginImport('fileA.meld'))
          .toThrow(MeldImportError);
      });

      it('should include import chain in error', () => {
        service.beginImport('fileA.meld');
        service.beginImport('fileB.meld');
        
        try {
          service.beginImport('fileA.meld');
          fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(MeldImportError);
          if (error instanceof MeldImportError) {
            expect(error.details?.importChain).toEqual([
              'fileA.meld',
              'fileB.meld',
              'fileA.meld'
            ]);
          }
        }
      });

      it('should allow reimporting after file is removed from stack', () => {
        service.beginImport('fileA.meld');
        service.endImport('fileA.meld');
        
        expect(() => service.beginImport('fileA.meld'))
          .not.toThrow();
      });
    });

    describe('Stack management', () => {
      it('should reset the stack', () => {
        service.beginImport('fileA.meld');
        service.beginImport('fileB.meld');
        
        service.reset();
        
        expect(service.getImportStack()).toEqual([]);
        expect(service.isInStack('fileA.meld')).toBe(false);
        expect(service.isInStack('fileB.meld')).toBe(false);
      });

      it('should handle ending import for file not in stack', () => {
        expect(() => service.endImport('nonexistent.meld'))
          .not.toThrow();
      });

      it('should maintain stack order when ending imports out of order', () => {
        service.beginImport('fileA.meld');
        service.beginImport('fileB.meld');
        service.beginImport('fileC.meld');

        service.endImport('fileB.meld');
        
        expect(service.getImportStack()).toEqual([
          'fileA.meld',
          'fileC.meld'
        ]);
      });
    });
  });
}); 