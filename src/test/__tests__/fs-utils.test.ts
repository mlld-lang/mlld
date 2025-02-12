import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestFileSystem, PathValidationError, PathTypeError, PathNotFoundError, PathExistsError } from '../fs-utils';

describe('TestFileSystem', () => {
  let fs: TestFileSystem;

  beforeEach(async () => {
    fs = new TestFileSystem();
    await fs.initialize();
  });

  afterEach(async () => {
    await fs.cleanup();
  });

  describe('path validation', () => {
    it('should reject empty paths', async () => {
      await expect(fs.writeFile('', 'content'))
        .rejects.toThrow(PathValidationError);
      await expect(fs.writeFile('', 'content'))
        .rejects.toThrow('Invalid path "": Path cannot be empty');
    });

    it('should reject paths with null bytes', async () => {
      await expect(fs.writeFile('test\0file.txt', 'content'))
        .rejects.toThrow(PathValidationError);
      await expect(fs.writeFile('test\0file.txt', 'content'))
        .rejects.toThrow('Path contains null bytes');
    });

    it('should reject path traversal attempts', async () => {
      await expect(fs.writeFile('../outside.txt', 'content'))
        .rejects.toThrow(PathValidationError);
      await expect(fs.writeFile('../outside.txt', 'content'))
        .rejects.toThrow('Path traversal is not allowed');
    });

    if (process.platform === 'win32') {
      it('should reject Windows reserved characters', async () => {
        await expect(fs.writeFile('test<file.txt', 'content'))
          .rejects.toThrow(PathValidationError);
        await expect(fs.writeFile('test<file.txt', 'content'))
          .rejects.toThrow('Path contains invalid characters for Windows');
      });
    }
  });

  describe('directory structure', () => {
    it('should create parent directories automatically', async () => {
      await fs.writeFile('project/a/b/c/file.txt', 'content');
      
      const snapshot = fs.getSnapshot();
      expect(snapshot.get(fs.getPath('project/a'))).toBe('');
      expect(snapshot.get(fs.getPath('project/a/b'))).toBe('');
      expect(snapshot.get(fs.getPath('project/a/b/c'))).toBe('');
      expect(snapshot.get(fs.getPath('project/a/b/c/file.txt'))).toBe('content');
    });

    it('should handle multiple files in same directory', async () => {
      await fs.writeFile('project/dir/file1.txt', 'content1');
      await fs.writeFile('project/dir/file2.txt', 'content2');
      
      const snapshot = fs.getSnapshot();
      expect(snapshot.get(fs.getPath('project/dir'))).toBe('');
      expect(snapshot.get(fs.getPath('project/dir/file1.txt'))).toBe('content1');
      expect(snapshot.get(fs.getPath('project/dir/file2.txt'))).toBe('content2');
    });

    it('should reject creating file at existing directory path', async () => {
      await fs.writeFile('project/dir/subdir', '');
      await expect(fs.writeFile('project/dir/subdir', 'content'))
        .rejects.toThrow(PathTypeError);
      await expect(fs.writeFile('project/dir/subdir', 'content'))
        .rejects.toThrow('exists but is not a file');
    });

    it('should reject creating directory at existing file path', async () => {
      await fs.writeFile('project/dir/file.txt', 'content');
      await expect(fs.writeFile('project/dir/file.txt/subdir/file.txt', 'content'))
        .rejects.toThrow(PathExistsError);
      await expect(fs.writeFile('project/dir/file.txt/subdir/file.txt', 'content'))
        .rejects.toThrow('Cannot create directory, path exists as a file');
    });
  });

  describe('special paths', () => {
    it('should handle $PROJECTPATH variable', async () => {
      await fs.writeFile('$PROJECTPATH/file.txt', 'content');
      const snapshot = fs.getSnapshot();
      expect(snapshot.get(fs.getPath('project/file.txt'))).toBe('content');
    });

    it('should handle $HOMEPATH variable', async () => {
      await fs.writeFile('$HOMEPATH/file.txt', 'content');
      const snapshot = fs.getSnapshot();
      expect(snapshot.get(fs.getPath('home/file.txt'))).toBe('content');
    });

    it('should handle $~/ shorthand', async () => {
      await fs.writeFile('$~/file.txt', 'content');
      const snapshot = fs.getSnapshot();
      expect(snapshot.get(fs.getPath('home/file.txt'))).toBe('content');
    });

    it('should handle $./ shorthand', async () => {
      await fs.writeFile('$./file.txt', 'content');
      const snapshot = fs.getSnapshot();
      expect(snapshot.get(fs.getPath('project/file.txt'))).toBe('content');
    });
  });

  describe('validation helpers', () => {
    beforeEach(async () => {
      await fs.writeFile('project/dir/file1.txt', 'content1');
      await fs.writeFile('project/dir/file2.txt', 'content2');
      await fs.writeFile('project/dir/subdir/file3.txt', 'content3');
    });

    describe('verifyDirectory', () => {
      it('should verify directory contents correctly', async () => {
        await fs.verifyDirectory('project/dir', ['file1.txt', 'file2.txt', 'subdir']);
      });

      it('should detect missing files', async () => {
        await expect(fs.verifyDirectory('project/dir', ['file1.txt', 'missing.txt']))
          .rejects.toThrow('Missing expected files');
      });

      it('should detect unexpected files', async () => {
        await expect(fs.verifyDirectory('project/dir', ['file1.txt']))
          .rejects.toThrow('Unexpected files');
      });

      it('should reject non-existent directories', async () => {
        await expect(fs.verifyDirectory('project/nonexistent', []))
          .rejects.toThrow(PathNotFoundError);
        await expect(fs.verifyDirectory('project/nonexistent', []))
          .rejects.toThrow('Directory does not exist');
      });

      it('should reject file paths', async () => {
        await expect(fs.verifyDirectory('project/dir/file1.txt', []))
          .rejects.toThrow(PathTypeError);
        await expect(fs.verifyDirectory('project/dir/file1.txt', []))
          .rejects.toThrow('exists but is not a directory');
      });
    });

    describe('verifyFile', () => {
      it('should verify file content correctly', async () => {
        await fs.verifyFile('project/dir/file1.txt', 'content1');
      });

      it('should detect content mismatch', async () => {
        await expect(fs.verifyFile('project/dir/file1.txt', 'wrong'))
          .rejects.toThrow('File content mismatch');
      });

      it('should reject non-existent files', async () => {
        await expect(fs.verifyFile('project/dir/nonexistent.txt', ''))
          .rejects.toThrow(PathNotFoundError);
        await expect(fs.verifyFile('project/dir/nonexistent.txt', ''))
          .rejects.toThrow('File does not exist');
      });

      it('should reject directory paths', async () => {
        await expect(fs.verifyFile('project/dir', ''))
          .rejects.toThrow(PathTypeError);
        await expect(fs.verifyFile('project/dir', ''))
          .rejects.toThrow('exists but is not a file');
      });
    });

    describe('verifyPathDoesNotExist', () => {
      it('should verify non-existent paths', async () => {
        await fs.verifyPathDoesNotExist('project/nonexistent');
      });

      it('should reject existing files', async () => {
        await expect(fs.verifyPathDoesNotExist('project/dir/file1.txt'))
          .rejects.toThrow('Path exists but should not');
      });

      it('should reject existing directories', async () => {
        await expect(fs.verifyPathDoesNotExist('project/dir'))
          .rejects.toThrow('Path exists but should not');
      });
    });

    describe('getDirectoryFiles', () => {
      it('should list files in directory', () => {
        const files = fs.getDirectoryFiles('project/dir');
        expect(files).toContain('file1.txt');
        expect(files).toContain('file2.txt');
        expect(files).toContain('subdir');
        expect(files).toHaveLength(3);
      });

      it('should reject non-existent directories', () => {
        expect(() => fs.getDirectoryFiles('project/nonexistent'))
          .toThrow('Directory does not exist');
      });

      it('should reject file paths', () => {
        expect(() => fs.getDirectoryFiles('project/dir/file1.txt'))
          .toThrow('Path exists but is not a directory');
      });
    });

    describe('getSnapshot', () => {
      it('should return a copy of the filesystem state', () => {
        const snapshot = fs.getSnapshot();
        expect(snapshot).toBeInstanceOf(Map);
        expect(snapshot.get(fs.getPath('project/dir/file1.txt'))).toBe('content1');
        
        // Verify it's a copy by modifying the snapshot
        snapshot.set('test', 'test');
        expect(fs.getSnapshot().has('test')).toBe(false);
      });

      it('should capture all files and directories', () => {
        const snapshot = fs.getSnapshot();
        expect(snapshot.get(fs.getPath('project/dir'))).toBe('');
        expect(snapshot.get(fs.getPath('project/dir/file1.txt'))).toBe('content1');
        expect(snapshot.get(fs.getPath('project/dir/file2.txt'))).toBe('content2');
        expect(snapshot.get(fs.getPath('project/dir/subdir'))).toBe('');
        expect(snapshot.get(fs.getPath('project/dir/subdir/file3.txt'))).toBe('content3');
      });
    });
  });

  describe('snapshot management', () => {
    beforeEach(async () => {
      await fs.writeFile('project/dir/file1.txt', 'content1');
      await fs.writeFile('project/dir/file2.txt', 'content2');
    });

    describe('compareSnapshots', () => {
      it('should detect added files', async () => {
        const before = fs.getSnapshot();
        await fs.writeFile('project/dir/file3.txt', 'content3');
        
        const diff = fs.compareSnapshots(before);
        expect(diff.added).toContain(fs.getPath('project/dir/file3.txt'));
        expect(diff.modified).toHaveLength(0);
        expect(diff.removed).toHaveLength(0);
      });

      it('should detect modified files', async () => {
        const before = fs.getSnapshot();
        await fs.writeFile('project/dir/file1.txt', 'modified');
        
        const diff = fs.compareSnapshots(before);
        expect(diff.modified).toContain(fs.getPath('project/dir/file1.txt'));
        expect(diff.added).toHaveLength(0);
        expect(diff.removed).toHaveLength(0);
      });

      it('should detect removed files', async () => {
        const before = fs.getSnapshot();
        const snapshot = fs.getSnapshot();
        snapshot.delete(fs.getPath('project/dir/file1.txt'));
        await fs.restoreSnapshot(snapshot);
        
        const diff = fs.compareSnapshots(before);
        expect(diff.removed).toContain(fs.getPath('project/dir/file1.txt'));
        expect(diff.modified).toHaveLength(0);
        expect(diff.added).toHaveLength(0);
      });

      it('should track unchanged files', async () => {
        const before = fs.getSnapshot();
        await fs.writeFile('project/dir/file3.txt', 'content3');
        
        const diff = fs.compareSnapshots(before);
        expect(diff.unchanged).toContain(fs.getPath('project/dir/file1.txt'));
        expect(diff.unchanged).toContain(fs.getPath('project/dir/file2.txt'));
      });
    });

    describe('restoreSnapshot', () => {
      it('should restore filesystem state', async () => {
        const snapshot = fs.getSnapshot();
        await fs.writeFile('project/dir/file3.txt', 'content3');
        await fs.writeFile('project/dir/file1.txt', 'modified');
        
        await fs.restoreSnapshot(snapshot);
        
        const current = fs.getSnapshot();
        expect(current.get(fs.getPath('project/dir/file1.txt'))).toBe('content1');
        expect(current.has(fs.getPath('project/dir/file3.txt'))).toBe(false);
      });

      it('should respect deleteExtra option', async () => {
        const snapshot = fs.getSnapshot();
        await fs.writeFile('project/dir/file3.txt', 'content3');
        
        await fs.restoreSnapshot(snapshot, { deleteExtra: true });
        const current = fs.getSnapshot();
        expect(current.has(fs.getPath('project/dir/file3.txt'))).toBe(false);
        
        await fs.writeFile('project/dir/file3.txt', 'content3');
        await fs.restoreSnapshot(snapshot, { deleteExtra: false });
        const current2 = fs.getSnapshot();
        expect(current2.has(fs.getPath('project/dir/file3.txt'))).toBe(true);
      });

      it('should respect onlyPaths option', async () => {
        const snapshot = fs.getSnapshot();
        await fs.writeFile('project/dir/file1.txt', 'modified1');
        await fs.writeFile('project/other/file.txt', 'modified2');
        
        await fs.restoreSnapshot(snapshot, { onlyPaths: ['project/dir'] });
        
        const current = fs.getSnapshot();
        expect(current.get(fs.getPath('project/dir/file1.txt'))).toBe('content1');
        expect(current.get(fs.getPath('project/other/file.txt'))).toBe('modified2');
      });
    });
  });

  describe('debugging tools', () => {
    beforeEach(async () => {
      await fs.writeFile('project/dir/file1.txt', 'content1');
      await fs.writeFile('project/dir/file2.txt', 'content2');
      await fs.writeFile('project/dir/subdir/file3.txt', 'content3');
    });

    describe('getDebugView', () => {
      it('should show basic filesystem structure', () => {
        const view = fs.getDebugView();
        expect(view).toContain('Mock Filesystem State:');
        expect(view).toContain('📁 project/dir/');
        expect(view).toContain('📄 project/dir/file1.txt');
      });

      it('should show file content when requested', () => {
        const view = fs.getDebugView({ showContent: true });
        expect(view).toContain('📄 project/dir/file1.txt: content1');
      });

      it('should respect content length limit', () => {
        const longContent = 'a'.repeat(200);
        fs.writeFile('project/long.txt', longContent);
        const view = fs.getDebugView({ showContent: true, maxContentLength: 50 });
        expect(view).toContain('...');
        expect(view.includes(longContent)).toBe(false);
      });

      it('should filter paths', () => {
        const view = fs.getDebugView({ filter: 'subdir' });
        expect(view).toContain('subdir');
        expect(view).not.toContain('file1.txt');
      });
    });

    describe('debugPath', () => {
      it('should show file information', () => {
        const debug = fs.debugPath('project/dir/file1.txt');
        expect(debug).toContain('Type: file');
        expect(debug).toContain('Content length: 8');
        expect(debug).toContain('Content preview: content1');
      });

      it('should show directory information', () => {
        const debug = fs.debugPath('project/dir');
        expect(debug).toContain('Type: directory');
        expect(debug).toContain('Directory contents:');
        expect(debug).toContain('- file1.txt');
        expect(debug).toContain('- file2.txt');
      });

      it('should handle non-existent paths', () => {
        const debug = fs.debugPath('project/nonexistent');
        expect(debug).toContain('Type: non-existent');
        expect(debug).toContain('Exists: false');
      });
    });
  });
}); 