import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathOperationsService } from './PathOperationsService';
import { TestContextDI } from '../../../tests/utils/di/TestContextDI';
import { IPathOperationsService } from './IPathOperationsService';
import { createService } from '../../../core/ServiceProvider';
import path from 'path';

describe('PathOperationsService', () => {
  // Define tests for both DI and non-DI modes
  describe.each([
    { useDI: true, name: 'with DI' },
    { useDI: false, name: 'without DI' },
  ])('$name', ({ useDI }) => {
    let service: IPathOperationsService;
    let context: TestContextDI;

    beforeEach(() => {
      // Create test context with appropriate DI setting
      context = useDI 
        ? TestContextDI.withDI() 
        : TestContextDI.withoutDI();

      // Get service instance using the appropriate mode
      service = useDI
        ? context.container.resolve<IPathOperationsService>('IPathOperationsService')
        : createService(PathOperationsService);
    });

    afterEach(async () => {
      await context.cleanup();
    });

    describe('Path operations', () => {
      it('joins paths', () => {
        expect(service.join('project', 'nested', 'file.txt'))
          .toBe('project/nested/file.txt');
      });

      it('resolves paths', () => {
        expect(service.resolve('project/nested', '../file.txt'))
          .toBe(path.resolve('project/file.txt'));
      });

      it('gets dirname', () => {
        expect(service.dirname('project/nested/file.txt'))
          .toBe('project/nested');
      });

      it('gets basename', () => {
        expect(service.basename('project/nested/file.txt'))
          .toBe('file.txt');
      });

      it('normalizes paths', () => {
        expect(service.normalize('project/./nested/../file.txt'))
          .toBe('project/file.txt');
      });

      it('checks if path is absolute', () => {
        expect(service.isAbsolute('/absolute/path')).toBe(true);
        expect(service.isAbsolute('relative/path')).toBe(false);
      });

      it('gets relative path', () => {
        expect(service.relative('/base/dir', '/base/dir/sub/file.txt'))
          .toBe('sub/file.txt');
        expect(service.relative('/base/dir', '/other/dir'))
          .toBe('../../other/dir');
      });

      it('parses paths', () => {
        const parsed = service.parse('/base/dir/file.txt');
        expect(parsed).toEqual({
          root: '/',
          dir: '/base/dir',
          base: 'file.txt',
          ext: '.txt',
          name: 'file'
        });
      });
    });
  });
}); 