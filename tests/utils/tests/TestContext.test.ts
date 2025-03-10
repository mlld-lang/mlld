import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import * as path from 'path';

describe('TestContext', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    
    // Ensure project directory exists for tests
    await context.fs.mkdir('/project', { recursive: true });
    
    // Write a mock console message to help debug test failures
    console.log('TestContext initialized with filesystem root at:', context.fs.getCwd());
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('initialization', () => {
    it('initializes with default fixtures directory', () => {
      const newContext = new TestContext();
      expect(newContext.fixtures).toBeDefined();
    });

    it('initializes with custom fixtures directory', () => {
      const newContext = new TestContext('custom/fixtures');
      expect(newContext.fixtures).toBeDefined();
    });
  });

  describe('file operations', () => {
    it('writes and reads files', async () => {
      const content = 'test content';
      
      // Use project-relative path which is likely to work with the test FS
      const testFilePath = '/project/test.txt';
      
      // Write file using project-relative path
      await context.fs.writeFile(testFilePath, content);
      console.log('File written to:', testFilePath);
      
      // Verify file was written correctly
      const exists = await context.fs.exists(testFilePath);
      console.log('File existence check:', testFilePath, exists);
      expect(exists).toBe(true);
      
      // Read the file contents
      const result = await context.fs.readFile(testFilePath);
      expect(result).toBe(content);
    });
  });

  describe('meld parsing', () => {
    it('parses meld content', async () => {
      const content = '@text greeting = "Hello"';
      const ast = await context.parseMeld(content);

      expect(ast).toHaveLength(1);
      expect(ast.at(0).type).toBe('Directive');
      expect(ast.at(0).directive).toBeDefined();
      expect(ast.at(0).directive.kind).toBe('text');
      expect(ast.at(0).directive.identifier).toBe('greeting');
      expect(ast.at(0).directive.value).toBe('Hello');
    });

    it('parses meld content with locations', async () => {
      const content = '@text greeting = "Hello"';
      const ast = await context.parseMeldWithLocations(content, 'test.meld');

      expect(ast).toHaveLength(1);
      expect(ast.at(0).type).toBe('Directive');
      expect(ast.at(0).directive).toBeDefined();
      expect(ast.at(0).directive.kind).toBe('text');
      expect(ast.at(0).directive.identifier).toBe('greeting');
      expect(ast.at(0).directive.value).toBe('Hello');
      expect(ast.at(0).location).toBeDefined();
      expect(ast.at(0).location.start).toBeDefined();
      expect(ast.at(0).location.end).toBeDefined();
      expect(ast.at(0).location.filePath).toBe('test.meld');
    });
  });

  describe('xml conversion', () => {
    it('converts content to xml', async () => {
      const content = '# Test\nHello world';
      const xml = await context.toXML(content);
      expect(xml).toContain('<Test>');
      expect(xml).toContain('Hello world');
      expect(xml).toContain('</Test>');
    });
  });

  describe('project creation', () => {
    it('creates a basic project structure', async () => {
      await context.createBasicProject();
      expect(await context.fs.exists('/project')).toBe(true);
    });
  });

  describe('snapshot functionality', () => {
    it('takes and compares snapshots', async () => {
      // Initial state
      const before = await context.takeSnapshot();
      
      // Make some changes
      await context.writeFile('test.txt', 'content');
      
      // Take after snapshot
      const after = await context.takeSnapshot();
      
      // Compare
      const diff = context.compareSnapshots(before, after);
      expect(diff.added).toContain('/test.txt');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('takes snapshots of specific directories', async () => {
      // Ensure directories exist first using project-relative paths
      await context.fs.mkdir('/project/dir1', { recursive: true });
      await context.fs.mkdir('/project/dir2', { recursive: true });
      console.log('Created test directories');
      
      // Then write the files with project-relative paths
      await context.fs.writeFile('/project/dir1/test1.txt', 'content1');
      await context.fs.writeFile('/project/dir2/test2.txt', 'content2');
      console.log('Written test files to directories');
      
      // Take snapshot and verify - use project paths consistently
      const snapshot = await context.takeSnapshot('/project/dir1');
      console.log('Snapshot files:', Array.from(snapshot.keys()));
      
      // Verify snapshot contents
      expect(snapshot.has('/project/dir1/test1.txt')).toBe(true);
      expect(snapshot.has('/project/dir2/test2.txt')).toBe(false);
    });
  });

  describe('test factories', () => {
    it('provides access to test factories', () => {
      expect(context.factory).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('cleans up resources properly', async () => {
      // Create test file with project-relative path
      const testFilePath = '/project/cleanup-test.txt';
      await context.fs.writeFile(testFilePath, 'cleanup test content');
      console.log('Created cleanup test file at:', testFilePath);
      
      // Verify it exists before cleanup
      const exists = await context.fs.exists(testFilePath);
      console.log('File exists before cleanup:', exists);
      expect(exists).toBe(true);
      
      // Cleanup - this should reset the file system
      await context?.cleanup();
      console.log('Cleanup completed');
      
      // Re-initialize the file system to ensure test consistency
      await context.initialize();
      console.log('Re-initialized file system');
      
      // Verify the file is gone after cleanup
      const existsAfterCleanup = await context.fs.exists(testFilePath);
      console.log('File exists after cleanup:', existsAfterCleanup);
      expect(existsAfterCleanup).toBe(false);
    });
  });
}); 