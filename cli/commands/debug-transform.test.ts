import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as debugTransformModule from './debug-transform.js';
import { container } from 'tsyringe';
import { StateService } from '@services/state/StateService/StateService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';

// Mock the services
vi.mock('@services/state/StateService/StateService.js');
vi.mock('@services/fs/FileSystemService/FileSystemService.js');
vi.mock('@services/pipeline/ParserService/ParserService.js');
vi.mock('@services/pipeline/DirectiveService/DirectiveService.js');
vi.mock('@services/pipeline/InterpreterService/InterpreterService.js');
vi.mock('@services/fs/FileSystemService/PathOperationsService.js');
vi.mock('@services/fs/FileSystemService/NodeFileSystem.js');
vi.mock('@services/state/StateEventService/StateEventService.js');

// Mock fs
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('Test content'),
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

// Save original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('debugTransformCommand', () => {
  let mockStateService;
  let mockFileSystemService;
  let mockParserService;
  let mockDirectiveService;
  let mockInterpreterService;
  
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Create mock services
    mockStateService = {
      getState: vi.fn().mockReturnValue({
        variables: {
          text: { greeting: 'Hello' },
          data: {}
        }
      }),
      getTextVar: vi.fn().mockReturnValue('Hello'),
      getDataVar: vi.fn().mockReturnValue({}),
      getPathVar: vi.fn().mockReturnValue('/test/path'),
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn()
    };
    
    mockFileSystemService = {
      readFile: vi.fn().mockResolvedValue('Test content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      resolvePath: vi.fn().mockResolvedValue('/test/project/test.meld')
    };
    
    mockParserService = {
      parse: vi.fn().mockReturnValue({
        type: 'document',
        children: [
          {
            type: 'directive',
            name: 'text',
            value: 'greeting = "Hello"',
            location: { line: 1, column: 1 },
            directive: { kind: 'text' }
          }
        ]
      })
    };
    
    mockDirectiveService = {
      processDirective: vi.fn().mockResolvedValue({
        replacement: {
          type: 'text',
          value: 'Hello',
          location: { line: 1, column: 1 },
          transformed: true
        }
      })
    };
    
    mockInterpreterService = {
      interpret: vi.fn().mockResolvedValue({
        type: 'document',
        children: [
          {
            type: 'text',
            value: 'Hello',
            location: { line: 1, column: 1 },
            transformed: true,
            interpreted: true
          }
        ]
      }),
      canHandleTransformations: vi.fn().mockReturnValue(true)
    };
    
    // Register mock services with the container
    container.register('StateService', { useValue: mockStateService });
    container.register('FileSystemService', { useValue: mockFileSystemService });
    container.register('ParserService', { useValue: mockParserService });
    container.register('DirectiveService', { useValue: mockDirectiveService });
    container.register('InterpreterService', { useValue: mockInterpreterService });
    
    // Mock console methods
    console.log = vi.fn();
    console.error = vi.fn();
  });
  
  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    
    // Clear container
    container.clearInstances();
  });
  
  it('should debug transformations for a file', async () => {
    // Call the command
    await debugTransformModule.debugTransformCommand({
      filePath: 'test.meld',
      outputFormat: 'json',
      includeContent: true
    });
    
    // Verify services were called
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith('test.meld');
    expect(mockParserService.parse).toHaveBeenCalled();
    expect(mockInterpreterService.interpret).toHaveBeenCalled();
    
    // Verify output was generated
    expect(console.log).toHaveBeenCalled();
  });
  
  it('should filter by directive type when specified', async () => {
    // Call the command with directive type filter
    await debugTransformModule.debugTransformCommand({
      filePath: 'test.meld',
      outputFormat: 'json',
      includeContent: true,
      directiveType: 'text'
    });
    
    // Verify output was generated with filter
    expect(console.log).toHaveBeenCalled();
  });
  
  it('should handle errors gracefully', async () => {
    // Make the parser throw an error
    mockParserService.parse.mockImplementation(() => {
      throw new Error('Parse error');
    });
    
    // Call the command
    await debugTransformModule.debugTransformCommand({
      filePath: 'test.meld',
      outputFormat: 'json'
    });
    
    // Verify error was logged
    expect(console.error).toHaveBeenCalled();
    const errorOutput = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(errorOutput).toContain('Error debugging transformations');
  });
}); 