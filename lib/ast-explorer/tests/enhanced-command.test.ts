/**
 * Tests for the command-line interface functionality
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { setupTestFileSystem } from './utils/FsManager';
import { TracedAdapter } from './TracedAdapter';

// Mock the batch module
vi.mock('../src/batch', () => ({
  processExampleDirs: vi.fn(),
  processExamples: vi.fn(),
  loadExamples: vi.fn(() => [
    { name: 'text-example', directive: '@text greeting = "Hello, world!"' },
    { name: 'run-example', directive: '@run echo "Test command"' }
  ])
}));

// Import mocked modules
import { processExampleDirs, loadExamples, processExamples } from '../src/batch';

// Mock fs module to avoid actual filesystem operations
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('[]')
}));

// Import fs after mocking
import * as fs from 'fs';

// Import the command module after mocking
import { program, runCommand } from '../src/command';

describe('Command Interface', () => {
  let fsAdapter: TracedAdapter;
  let cleanup: () => Promise<void>;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AST = 'true';
    
    // Create isolated filesystem for testing
    const setup = setupTestFileSystem();
    fsAdapter = setup.fsAdapter;
    cleanup = setup.cleanup;
    
    // Mock console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(async () => {
    // Clean up and restore fs
    await cleanup();
    
    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.MOCK_AST;
    
    vi.restoreAllMocks();
  });

  describe('runCommand function', () => {
    it('should execute the process-all command with default options', () => {
      // Execute the command with minimal arguments
      runCommand('process-all', []);
      
      // Verify that processExampleDirs was called with default values
      expect(processExampleDirs).toHaveBeenCalled();
      
      // Verify console output indicates success
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processing examples'));
    });
    
    it('should execute the process-all command with custom options', () => {
      // Execute the command with custom arguments
      runCommand('process-all', [
        '--dir', './custom/examples',
        '--output', './custom/output',
        '--fixtures', './custom/fixtures',
        '--tests', './custom/tests',
        '--verbose'
      ]);
      
      // Verify directories are created
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalled();
      
      // Verify that processExampleDirs was called with custom values
      expect(processExampleDirs).toHaveBeenCalledWith(
        './custom/examples',   // custom examples dir
        './custom/output',     // custom output dir
        undefined,             // using default filesystem
        expect.objectContaining({
          testsDir: './custom/tests',        // custom tests dir
          fixturesDir: './custom/fixtures'   // custom fixtures dir
        })
      );
    });
    
    it('should execute the batch command with example file', () => {
      // Execute the batch command
      runCommand('batch', ['examples.json']);
      
      // Verify that loadExamples was called
      expect(loadExamples).toHaveBeenCalledWith('examples.json');
    });
    
    it('should execute the batch command with custom output directory', () => {
      // Execute the batch command with custom output
      runCommand('batch', ['examples.json', '--output', './custom-output', '--verbose']);
      
      // Verify that output directory is created
      expect(fs.existsSync).toHaveBeenCalledWith('./custom-output');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle errors in process-all command', () => {
      // Mock processExampleDirs to throw an error
      (processExampleDirs as any).mockImplementationOnce(() => {
        throw new Error('Test error');
      });
      
      // Execute the command
      runCommand('process-all', []);
      
      // Verify error handling
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', expect.stringContaining('Test error'));
    });
    
    it('should handle errors in batch command', () => {
      // Mock loadExamples to throw an error
      (loadExamples as any).mockImplementationOnce(() => {
        throw new Error('Cannot load examples');
      });
      
      // Execute the command
      runCommand('batch', ['examples.json', '--verbose']);
      
      // Verify error handling with stack trace in verbose mode
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', expect.stringContaining('Cannot load examples'));
    });
  });
});