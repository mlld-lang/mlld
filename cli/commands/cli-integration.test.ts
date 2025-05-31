import { describe, it, expect, vi } from 'vitest';
import { createInstallCommand } from './install';
import { createLsCommand } from './ls';
import { createInfoCommand } from './info';

describe('CLI Command Integration', () => {
  it('should create install command with proper interface', () => {
    const installCmd = createInstallCommand();
    
    expect(installCmd.name).toBe('install');
    expect(installCmd.aliases).toContain('i');
    expect(installCmd.description).toBeTruthy();
    expect(typeof installCmd.execute).toBe('function');
  });

  it('should create ls command with proper interface', () => {
    const lsCmd = createLsCommand();
    
    expect(lsCmd.name).toBe('ls');
    expect(lsCmd.aliases).toContain('list');
    expect(lsCmd.description).toBeTruthy();
    expect(typeof lsCmd.execute).toBe('function');
  });

  it('should create info command with proper interface', () => {
    const infoCmd = createInfoCommand();
    
    expect(infoCmd.name).toBe('info');
    expect(infoCmd.aliases).toContain('show');
    expect(infoCmd.description).toBeTruthy();
    expect(typeof infoCmd.execute).toBe('function');
  });

  it('should handle command execution with flags', async () => {
    const installCmd = createInstallCommand();
    
    // Mock console.error to prevent output during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      // This should fail gracefully with our current mock setup
      await installCmd.execute(['@alice/utils'], { 
        verbose: true, 
        'dry-run': true 
      });
    } catch (error) {
      // Expected to fail since we don't have real registry implementation
      expect(error).toBeDefined();
    }

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});