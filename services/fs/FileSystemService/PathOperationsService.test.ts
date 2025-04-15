import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import path from 'path';

describe('PathOperationsService', () => {
  const helpers = TestContextDI.createTestHelpers();
  let service: IPathOperationsService;
  let context: TestContextDI;

  beforeEach(async () => {
    // Use the helper
    context = helpers.setupWithStandardMocks();
    // Await initialization implicitly
    await context.resolve('IFileSystemService');

    // Resolve the service (expecting real implementation)
    service = await context.resolve('IPathOperationsService');
    
    // Verify we got the real service
    expect(service).toBeInstanceOf(PathOperationsService);
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
      // Note: service.resolve likely calls Node's path.resolve internally.
      // The exact output depends on the environment where tests run.
      // For consistency, we might want to mock the internal call or adjust assertion.
      // Let's keep the original assertion for now, assuming consistent env.
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
      // Using path.normalize for expected value for consistency
      expect(service.normalize('project/./nested/../file.txt'))
        .toBe(path.normalize('project/file.txt'));
    });

    it('checks if path is absolute', () => {
      expect(service.isAbsolute('/absolute/path')).toBe(true);
      expect(service.isAbsolute('relative/path')).toBe(false);
    });

    it('gets relative path', () => {
      // Using path.relative for expected value
      expect(service.relative('/base/dir', '/base/dir/sub/file.txt'))
        .toBe(path.relative('/base/dir', '/base/dir/sub/file.txt')); // Should be 'sub/file.txt'
      expect(service.relative('/base/dir', '/other/dir'))
        .toBe(path.relative('/base/dir', '/other/dir')); // Should be '../other/dir' on Unix-like
    });

    it('parses paths', () => {
      const parsed = service.parse('/base/dir/file.txt');
      // Use path.parse for expected value to handle platform differences (e.g., root)
      const expected = path.parse('/base/dir/file.txt');
      expect(parsed).toEqual(expected);
    });
  });
}); 