import { describe, it, expect } from 'vitest';
import { MlldCommandExecutionError } from './MlldCommandExecutionError';
import { ErrorSeverity } from './MlldError';
import type { SourceLocation } from '@core/types';

describe('MlldCommandExecutionError', () => {
  it('should create error with basic information', () => {
    const error = new MlldCommandExecutionError('Command failed: npm test');
    
    expect(error.message).toBe('Command failed: npm test');
    expect(error.code).toBe('COMMAND_EXECUTION_FAILED');
    expect(error.severity).toBe(ErrorSeverity.Recoverable);
  });

  it('should create error with source location', () => {
    const location: SourceLocation = {
      line: 10,
      column: 5,
      filePath: '/test/demo.mld'
    };
    
    const error = new MlldCommandExecutionError('Command failed', location);
    
    expect(error.sourceLocation).toEqual(location);
  });

  it('should create error with command execution details', () => {
    const details = {
      command: 'npm test',
      exitCode: 1,
      duration: 2000,
      stdout: 'Test output',
      stderr: 'Test failed',
      workingDirectory: '/test',
      directiveType: 'run'
    };
    
    const error = new MlldCommandExecutionError('Command failed', undefined, details);
    
    expect(error.details).toEqual(details);
  });

  it('should use static create method', () => {
    const location: SourceLocation = {
      line: 20,
      column: 1,
      filePath: '/test/example.mld'
    };
    
    const error = MlldCommandExecutionError.create(
      'npm test',
      1,
      1500,
      location,
      {
        stdout: 'Test output',
        stderr: 'Test error',
        workingDirectory: '/project',
        directiveType: 'run'
      }
    );
    
    expect(error.message).toBe('Command execution failed: npm test');
    expect(error.sourceLocation).toEqual(location);
    expect(error.details?.command).toBe('npm test');
    expect(error.details?.exitCode).toBe(1);
    expect(error.details?.duration).toBe(1500);
    expect(error.details?.workingDirectory).toBe('/project');
  });

  it('should provide default working directory if not specified', () => {
    const error = MlldCommandExecutionError.create('echo test', 0, 100);
    
    expect(error.details?.workingDirectory).toBe(process.cwd());
  });
});