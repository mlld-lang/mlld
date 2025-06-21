import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('NodeShadowEnvironment process exit', () => {
  const testDir = path.join(__dirname, 'temp-test-files');
  
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  it('should exit cleanly when Node shadow environment has timers', async () => {
    // Create a test file that uses Node shadow environment with timers
    const testFile = path.join(testDir, 'timer-test.mld');
    const content = `
# Test Node Shadow Environment Cleanup

@exec createTimer(delay) = node [(
  console.error('Setting timer for ' + delay + 'ms');
  
  // This timer would normally keep the process alive
  setTimeout(() => {
    console.error('Timer fired after ' + delay + 'ms');
  }, delay);
  
  // Also set an interval
  let count = 0;
  setInterval(() => {
    count++;
    console.error('Interval tick ' + count);
  }, 100);
  
  return 'Timers set';
)]

@exec node = { createTimer }

@text result = @createTimer(5000)
@add [[Result: {{result}}]]
`;
    
    await fs.writeFile(testFile, content);
    
    // Run mlld with the test file
    const startTime = Date.now();
    const result = await runMlldProcess(['--stdout', testFile]);
    const duration = Date.now() - startTime;
    
    // Process should exit quickly, not wait for timers
    expect(duration).toBeLessThan(2000); // Should exit in less than 2 seconds
    expect(result.stdout).toContain('Result: Timers set');
    expect(result.exitCode).toBe(0);
    
    // Check stderr for timer messages - they should NOT appear
    expect(result.stderr).not.toContain('Timer fired after 5000ms');
    expect(result.stderr).not.toContain('Interval tick');
  });
  
  it('should exit cleanly with multiple shadow environments', async () => {
    const testFile = path.join(testDir, 'multiple-env-test.mld');
    const content = `
# Test Multiple Shadow Environments

@exec jsTimer() = js [(
  setTimeout(() => console.log('JS timer'), 1000);
  return 'JS timer set';
)]

@exec nodeTimer() = node [(
  setTimeout(() => console.log('Node timer'), 1000);
  return 'Node timer set';
)]

@exec js = { jsTimer }
@exec node = { nodeTimer }

@text jsResult = @jsTimer()
@text nodeResult = @nodeTimer()

@add [[JS: {{jsResult}}]]
@add [[Node: {{nodeResult}}]]
`;
    
    await fs.writeFile(testFile, content);
    
    const startTime = Date.now();
    const result = await runMlldProcess(['--stdout', testFile]);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(2000);
    expect(result.stdout).toContain('JS: JS timer set');
    expect(result.stdout).toContain('Node: Node timer set');
    expect(result.exitCode).toBe(0);
  });
  
  it('should handle errors and still exit cleanly', async () => {
    const testFile = path.join(testDir, 'error-with-timer.mld');
    const content = `
@exec buggyTimer() = node [(
  // Set a timer that would keep process alive
  setTimeout(() => {
    console.error('This should not execute');
  }, 10000);
  
  // Then throw an error
  throw new Error('Intentional error');
)]

@exec node = { buggyTimer }

@text result = @buggyTimer()
`;
    
    await fs.writeFile(testFile, content);
    
    const startTime = Date.now();
    const result = await runMlldProcess(['--stdout', testFile]);
    const duration = Date.now() - startTime;
    
    // Should exit quickly even with error
    expect(duration).toBeLessThan(2000);
    expect(result.exitCode).not.toBe(0); // Should have error exit code
    expect(result.stderr).toContain('Intentional error');
    expect(result.stderr).not.toContain('This should not execute');
  });
});

/**
 * Helper function to run mlld in a subprocess
 */
function runMlldProcess(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    // Use the mlld wrapper script
    const mlldPath = path.join(__dirname, '../../bin/mlld-wrapper.cjs');
    const child = spawn('node', [mlldPath, ...args], {
      timeout: 10000, // Kill after 10 seconds if still running
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0
      });
    });
    
    child.on('error', (err) => {
      resolve({
        stdout,
        stderr,
        exitCode: 1
      });
    });
  });
}