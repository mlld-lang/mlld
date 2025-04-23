import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('MemoryFileSystem', () => {
  let fs: MemoryFileSystem;
  
  beforeEach(() => {
    fs = new MemoryFileSystem();
  });
  
  // Test basic file operations
  it('should write and read files', async () => {
    const filePath = '/test.txt';
    const content = 'Hello, World!';
    
    await fs.writeFile(filePath, content);
    const result = await fs.readFile(filePath);
    
    expect(result).toBe(content);
  });
  
  it('should check if a file exists', async () => {
    const filePath = '/test.txt';
    const content = 'Hello, World!';
    
    await fs.writeFile(filePath, content);
    
    const exists = await fs.exists(filePath);
    expect(exists).toBe(true);
    
    const notExists = await fs.exists('/nonexistent.txt');
    expect(notExists).toBe(false);
  });
  
  it('should check if a path is a file', async () => {
    const filePath = '/test.txt';
    const dirPath = '/test-dir';
    
    await fs.writeFile(filePath, 'content');
    await fs.mkdir(dirPath);
    
    const isFile = await fs.isFile(filePath);
    expect(isFile).toBe(true);
    
    const isDirFile = await fs.isFile(dirPath);
    expect(isDirFile).toBe(false);
  });
  
  it('should check if a path is a directory', async () => {
    const filePath = '/test.txt';
    const dirPath = '/test-dir';
    
    await fs.writeFile(filePath, 'content');
    await fs.mkdir(dirPath);
    
    const isDir = await fs.isDirectory(dirPath);
    expect(isDir).toBe(true);
    
    const isFileDir = await fs.isDirectory(filePath);
    expect(isFileDir).toBe(false);
  });
  
  // Test directory operations
  it('should create directories', async () => {
    const dirPath = '/test-dir';
    
    await fs.mkdir(dirPath);
    
    const exists = await fs.exists(dirPath);
    expect(exists).toBe(true);
    
    const isDir = await fs.isDirectory(dirPath);
    expect(isDir).toBe(true);
  });
  
  it('should create nested directories with recursive option', async () => {
    const nestedDirPath = '/parent/child/grandchild';
    
    await fs.mkdir(nestedDirPath, { recursive: true });
    
    const exists = await fs.exists(nestedDirPath);
    expect(exists).toBe(true);
    
    const parentExists = await fs.exists('/parent');
    expect(parentExists).toBe(true);
    
    const childExists = await fs.exists('/parent/child');
    expect(childExists).toBe(true);
  });
  
  it('should list directory contents', async () => {
    const dirPath = '/test-dir';
    
    await fs.mkdir(dirPath);
    await fs.writeFile(`${dirPath}/file1.txt`, 'content1');
    await fs.writeFile(`${dirPath}/file2.txt`, 'content2');
    await fs.mkdir(`${dirPath}/subdir`);
    
    const contents = await fs.readDir(dirPath);
    
    expect(contents).toHaveLength(3);
    expect(contents).toContain('file1.txt');
    expect(contents).toContain('file2.txt');
    expect(contents).toContain('subdir');
  });
  
  // Test file stats
  it('should get file stats', async () => {
    const filePath = '/test.txt';
    const content = 'Hello, World!';
    
    await fs.writeFile(filePath, content);
    
    const stats = await fs.stat(filePath);
    
    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.size).toBe(content.length);
  });
  
  it('should get directory stats', async () => {
    const dirPath = '/test-dir';
    
    await fs.mkdir(dirPath);
    
    const stats = await fs.stat(dirPath);
    
    expect(stats.isFile()).toBe(false);
    expect(stats.isDirectory()).toBe(true);
  });
  
  // Test file renaming
  it('should rename files', async () => {
    const oldPath = '/old.txt';
    const newPath = '/new.txt';
    const content = 'Hello, World!';
    
    await fs.writeFile(oldPath, content);
    await fs.rename(oldPath, newPath);
    
    const oldExists = await fs.exists(oldPath);
    expect(oldExists).toBe(false);
    
    const newExists = await fs.exists(newPath);
    expect(newExists).toBe(true);
    
    const newContent = await fs.readFile(newPath);
    expect(newContent).toBe(content);
  });
  
  // Test file deletion
  it('should delete files', async () => {
    const filePath = '/test.txt';
    
    await fs.writeFile(filePath, 'content');
    await fs.unlink(filePath);
    
    const exists = await fs.exists(filePath);
    expect(exists).toBe(false);
  });
  
  // Test directory deletion
  it('should delete empty directories', async () => {
    const dirPath = '/test-dir';
    
    await fs.mkdir(dirPath);
    await fs.rmdir(dirPath);
    
    const exists = await fs.exists(dirPath);
    expect(exists).toBe(false);
  });
  
  it('should fail to delete non-empty directories', async () => {
    const dirPath = '/test-dir';
    
    await fs.mkdir(dirPath);
    await fs.writeFile(`${dirPath}/file.txt`, 'content');
    
    await expect(fs.rmdir(dirPath)).rejects.toThrow();
  });
  
  // Test error cases
  it('should throw when reading a non-existent file', async () => {
    await expect(fs.readFile('/nonexistent.txt')).rejects.toThrow();
  });
  
  it('should throw when getting stats for a non-existent path', async () => {
    await expect(fs.stat('/nonexistent.txt')).rejects.toThrow();
  });
  
  // No-op implementations
  it('should have a no-op watch implementation', async () => {
    const watcher = fs.watch('/some/path');
    
    // Just make sure it doesn't throw
    expect(watcher).toBeDefined();
  });
  
  it('should have a no-op executeCommand implementation', async () => {
    const result = await fs.executeCommand('echo "test"');
    
    expect(result).toEqual({
      stdout: '',
      stderr: ''
    });
  });
  
  it('should have a no-op setFileSystem implementation', () => {
    // Just make sure it doesn't throw
    expect(() => fs.setFileSystem({} as any)).not.toThrow();
  });
}); 