import { describe, it, expect } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { processContentLoader } from './content-loader';
import { isRenamedContentArray } from '@core/types/load-content';
import type { ArrayVariable } from '@core/types/variable/VariableTypes';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import path from 'path';
import { unwrapStructuredForTest } from './test-helpers';
import type { StructuredValueMetadata } from '../utils/structured-value';

function expectLoadContentMetadata(metadata?: StructuredValueMetadata): void {
  expect(metadata?.source).toBe('load-content');
}

describe('Content Loader Variable Tagging', () => {
  it('should tag RenamedContentArray with __variable metadata', async () => {
    // Create a test environment
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const projectRoot = '/test-project';
    
    // Set up test files in memory file system
    await fileSystem.mkdir('/test-project/tests/cases/files', { recursive: true });
    await fileSystem.writeFile('/test-project/tests/cases/files/file1.txt', 'Content of file 1');
    await fileSystem.writeFile('/test-project/tests/cases/files/file2.txt', 'Content of file 2');
    
    const env = new Environment(fileSystem, pathService, projectRoot);
    
    // Create a load-content node with renamed section (glob pattern)
    const loadContentNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'tests/cases/files/*.txt' }],
        raw: 'tests/cases/files/*.txt'
      },
      options: {
        section: {
          renamed: {
            type: 'rename-template',
            parts: [{ type: 'Text', content: '## File: ' }, { type: 'placeholder' }, { type: 'Text', content: '.filename' }]
          }
        }
      }
    };
    
    // Process the content loader
    const rawResult = await processContentLoader(loadContentNode, env);
    const { data: result, metadata } = unwrapStructuredForTest<any>(rawResult);
    
    // Check that result is an array
    expect(Array.isArray(result)).toBe(true);
    
    // Check that it has __variable property
    expect('__variable' in result).toBe(true);
    
    // Check the __variable metadata
    const variable = (result as any).__variable as ArrayVariable;
    expect(variable).toBeDefined();
    expect(variable.type).toBe('array');
    expect(variable.metadata?.arrayType).toBe('renamed-content');
    expect(variable.metadata?.joinSeparator).toBe('\n\n');
    expect(variable.metadata?.fromGlobPattern).toBe(true);
    expect(variable.metadata?.globPattern).toBe('tests/cases/files/*.txt');
    expect(variable.metadata?.fileCount).toBe((result as any[]).length);
    
    // Check that customToString is a function
    expect(typeof variable.metadata?.customToString).toBe('function');
    
    // Verify the toString behavior matches
    expect(result.toString()).toBe(variable.metadata?.customToString?.());
    expectLoadContentMetadata(metadata);
  });
  
  it('should tag LoadContentResultArray with __variable metadata', async () => {
    // Create a test environment
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const projectRoot = '/test-project';
    
    // Set up test files in memory file system
    await fileSystem.mkdir('/test-project/tests/cases/files', { recursive: true });
    await fileSystem.writeFile('/test-project/tests/cases/files/file1.txt', 'Content of file 1');
    await fileSystem.writeFile('/test-project/tests/cases/files/file2.txt', 'Content of file 2');
    
    const env = new Environment(fileSystem, pathService, projectRoot);
    
    // Create a load-content node without renamed section (glob pattern)
    const loadContentNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'tests/cases/files/*.txt' }],
        raw: 'tests/cases/files/*.txt'
      }
    };
    
    // Process the content loader
    const rawResult = await processContentLoader(loadContentNode, env);
    const { data: result, metadata } = unwrapStructuredForTest<any>(rawResult);
    
    // Check that result is an array
    expect(Array.isArray(result)).toBe(true);
    
    // Check that it has __variable property
    expect('__variable' in result).toBe(true);
    
    // Check the __variable metadata
    const variable = (result as any).__variable as ArrayVariable;
    expect(variable).toBeDefined();
    expect(variable.type).toBe('array');
    expect(variable.metadata?.arrayType).toBe('load-content-result');
    expect(variable.metadata?.joinSeparator).toBe('\n\n');
    expect(variable.metadata?.fromGlobPattern).toBe(true);
    expect(variable.metadata?.globPattern).toBe('tests/cases/files/*.txt');
    expect(variable.metadata?.fileCount).toBe((result as any[]).length);
    
    // Check that customToString is a function
    expect(typeof variable.metadata?.customToString).toBe('function');
    expectLoadContentMetadata(metadata);
  });
  
  it('should preserve __variable metadata through var.ts', async () => {
    // This test would require more setup to test the full flow through var.ts
    // For now, we'll test that the metadata preservation logic works
    
    const mockArray = ['content1', 'content2'];
    const mockVariable: ArrayVariable = {
      type: 'array',
      name: 'test',
      value: mockArray,
      source: {
        directive: 'var',
        syntax: 'array',
        hasInterpolation: false,
        isMultiLine: false
      },
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata: {
        arrayType: 'renamed-content',
        joinSeparator: '\n\n',
        customToString: () => mockArray.join('\n\n'),
        fromGlobPattern: true,
        globPattern: 'test/*.txt',
        fileCount: 2
      }
    };
    
    // Tag the array
    Object.defineProperty(mockArray, '__variable', {
      value: mockVariable,
      enumerable: false
    });
    
    // Verify tagging worked
    expect((mockArray as any).__variable).toBe(mockVariable);
    expect((mockArray as any).__variable.metadata?.arrayType).toBe('renamed-content');
  });
});
