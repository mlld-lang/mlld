import { describe, it, expect, beforeEach } from 'vitest';
import { TestSnapshot } from '@tests/utils/TestSnapshot.js';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';

describe('TestSnapshot', () => {
  let fs: MemfsTestFileSystem;
  let snapshot: TestSnapshot;

  beforeEach(async () => {
    fs = new MemfsTestFileSystem();
    fs.initialize();
    snapshot = new TestSnapshot(fs);
    // Ensure project directory exists
    await fs.mkdir('/project');
  });

  describe('snapshot creation', () => {
    it('creates empty snapshot for empty filesystem', async () => {
      const result = await snapshot.takeSnapshot();
      expect(result.size).toBe(0);
    });

    it('captures single file state', async () => {
      await fs.writeFile('/project/test.txt', 'content');
      
      const result = await snapshot.takeSnapshot();
      expect(result.size).toBe(1);
      expect(result.get('/project/test.txt')).toBe('content');
    });

    it('captures multiple files state', async () => {
      await fs.writeFile('/project/file1.txt', 'content1');
      await fs.writeFile('/project/file2.txt', 'content2');
      
      const result = await snapshot.takeSnapshot();
      expect(result.size).toBe(2);
      expect(result.get('/project/file1.txt')).toBe('content1');
      expect(result.get('/project/file2.txt')).toBe('content2');
    });

    it('captures nested directory structure', async () => {
      await fs.writeFile('/project/dir/nested/file.txt', 'content');
      
      const result = await snapshot.takeSnapshot();
      expect(result.size).toBe(1);
      expect(result.get('/project/dir/nested/file.txt')).toBe('content');
    });
  });

  describe('directory-specific snapshots', () => {
    it('captures only files in specified directory', async () => {
      await fs.writeFile('/project/dir1/file1.txt', 'content1');
      await fs.writeFile('/project/dir2/file2.txt', 'content2');
      
      const result = await snapshot.takeSnapshot('/project/dir1');
      expect(result.size).toBe(1);
      expect(result.get('/project/dir1/file1.txt')).toBe('content1');
      expect(result.has('/project/dir2/file2.txt')).toBe(false);
    });

    it('includes nested files in directory snapshot', async () => {
      await fs.writeFile('/project/dir/file1.txt', 'content1');
      await fs.writeFile('/project/dir/nested/file2.txt', 'content2');
      
      const result = await snapshot.takeSnapshot('/project/dir');
      expect(result.size).toBe(2);
      expect(result.get('/project/dir/file1.txt')).toBe('content1');
      expect(result.get('/project/dir/nested/file2.txt')).toBe('content2');
    });

    it('returns empty snapshot for non-existent directory', async () => {
      const result = await snapshot.takeSnapshot('/project/nonexistent');
      expect(result.size).toBe(0);
    });
  });

  describe('snapshot comparison', () => {
    it('detects added files', async () => {
      // Take initial snapshot
      const before = await snapshot.takeSnapshot();
      
      // Add new file
      await fs.writeFile('/project/new.txt', 'content');
      
      // Take after snapshot
      const after = await snapshot.takeSnapshot();
      
      // Compare
      const diff = snapshot.compare(before, after);
      console.log('Added files:', diff.added);
      expect(diff.added).toContain('/new.txt');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('detects removed files', async () => {
      // Create initial file
      await fs.writeFile('/project/remove.txt', 'content');
      const before = await snapshot.takeSnapshot();
      
      // Remove file
      await fs.remove('/project/remove.txt');
      const after = await snapshot.takeSnapshot();
      
      // Compare
      const diff = snapshot.compare(before, after);
      console.log('Removed files:', diff.removed);
      expect(diff.removed).toContain('/remove.txt');
      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('detects modified files', async () => {
      // Create initial file
      await fs.writeFile('/project/modify.txt', 'original');
      const before = await snapshot.takeSnapshot();
      
      // Modify file
      await fs.writeFile('/project/modify.txt', 'modified');
      const after = await snapshot.takeSnapshot();
      
      // Compare
      const diff = snapshot.compare(before, after);
      console.log('Modified files:', diff.modified);
      expect(diff.modified).toContain('/modify.txt');
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modifiedContents.get('/modify.txt')).toBe('modified');
    });

    it('detects multiple changes', async () => {
      // Initial state
      await fs.writeFile('/project/keep.txt', 'keep');
      await fs.writeFile('/project/modify.txt', 'original');
      await fs.writeFile('/project/remove.txt', 'remove');
      const before = await snapshot.takeSnapshot();
      
      // Make changes
      await fs.writeFile('/project/modify.txt', 'modified');
      await fs.writeFile('/project/new.txt', 'new');
      await fs.remove('/project/remove.txt');
      const after = await snapshot.takeSnapshot();
      
      // Compare
      const diff = snapshot.compare(before, after);
      console.log('Multiple changes - added:', diff.added);
      console.log('Multiple changes - removed:', diff.removed);
      console.log('Multiple changes - modified:', diff.modified);
      expect(diff.added).toContain('/new.txt');
      expect(diff.removed).toContain('/remove.txt');
      expect(diff.modified).toContain('/modify.txt');
      expect(diff.added.length + diff.removed.length + diff.modified.length).toBe(3);
      expect(diff.modifiedContents.get('/modify.txt')).toBe('modified');
    });
  });

  describe('error handling', () => {
    it('handles comparison with empty snapshots', () => {
      const empty = new Map();
      const nonEmpty = new Map([['/file.txt', 'content']]);
      
      const diff1 = snapshot.compare(empty, nonEmpty);
      console.log('Empty snapshot diff1 added:', diff1.added);
      expect(diff1.added).toContain('/file.txt');
      
      const diff2 = snapshot.compare(nonEmpty, empty);
      console.log('Empty snapshot diff2 removed:', diff2.removed);
      expect(diff2.removed).toContain('/file.txt');
    });

    it('handles undefined directory path gracefully', async () => {
      const result = await snapshot.takeSnapshot(undefined);
      expect(result).toBeDefined();
      expect(result instanceof Map).toBe(true);
    });
  });
}); 