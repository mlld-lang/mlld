import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('Ephemeral Mode (mlldx)', () => {
  const testScript = path.join(__dirname, 'test-ephemeral.mld');
  const mlldxPath = path.join(__dirname, '..', 'bin', 'mlldx-wrapper.cjs');
  
  beforeEach(async () => {
    // Create test script
    await fs.writeFile(testScript, `
/import { github } from @mlld/github
/import { env } from @mlld/env

/show "Testing ephemeral mode..."

>> Test that modules were loaded - check if functions exist
/when @github => /show "GitHub module loaded: true"
/when !@github => /show "GitHub module loaded: false"

/when @env => /show "Env module loaded: true"
/when !@env => /show "Env module loaded: false"

>> Test specific module functionality
/var @result = @env.get("TEST_VAR", "default")
/show \`Test var: @result\`
`.trim());
  });

  afterEach(async () => {
    await fs.remove(testScript);
  });

  it('should run mlldx with ephemeral mode', () => {
    const mlldxPath = path.join(__dirname, '..', 'bin', 'mlldx-wrapper.cjs');
    const result = execSync(`node ${mlldxPath} ${testScript}`, {
      encoding: 'utf8',
      env: { ...process.env, TEST_VAR: 'from-env' }
    });

    expect(result).toContain('Testing ephemeral mode...');
    expect(result).toContain('GitHub module loaded: true');
    expect(result).toContain('Env module loaded: true');
    expect(result).toContain('Test var: from-env');
  });

  it('should not persist cache between runs', () => {
    // First run
    execSync(`node ${mlldxPath} ${testScript}`, { encoding: 'utf8' });
    
    // Check that no cache directory was created
    const cacheDir = path.join(process.cwd(), '.mlld-cache');
    expect(fs.existsSync(cacheDir)).toBe(false);
    
    // Second run should also work (not rely on cache)
    const result = execSync(`node ${mlldxPath} ${testScript}`, { encoding: 'utf8' });
    expect(result).toContain('Testing ephemeral mode...');
  }, 10000);

  it('should auto-approve all imports', () => {
    // This test verifies that imports don't prompt for approval
    // The test would hang if approval was required
    const startTime = Date.now();
    
    const result = execSync(`node ${mlldxPath} ${testScript}`, {
      encoding: 'utf8',
      timeout: 5000 // 5 second timeout
    });
    
    const duration = Date.now() - startTime;
    
    // Should complete quickly without prompts
    expect(duration).toBeLessThan(3000);
    expect(result).toContain('Testing ephemeral mode...');
  });

  it('should handle missing modules gracefully', () => {
    const badScript = path.join(__dirname, 'test-bad-import.mld');
    
    fs.writeFileSync(badScript, `
/import { nonexistent } from @mlld/does-not-exist
/show "Should not reach here"
`.trim());
    
    try {
      expect(() => {
        execSync(`node ${mlldxPath} ${badScript}`, { encoding: 'utf8' });
      }).toThrow();
    } finally {
      fs.removeSync(badScript);
    }
  });

  it('should work with common CI environment variables', () => {
    const result = execSync(`node ${mlldxPath} ${testScript}`, {
      encoding: 'utf8',
      env: { 
        ...process.env, 
        CI: 'true', 
        GITHUB_ACTIONS: 'true',
        NODE_ENV: 'production',
        RUNNER_TEMP: '/tmp',
        GITHUB_WORKFLOW: 'test-workflow'
      }
    });
    
    expect(result).toContain('Testing ephemeral mode...');
    expect(result).toContain('GitHub module loaded: true');
    expect(result).toContain('Env module loaded: true');
  });

  it('should handle serverless environment variables', () => {
    const result = execSync(`node ${mlldxPath} ${testScript}`, {
      encoding: 'utf8',
      env: { 
        ...process.env, 
        AWS_LAMBDA_FUNCTION_NAME: 'test-function',
        LAMBDA_TASK_ROOT: '/var/task',
        VERCEL: '1',
        VERCEL_ENV: 'production',
        NOW_REGION: 'us-east-1'
      }
    });
    
    expect(result).toContain('Testing ephemeral mode...');
  });
});