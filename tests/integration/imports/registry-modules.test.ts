import { describe, it, expect } from 'vitest';
import { testImport, describeWithRegistry, hasGitHubToken } from './test-utils';

// Only run these tests if we have a GitHub token
describeWithRegistry('Registry Module Import Tests', () => {
  describe('Core Registry Modules', () => {
    it('should import and use @mlld/env module', async () => {
      const result = await testImport(`
/import { env } from @mlld/env
/import { USER, HOME } from @input

>> Get environment info
/var @info = @env.getAll(["USER", "HOME", "PATH"])
/show @info.USER
/show @info.HOME`, {
        env: {
          USER: 'testuser',
          HOME: '/home/testuser'
        },
        expectedOutput: `testuser
/home/testuser`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it.skip('should import and use @mlld/time module', async () => {
      // TODO: @mlld/time is not published to registry yet
      const result = await testImport(`
/import { time } from @mlld/time

>> Test time formatting
/var @formatted = @time.format(@now, "YYYY-MM-DD")
/show @formatted`, {
        expectedOutput: /^\d{4}-\d{2}-\d{2}$/
      });
      
      expect(result.output).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Registry Import Patterns', () => {
    it('should support selected import from registry', async () => {
      const result = await testImport(`
/import { env } from @mlld/env
/var @user = @env.get("USER")
/show @user`, {
        env: { USER: 'alice' },
        expectedOutput: 'alice'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it('should support namespace import from registry', async () => {
      const result = await testImport(`
/import @mlld/env as environment
/var @path = @environment.get("PATH")
/show @path`, {
        env: { PATH: '/usr/bin:/bin' },
        expectedOutput: '/usr/bin:/bin'
      });
      
      if (!result.success) {
        console.log('Namespace import test failed:', result.error);
      }
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it.skip('should support simple import from registry', async () => {
      // TODO: @mlld/time is not published to registry yet
      const result = await testImport(`
/import @mlld/time
/var @now = @time.time.now()
/show @now`, {
        expectedOutput: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      });
      
      expect(result.output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Complex Registry Modules', () => {
    it('should import @mlld/github with nested structure', async () => {
      // This test verifies the deeply nested structure works
      const result = await testImport(`
/import { github } from @mlld/github
/import { MLLD_GITHUB_TOKEN } from @input

>> Check structure
/exe @hasNested(@obj) = js {
  return obj && obj.pr && obj.pr.view ? "true" : "false";
}
/var @valid = @hasNested(@github)
/show @valid`, {
        env: {
          MLLD_GITHUB_TOKEN: process.env.MLLD_GITHUB_TOKEN || 'dummy-token'
        },
        expectedOutput: 'true'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    // Only run this test if we have a real GitHub token
    if (hasGitHubToken()) {
      it('should execute @mlld/github functions with shadow environments', async () => {
        const result = await testImport(`
/import { github } from @mlld/github
/import { MLLD_GITHUB_TOKEN } from @input

>> This uses shadow functions internally
/var @repo = @github.repo.view("mlld-lang/modules", "name,owner")
/show @repo.name
/show @repo.owner.login`, {
          env: {
            MLLD_GITHUB_TOKEN: process.env.MLLD_GITHUB_TOKEN!
          },
          expectedOutput: `modules
mlld-lang`
        });
        
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      });
    }
  });
  
  describe('Registry Error Handling', () => {
    it('should fail gracefully for non-existent registry module', async () => {
      const result = await testImport(`
/import { something } from @mlld/does-not-exist`, {
        expectedError: /Failed to resolve|Cannot read properties|not found/i
      });
      
      expect(result.success).toBe(true); // Test succeeds when we get expected error
      expect(result.exitCode).toBe(1);
    });
    
    it('should provide helpful error for typos in module names', async () => {
      const result = await testImport(`
/import { github } from @mlld/githb`, {  // Typo: githb instead of github
        expectedError: /Failed to resolve|Cannot read properties|not found/i
      });
      
      expect(result.success).toBe(true); // Test succeeds when we get expected error
      expect(result.exitCode).toBe(1);
    });
  });
});

describe('Registry Module Integration', () => {
  it.skip('should combine multiple registry modules', async () => {
    // TODO: @mlld/time is not published to registry yet
    const result = await testImport(`
/import { env } from @mlld/env
/import { time } from @mlld/time
/import { USER } from @input

/var @timestamp = @time.now()
/var @user = @env.get("USER")
/show @user
/show @timestamp`, {
      env: { USER: 'testuser' },
      expectedOutput: /^testuser\n\d{4}-\d{2}-\d{2}T/
    });
    
    expect(result.output).toMatch(/^testuser\n\d{4}-\d{2}-\d{2}T/);
    expect(result.exitCode).toBe(0);
  });
});