import { describe, it, expect } from 'vitest';
import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import { MlldCommandExecutionError } from '@core/errors/MlldCommandExecutionError';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Enhanced Error Display', () => {
  it('should display source context with visual pointer', async () => {
    // Create test source code
    const source = `/define foo "bar"
/run echo "hello"
/define baz "qux"`;

    // Create mock environment
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, '/test');
    
    // Initialize built-in resolvers
    await env.registerBuiltinResolvers();
    
    // Cache the source
    env.cacheSource('test.mld', source);
    
    // Create an error with location
    const error = new MlldError('Test error message', {
      code: 'TEST_ERROR',
      severity: ErrorSeverity.Recoverable,
      sourceLocation: {
        filePath: 'test.mld',
        line: 2,
        column: 6
      },
      env
    });
    
    // Get the string representation
    const errorString = error.toString();
    
    // Verify error includes location
    expect(errorString).toContain('at test.mld:2:6');
    
    // Verify error includes source context
    expect(errorString).toContain('/define foo "bar"');
    expect(errorString).toContain('    2 | /run echo "hello"');
    expect(errorString).toContain('/define baz "qux"');
    
    // Verify pointer is at correct position (column 6)
    expect(errorString).toContain('       |      ^');
  });

  it('should display command execution errors with context', async () => {
    // Create test source
    const source = `/run invalid-command --flag
/define result "success"`;

    // Create mock environment
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, '/test');
    
    // Initialize built-in resolvers
    await env.registerBuiltinResolvers();
    
    // Cache the source
    env.cacheSource('commands.mld', source);
    
    // Create command execution error
    const error = new MlldCommandExecutionError(
      'Command not found: invalid-command',
      {
        filePath: 'commands.mld',
        line: 1,
        column: 6
      },
      {
        command: 'invalid-command --flag',
        exitCode: 127,
        duration: 50,
        stderr: 'invalid-command: command not found',
        workingDirectory: '/test',
        directiveType: 'run'
      },
      env
    );
    
    // Get the string representation
    const errorString = error.toString();
    
    // Verify error message
    expect(errorString).toContain('Command not found: invalid-command');
    expect(errorString).toContain('at commands.mld:1:6');
    
    // Verify source context
    expect(errorString).toContain('    1 | /run invalid-command --flag');
    expect(errorString).toContain('       |      ^'); // Pointer at column 6
  });

  it('should handle missing source gracefully', async () => {
    // Create environment without cached source
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, '/test');
    
    // Initialize built-in resolvers
    await env.registerBuiltinResolvers();
    
    // Create error without cached source
    const error = new MlldError('Error without source', {
      code: 'NO_SOURCE',
      severity: ErrorSeverity.Fatal,
      sourceLocation: {
        filePath: 'missing.mld',
        line: 10,
        column: 5
      },
      env
    });
    
    const errorString = error.toString();
    
    // Should still show location
    expect(errorString).toContain('at missing.mld:10:5');
    
    // But no source context
    expect(errorString).not.toContain('|');
    expect(errorString).not.toContain('^');
  });

  it('should handle multi-line context correctly', async () => {
    // Create source with many lines
    const source = `/define a "1"
/define b "2"
/define c "3"
/run broken-here
/define d "4"
/define e "5"
/define f "6"`;

    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, '/test');
    
    // Initialize built-in resolvers
    await env.registerBuiltinResolvers();
    
    env.cacheSource('multiline.mld', source);
    
    const error = new MlldError('Error in middle of file', {
      code: 'MIDDLE_ERROR',
      severity: ErrorSeverity.Recoverable,
      sourceLocation: {
        filePath: 'multiline.mld',
        line: 4,
        column: 6
      },
      env
    });
    
    const errorString = error.toString();
    
    // Should show 2 lines before and after
    expect(errorString).toContain('/define b "2"');
    expect(errorString).toContain('/define c "3"');
    expect(errorString).toContain('    4 | /run broken-here');
    expect(errorString).toContain('/define d "4"');
    expect(errorString).toContain('/define e "5"');
    
    // Should not show lines too far away
    expect(errorString).not.toContain('/define a "1"');
    expect(errorString).not.toContain('/define f "6"');
  });
});