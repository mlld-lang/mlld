import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of this file for relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ImportTestCase {
  name: string;
  description: string;
  files?: Record<string, string>;  // Local files to create
  mainScript: string;
  expectedOutput?: string;
  expectedError?: string | RegExp;
  expectedVariables?: Record<string, any>;
  env?: Record<string, string>;
  timeout?: number;
  debug?: boolean;
}

export interface TestResult {
  success: boolean;
  output: string;
  error: string;
  exitCode: number;
  duration: number;
}

export interface RunOptions {
  env?: Record<string, string>;
  timeout?: number;
  cwd?: string;
  debug?: boolean;
}

export interface RunResult {
  output: string;
  error: string;
  exitCode: number;
  duration: number;
}

// Helper to run mlld in subprocess for isolation
export async function runMLLD(
  scriptPath: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const startTime = Date.now();
  const mlldPath = path.join(__dirname, '../../../bin/mlld-wrapper.cjs');
  
  return new Promise((resolve) => {
    // Use the current node executable path to avoid PATH issues
    const nodeExecutable = process.execPath;
    const child = spawn(nodeExecutable, [mlldPath, scriptPath], {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ...options.env
      },
      timeout: options.timeout || 30000 // 30 second default timeout
    });
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (options.debug) {
        console.log('[STDOUT]', data.toString());
      }
    });
    
    child.stderr.on('data', (data) => {
      error += data.toString();
      if (options.debug) {
        console.log('[STDERR]', data.toString());
      }
    });
    
    child.on('close', (code) => {
      resolve({
        output,
        error,
        exitCode: code ?? 0,
        duration: Date.now() - startTime
      });
    });
    
    child.on('error', (err) => {
      resolve({
        output,
        error: err.message,
        exitCode: -1,
        duration: Date.now() - startTime
      });
    });
  });
}

export class ImportTestRunner {
  private tempDir: string | null = null;
  
  async setup(): Promise<void> {
    // Create a unique temp directory for this test run
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    this.tempDir = `/tmp/mlld-import-test-${timestamp}-${random}`;
    await fs.mkdir(this.tempDir, { recursive: true });
  }
  
  async runTest(testCase: ImportTestCase): Promise<TestResult> {
    if (!this.tempDir) {
      throw new Error('Test runner not set up. Call setup() first.');
    }
    
    const startTime = Date.now();
    
    try {
      // 1. Write local files if provided
      if (testCase.files) {
        for (const [filename, content] of Object.entries(testCase.files)) {
          const filePath = path.join(this.tempDir, filename);
          const fileDir = path.dirname(filePath);
          await fs.mkdir(fileDir, { recursive: true });
          await fs.writeFile(filePath, content, 'utf-8');
        }
      }
      
      // 2. Write main script
      const mainPath = path.join(this.tempDir, 'main.mld');
      await fs.writeFile(mainPath, testCase.mainScript, 'utf-8');
      
      // 3. Execute main script
      const result = await runMLLD(mainPath, {
        env: testCase.env,
        timeout: testCase.timeout,
        cwd: this.tempDir,
        debug: testCase.debug
      });
      
      // 4. Validate against expectations
      let success = true;
      
      if (testCase.expectedOutput !== undefined) {
        const actualOutput = result.output.trim();
        const expectedOutput = testCase.expectedOutput.trim();
        if (actualOutput !== expectedOutput) {
          success = false;
          if (testCase.debug) {
            console.log('Output mismatch:');
            console.log('Expected:', expectedOutput);
            console.log('Actual:', actualOutput);
          }
        }
      }
      
      if (testCase.expectedError !== undefined) {
        if (testCase.expectedError instanceof RegExp) {
          if (!testCase.expectedError.test(result.error)) {
            success = false;
            if (testCase.debug) {
              console.log('Error pattern mismatch:');
              console.log('Expected pattern:', testCase.expectedError);
              console.log('Actual error:', result.error);
            }
          }
        } else {
          if (!result.error.includes(testCase.expectedError)) {
            success = false;
            if (testCase.debug) {
              console.log('Error mismatch:');
              console.log('Expected to contain:', testCase.expectedError);
              console.log('Actual error:', result.error);
            }
          }
        }
      }
      
      // If we expected an error but got success, that's a failure
      if (testCase.expectedError && result.exitCode === 0) {
        success = false;
        if (testCase.debug) {
          console.log('Expected error but got success');
        }
      }
      
      // If we expected an error and got one, that's what we wanted
      if (testCase.expectedError && result.exitCode !== 0) {
        // The pattern matching was already done above
        // If we're here, we got an error as expected
        if (!success && result.error.length > 0) {
          // Pattern didn't match but we did get an error
          if (testCase.debug) {
            console.log('Got error but pattern did not match');
          }
        }
      }
      
      return {
        success,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        duration: Date.now() - startTime
      };
      
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message,
        exitCode: -1,
        duration: Date.now() - startTime
      };
    }
  }
  
  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await fs.rm(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
      this.tempDir = null;
    }
  }
}

// Utility function to create a simple test
export async function testImport(
  script: string,
  options: {
    files?: Record<string, string>;
    expectedOutput?: string;
    expectedError?: string | RegExp;
    env?: Record<string, string>;
  } = {}
): Promise<TestResult> {
  const runner = new ImportTestRunner();
  await runner.setup();
  
  try {
    const result = await runner.runTest({
      name: 'quick-test',
      description: 'Quick import test',
      mainScript: script,
      ...options
    });
    
    return result;
  } finally {
    await runner.cleanup();
  }
}

// Utility to check if we have a GitHub token for registry tests
export function hasGitHubToken(): boolean {
  return !!(process.env.GITHUB_TOKEN || process.env.MLLD_GITHUB_TOKEN);
}

// Skip registry tests if no token available
export const describeWithRegistry = hasGitHubToken() ? describe : describe.skip;