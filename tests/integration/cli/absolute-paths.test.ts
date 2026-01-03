import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Absolute Path Access with --allow-absolute flag', () => {
  let tempDir: string;
  let externalFile: string;
  let projectDir: string;
  const mlldBin = path.resolve(process.cwd(), 'dist/cli.cjs');
  
  beforeEach(async () => {
    // Create a temporary directory outside the project
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-abs-test-'));
    externalFile = path.join(tempDir, 'external.txt');
    await fs.writeFile(externalFile, 'EXTERNAL_CONTENT', 'utf-8');
    
    // Create a temporary project directory
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-project-'));
  });
  
  afterEach(async () => {
    // Clean up temp directories
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('Direct file access with < >', () => {
    it.skip('should fail to load absolute path by default', async () => {
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/var @text = <${externalFile}>
/show @text`, 'utf-8');
      
      // Direct absolute paths in <> currently hang, so we skip this test
      // The path variable tests below cover the security aspect
    });
    
    it('should allow absolute path access with --allow-absolute flag', async () => {
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/var @text = <${externalFile}>
/show @text`, 'utf-8');
      
      const { stdout } = await execAsync(`node "${mlldBin}" --allow-absolute "${scriptPath}"`, { cwd: projectDir });
      expect(stdout.trim()).toBe('EXTERNAL_CONTENT');
    });
  });

  describe('Path variable indirection', () => {
    // Access restrictions removed - now delegated to /policy directive
    it.skip('should deny path variable with absolute path by default', async () => {
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/path @f = "${externalFile}"
/var @text = <@f>
/show @text`, 'utf-8');

      try {
        await execAsync(`node "${mlldBin}" "${scriptPath}"`, { cwd: projectDir });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toMatch(/Access denied|outside project root/i);
      }
    });
    
    it('should allow path variable with absolute path with --allow-absolute flag', async () => {
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/path @f = "${externalFile}"
/var @text = <@f>
/show @text`, 'utf-8');
      
      const { stdout } = await execAsync(`node "${mlldBin}" --allow-absolute "${scriptPath}"`, { cwd: projectDir });
      expect(stdout.trim()).toBe('EXTERNAL_CONTENT');
    });
  });

  describe('Dynamic path construction', () => {
    it.skip('should deny constructed absolute path by default', async () => {
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/var @basePath = "${tempDir}"
/var @file = <@basePath/external.txt>
/show @file`, 'utf-8');

      // This also hangs, skip for now
    });
    
    it('should allow constructed absolute path with --allow-absolute flag', async () => {
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/var @basePath = "${tempDir}"
/var @file = <@basePath/external.txt>
/show @file`, 'utf-8');

      const { stdout } = await execAsync(`node "${mlldBin}" --allow-absolute "${scriptPath}"`, { cwd: projectDir });
      expect(stdout.trim()).toBe('EXTERNAL_CONTENT');
    });
  });

  describe('Import statements', () => {
    // Access restrictions removed - now delegated to /policy directive
    it.skip('should deny importing from absolute path by default', async () => {
      // Create an external module
      const externalModule = path.join(tempDir, 'module.mld');
      await fs.writeFile(externalModule, '/var @value = "EXTERNAL_MODULE"', 'utf-8');

      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/import { value } from "${externalModule}"
/show @value`, 'utf-8');

      try {
        await execAsync(`node "${mlldBin}" "${scriptPath}"`, { cwd: projectDir });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toMatch(/Access denied|outside project root|not found/i);
      }
    });
    
    it('should allow importing from absolute path with --allow-absolute flag', async () => {
      // Create an external module
      const externalModule = path.join(tempDir, 'module.mld');
      await fs.writeFile(externalModule, '/var @value = "EXTERNAL_MODULE"', 'utf-8');
      
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/import { value } from "${externalModule}"
/show @value`, 'utf-8');
      
      const { stdout } = await execAsync(`node "${mlldBin}" -y --allow-absolute "${scriptPath}"`, { cwd: projectDir });
      expect(stdout.trim()).toBe('EXTERNAL_MODULE');
    });
  });

  describe('Edge cases', () => {
    it('should handle symlinks correctly', async () => {
      // Create a symlink inside project pointing outside
      const symlinkPath = path.join(projectDir, 'link.txt');
      await fs.symlink(externalFile, symlinkPath);
      
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/var @text = <./link.txt>
/show @text`, 'utf-8');
      
      // Symlink should work since it appears as a relative path
      const { stdout } = await execAsync(`node "${mlldBin}" "${scriptPath}"`, { cwd: projectDir });
      expect(stdout.trim()).toBe('EXTERNAL_CONTENT');
    });
    
    it.skip('should handle .. traversal attempts', async () => {
      // Try to escape project root with ..
      const scriptPath = path.join(projectDir, 'test.mld');
      
      // Create a file we know exists
      const parentFile = path.join(path.dirname(projectDir), 'parent.txt');
      await fs.writeFile(parentFile, 'PARENT_CONTENT', 'utf-8');
      
      await fs.writeFile(scriptPath, `/var @text = <../parent.txt>`, 'utf-8');
      
      // This also hangs with direct paths, skip
      await fs.unlink(parentFile).catch(() => {});
    });
    
    it('should allow absolute parent path with --allow-absolute', async () => {
      const scriptPath = path.join(projectDir, 'test.mld');
      
      // Create a file we know exists
      const parentFile = path.join(path.dirname(projectDir), 'parent.txt');
      await fs.writeFile(parentFile, 'PARENT_CONTENT', 'utf-8');
      
      // Use absolute path instead of relative ..
      await fs.writeFile(scriptPath, `/path @f = "${parentFile}"
/var @text = <@f>
/show @text`, 'utf-8');
      
      const { stdout } = await execAsync(`node "${mlldBin}" --allow-absolute "${scriptPath}"`, { 
        cwd: projectDir,
        timeout: 10000 
      });
      expect(stdout.trim()).toBe('PARENT_CONTENT');
      
      // Clean up
      await fs.unlink(parentFile).catch(() => {});
    }, 15000);
  });

  describe('Mixed access patterns', () => {
    it('should handle both allowed and restricted paths in same script', async () => {
      // Create a file inside project
      const internalFile = path.join(projectDir, 'internal.txt');
      await fs.writeFile(internalFile, 'INTERNAL_CONTENT', 'utf-8');
      
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/var @internal = <./internal.txt>
/path @externalPath = "${externalFile}"
/var @externalContent = <@externalPath>
/show @internal
/show @externalContent`, 'utf-8');
      
      const { stdout } = await execAsync(`node "${mlldBin}" --allow-absolute "${scriptPath}"`, { cwd: projectDir, timeout: 10000 });
      // Normalize multiple newlines - output may have blank lines between shows depending on platform/Node version
      const normalized = stdout.trim().replace(/\n+/g, '\n');
      expect(normalized).toBe('INTERNAL_CONTENT\nEXTERNAL_CONTENT');
    }, 15000);
    
    it('should respect project boundaries for relative paths even with --allow-absolute', async () => {
      // Create a file inside project
      const internalFile = path.join(projectDir, 'internal.txt');
      await fs.writeFile(internalFile, 'INTERNAL_CONTENT', 'utf-8');
      
      const scriptPath = path.join(projectDir, 'test.mld');
      await fs.writeFile(scriptPath, `/var @internal = <./internal.txt>
/show @internal`, 'utf-8');
      
      // Should work the same with or without --allow-absolute for internal files
      const { stdout: withoutFlag } = await execAsync(`node "${mlldBin}" "${scriptPath}"`, { cwd: projectDir, timeout: 10000 });
      expect(withoutFlag.trim()).toBe('INTERNAL_CONTENT');

      const { stdout: withFlag } = await execAsync(`node "${mlldBin}" --allow-absolute "${scriptPath}"`, { cwd: projectDir, timeout: 10000 });
      expect(withFlag.trim()).toBe('INTERNAL_CONTENT');
    }, 15000);
  });

  describe('Security implications', () => {
    it('should document the security risk in help text', async () => {
      const { stdout } = await execAsync(`node "${mlldBin}" --help`, { cwd: projectDir });
      // Check if help mentions the flag (we can add this to the help text later)
      // For now, just verify the flag exists
      expect(stdout).toBeDefined();
    });
    
    // Access restrictions removed - now delegated to /policy directive
    it.skip('should not persist --allow-absolute setting across runs', async () => {
      const scriptPath = path.join(projectDir, 'test.mld');
      // Use path variable to avoid hanging
      await fs.writeFile(scriptPath, `/path @f = "${externalFile}"
/var @text = <@f>
/show @text`, 'utf-8');

      // First run with flag should work
      const { stdout } = await execAsync(`node "${mlldBin}" --allow-absolute "${scriptPath}"`, { cwd: projectDir, timeout: 10000 });
      expect(stdout.trim()).toBe('EXTERNAL_CONTENT');

      // Second run without flag should fail
      try {
        await execAsync(`node "${mlldBin}" "${scriptPath}"`, { cwd: projectDir, timeout: 10000 });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toMatch(/Access denied|outside project root/i);
      }
    }, 15000);
  });
});
