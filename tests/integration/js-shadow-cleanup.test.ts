import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

describe('JavaScriptShadowEnvironment process exit', () => {
  let testDir: string;
  
  beforeEach(async () => {
    testDir = `/tmp/mlld-js-shadow-test-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  it('should handle errors and still exit cleanly', { timeout: 10000 }, async () => {
    const testFile = path.join(testDir, 'error-test.mld');
    const content = `
/exe @jsError() = js {
  throw new Error('JavaScript test error');
}

/exe js = { jsError }

/var @result = @jsError()
`;
    
    await fs.writeFile(testFile, content);
    
    const startTime = Date.now();
    const result = await runMlldProcess(['--stdout', testFile]);
    const duration = Date.now() - startTime;
    
    // Should exit quickly even with error
    expect(duration).toBeLessThan(5000);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('JavaScript test error');
  });
});

/**
 * Helper function to run mlld in a subprocess
 * COPIED from tests/integration/node-shadow-cleanup.test.ts
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