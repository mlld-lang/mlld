/**
 * Tests for the filesystem adapter implementation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs methods for isolation
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => 'test content'),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => ['file1.txt', 'file2.txt']),
  rmSync: vi.fn()
}));

// Import after mocking
import * as fs from 'fs';
import { NodeFsAdapter, nodeFsAdapter } from '../src/fs-adapter.js';

describe('Filesystem Adapter', () => {
  let adapter: NodeFsAdapter;
  
  beforeEach(() => {
    // Create a fresh adapter for each test
    adapter = new NodeFsAdapter();
    
    // Reset all mocks
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('NodeFsAdapter', () => {
    it('should implement the IFileSystemAdapter interface', () => {
      // Verify adapter has all required methods
      expect(adapter.writeFileSync).toBeDefined();
      expect(adapter.readFileSync).toBeDefined();
      expect(adapter.existsSync).toBeDefined();
      expect(adapter.mkdirSync).toBeDefined();
      expect(adapter.readdirSync).toBeDefined();
      expect(adapter.rmSync).toBeDefined();
      
      // Verify singleton instance
      expect(nodeFsAdapter).toBeInstanceOf(NodeFsAdapter);
    });
    
    it('should call writeFileSync with correct parameters', () => {
      // Call the method
      adapter.writeFileSync('test.txt', 'content', 'utf8');
      
      // Verify fs method was called with correct parameters
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(fs.writeFileSync).toHaveBeenCalledWith('test.txt', 'content', { encoding: 'utf8' });
    });
    
    it('should call writeFileSync without encoding if not provided', () => {
      // Call the method without encoding
      adapter.writeFileSync('test.txt', 'content');
      
      // Verify fs method was called without encoding option
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(fs.writeFileSync).toHaveBeenCalledWith('test.txt', 'content', undefined);
    });
    
    it('should call readFileSync and return string content', () => {
      // Call the method
      const result = adapter.readFileSync('test.txt', 'utf8');
      
      // Verify fs method was called with correct parameters
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).toHaveBeenCalledWith('test.txt', { encoding: 'utf8' });
      
      // Verify result is returned
      expect(result).toBe('test content');
    });
    
    it('should call readFileSync without encoding if not provided', () => {
      // Call the method without encoding
      const result = adapter.readFileSync('test.txt');
      
      // Verify fs method was called without encoding option
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).toHaveBeenCalledWith('test.txt', undefined);
      
      // Verify result is returned
      expect(result).toBe('test content');
    });
    
    it('should call existsSync and return the result', () => {
      // Call the method
      const result = adapter.existsSync('test.txt');
      
      // Verify fs method was called with correct parameters
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
      expect(fs.existsSync).toHaveBeenCalledWith('test.txt');
      
      // Verify result is returned
      expect(result).toBe(true);
    });
    
    it('should call mkdirSync with correct parameters', () => {
      // Call the method
      adapter.mkdirSync('test-dir', { recursive: true });
      
      // Verify fs method was called with correct parameters
      expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
      expect(fs.mkdirSync).toHaveBeenCalledWith('test-dir', { recursive: true });
    });
    
    it('should call readdirSync and return the result', () => {
      // Call the method
      const result = adapter.readdirSync('test-dir');
      
      // Verify fs method was called with correct parameters
      expect(fs.readdirSync).toHaveBeenCalledTimes(1);
      expect(fs.readdirSync).toHaveBeenCalledWith('test-dir');
      
      // Verify result is returned
      expect(result).toEqual(['file1.txt', 'file2.txt']);
    });
    
    it('should call rmSync with correct parameters', () => {
      // Call the method
      adapter.rmSync('test.txt', { recursive: true, force: true });
      
      // Verify fs method was called with correct parameters
      expect(fs.rmSync).toHaveBeenCalledTimes(1);
      expect(fs.rmSync).toHaveBeenCalledWith('test.txt', { recursive: true, force: true });
    });
  });
  
  describe('nodeFsAdapter singleton', () => {
    it('should be an instance of NodeFsAdapter', () => {
      expect(nodeFsAdapter).toBeInstanceOf(NodeFsAdapter);
    });
    
    it('should perform operations through the singleton instance', () => {
      // Call methods on the singleton
      nodeFsAdapter.writeFileSync('test.txt', 'content');
      const content = nodeFsAdapter.readFileSync('test.txt');
      
      // Verify fs methods were called
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.readFileSync).toHaveBeenCalled();
      expect(content).toBe('test content');
    });
  });
});