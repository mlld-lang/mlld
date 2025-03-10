import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IPathOperationsService } from './IPathOperationsService.js';
import { PathOperationsService } from './PathOperationsService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import path from 'path';

describe('PathOperationsService', () => {
  let service: IPathOperationsService;
  let context: TestContextDI;

  beforeEach(async () => {
    // Create isolated test context
    context = TestContextDI.createIsolated();

    // Register the service
    context.registerMock('IPathOperationsService', new PathOperationsService());

    // Initialize context
    await context.initialize();

    // Get service instance using DI
    service = await context.container.resolve('IPathOperationsService');
  });

  afterEach(async () => {
    await context?.cleanup();
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