import { describe, it, expect, beforeEach } from 'vitest';
import { TestSnapshot } from '../TestSnapshot';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';

describe('TestSnapshot', () => {
  let fs: MemfsTestFileSystem;
  let snapshot: TestSnapshot;

  beforeEach(() => {
    fs = new MemfsTestFileSystem();
    fs.initialize();
    snapshot = new TestSnapshot(fs);
  });

  describe('snapshot creation', () => {
    it('creates empty snapshot for empty filesystem', () => {
      const result = snapshot.takeSnapshot();
      expect(result.size).toBe(0);
    });

    it('captures single file state', () => {
      fs.writeFile('/project/test.txt', 'content');
      
      const result = snapshot.takeSnapshot();
      expect(result.size).toBe(1);
      expect(result.get('/project/test.txt')).toBe('content');
    });

    it('captures multiple files state', () => {
      fs.writeFile('/project/file1.txt', 'content1');
      fs.writeFile('/project/file2.txt', 'content2');
      
      const result = snapshot.takeSnapshot();
      expect(result.size).toBe(2);
      expect(result.get('/project/file1.txt')).toBe('content1');
      expect(result.get('/project/file2.txt')).toBe('content2');
    });

    it('captures nested directory structure', () => {
      fs.writeFile('/project/dir/nested/file.txt', 'content');
      
      const result = snapshot.takeSnapshot();
      expect(result.size).toBe(1);
      expect(result.get('/project/dir/nested/file.txt')).toBe('content');
    });
  });

  describe('directory-specific snapshots', () => {
    it('captures only files in specified directory', () => {
      fs.writeFile('/project/dir1/file1.txt', 'content1');
      fs.writeFile('/project/dir2/file2.txt', 'content2');
      
      const result = snapshot.takeSnapshot('/project/dir1');
      expect(result.size).toBe(1);
      expect(result.get('/project/dir1/file1.txt')).toBe('content1');
      expect(result.has('/project/dir2/file2.txt')).toBe(false);
    });

    it('includes nested files in directory snapshot', () => {
      fs.writeFile('/project/dir/file1.txt', 'content1');
      fs.writeFile('/project/dir/nested/file2.txt', 'content2');
      
      const result = snapshot.takeSnapshot('/project/dir');
      expect(result.size).toBe(2);
      expect(result.get('/project/dir/file1.txt')).toBe('content1');
      expect(result.get('/project/dir/nested/file2.txt')).toBe('content2');
    });

    it('returns empty snapshot for non-existent directory', () => {
      const result = snapshot.takeSnapshot('/project/nonexistent');
      expect(result.size).toBe(0);
    });
  });

  describe('snapshot comparison', () => {
    it('detects added files', () => {
      // Take initial snapshot
      const before = snapshot.takeSnapshot();
      
      // Add new file
      fs.writeFile('/project/new.txt', 'content');
      
      // Take after snapshot
      const after = snapshot.takeSnapshot();
      
      // Compare
      const diff = snapshot.compare(before, after);
      expect(diff.added).toContain('/project/new.txt');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('detects removed files', () => {
      // Create initial file
      fs.writeFile('/project/remove.txt', 'content');
      const before = snapshot.takeSnapshot();
      
      // Remove file
      fs.remove('/project/remove.txt');
      const after = snapshot.takeSnapshot();
      
      // Compare
      const diff = snapshot.compare(before, after);
      expect(diff.removed).toContain('/project/remove.txt');
      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('detects modified files', () => {
      // Create initial file
      fs.writeFile('/project/modify.txt', 'original');
      const before = snapshot.takeSnapshot();
      
      // Modify file
      fs.writeFile('/project/modify.txt', 'modified');
      const after = snapshot.takeSnapshot();
      
      // Compare
      const diff = snapshot.compare(before, after);
      expect(diff.modified).toContain('/project/modify.txt');
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });

    it('detects multiple changes', () => {
      // Initial state
      fs.writeFile('/project/keep.txt', 'keep');
      fs.writeFile('/project/modify.txt', 'original');
      fs.writeFile('/project/remove.txt', 'remove');
      const before = snapshot.takeSnapshot();
      
      // Make changes
      fs.writeFile('/project/modify.txt', 'modified');
      fs.writeFile('/project/new.txt', 'new');
      fs.remove('/project/remove.txt');
      const after = snapshot.takeSnapshot();
      
      // Compare
      const diff = snapshot.compare(before, after);
      expect(diff.added).toContain('/project/new.txt');
      expect(diff.removed).toContain('/project/remove.txt');
      expect(diff.modified).toContain('/project/modify.txt');
      expect(diff.added.length + diff.removed.length + diff.modified.length).toBe(3);
    });
  });

  describe('error handling', () => {
    it('handles comparison with empty snapshots', () => {
      const empty = new Map();
      const nonEmpty = new Map([['file.txt', 'content']]);
      
      const diff1 = snapshot.compare(empty, nonEmpty);
      expect(diff1.added).toContain('file.txt');
      
      const diff2 = snapshot.compare(nonEmpty, empty);
      expect(diff2.removed).toContain('file.txt');
    });

    it('handles undefined directory path gracefully', () => {
      const result = snapshot.takeSnapshot(undefined);
      expect(result).toBeDefined();
      expect(result instanceof Map).toBe(true);
    });
  });
}); 