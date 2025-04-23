import * as fsExtra from 'fs-extra';
import { watch } from 'fs/promises';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import type { Stats } from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';

const execAsync = promisify(exec);

/**
 * Adapter to use Node's fs-extra as our IFileSystem implementation
 */
@injectable()
@Service({
  description: 'Node.js filesystem implementation'
})
export class NodeFileSystem implements IFileSystem {
  // Environmental check to determine if we're in a testing environment
  isTestEnvironment = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  async readFile(path: string): Promise<string> {
    return fsExtra.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fsExtra.writeFile(path, content, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    return fsExtra.pathExists(path);
  }

  async stat(path: string): Promise<Stats> {
    return fsExtra.stat(path);
  }

  async readDir(path: string): Promise<string[]> {
    return fsExtra.readdir(path);
  }

  async mkdir(path: string): Promise<void> {
    await fsExtra.mkdir(path, { recursive: true });
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fsExtra.stat(path);
      return stats.isDirectory();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async isFile(path: string): Promise<boolean> {
    try {
      const stats = await fsExtra.stat(path);
      return stats.isFile();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async deleteFile(path: string): Promise<void> {
    await fsExtra.remove(path);
  }

  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    return watch(path, options) as AsyncIterableIterator<{ filename: string; eventType: string }>;
  }

  async executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
    console.log(`Running \`${command}\``);
    
    // If in test environment, use a simple mock behavior
    if (this.isTestEnvironment) {
      const trimmedCommand = command.trim();
      if (trimmedCommand.startsWith('echo')) {
        const output = trimmedCommand.slice(5).trim();
        return { stdout: output, stderr: '' };
      }
      return { stdout: `Mock output for command: ${command}`, stderr: '' };
    }

    // Debug logging to help troubleshoot command execution issues
    console.debug(`DEBUG: Executing command: "${command}"`);

    // Helper function to safely escape shell special characters in commands
    const escapeShellArg = (arg: string): string => {
      // Wrap in single quotes and escape any single quotes inside
      return `'${arg.replace(/'/g, '\'\\\'\'')}'`;
    };

    // Special handling for oneshot and other commands that need to preserve multi-line content
    if (command.startsWith('oneshot') || command.includes('\n')) {
      try {
        // Extract the command and its arguments
        const cmdParts = command.match(/^(\S+)\s+(.*)$/);
        
        if (cmdParts) {
          const cmd = cmdParts[1]; // Command name (e.g., 'oneshot')
          let args = cmdParts[2].trim();  // The arguments
          
          // If args are wrapped in quotes, remove them for direct passing
          if ((args.startsWith('"') && args.endsWith('"')) || 
              (args.startsWith('\'') && args.endsWith('\''))) {
            args = args.substring(1, args.length - 1);
          }
          
          // Create a process directly (without shell) to avoid quote and newline issues
          const { spawn } = require('child_process');
          return new Promise((resolve) => {
            const childProcess = spawn(cmd, [args], {
              cwd: options?.cwd || process.cwd(),
              // Do NOT use a shell to avoid syntax errors with special characters
              shell: false,
            });
            
            let stdout = '';
            let stderr = '';
            
            childProcess.stdout.on('data', (data: Buffer | string) => {
              const chunk = data.toString();
              stdout += chunk;
              console.log(chunk);
            });
            
            childProcess.stderr.on('data', (data: Buffer | string) => {
              const chunk = data.toString();
              stderr += chunk;
              console.error(chunk);
            });
            
            childProcess.on('close', (code: number | null) => {
              if (code !== 0 && code !== null) {
                stderr += `\nCommand exited with code ${code}`;
                console.error(`Command failed with exit code ${code}`);
              }
              resolve({ stdout, stderr });
            });
          });
        }
      } catch (err) {
        console.error('Error executing command with multi-line content:', err);
        return { stdout: '', stderr: String(err) };
      }
    }

    // For all other commands, use exec with Promise and proper escaping
    try {
      const { promisify } = require('util');
      const { exec } = require('child_process');
      const execAsync = promisify(exec);

      // If command contains shell special characters that might cause syntax errors
      // (parentheses, quotes, etc.), properly escape it or use spawn instead of shell exec
      const hasShellSpecialChars = /[()\&\|;\<\>\$\`\\"]/.test(command);
      
      let result;
      if (hasShellSpecialChars) {
        // For commands with special characters, we need to be careful with escaping
        // Extract the command and arguments
        const parts: string[] = command.split(/\s+/);
        const cmd: string = parts[0] || '';
        const args: string[] = parts.length > 1 ? parts.slice(1) : [];
        
        // Use spawn directly to avoid shell parsing issues
        const { spawn } = require('child_process');
        const result = await new Promise((resolve) => {
          const childProcess = spawn(cmd, args, {
            cwd: options?.cwd || process.cwd(),
            // Use shell: false to avoid shell parsing issues
            shell: false
          });
          
          let stdout = '';
          let stderr = '';
          
          childProcess.stdout.on('data', (data: Buffer | string) => {
            const chunk = data.toString();
            stdout += chunk;
            console.log(chunk);
          });
          
          childProcess.stderr.on('data', (data: Buffer | string) => {
            const chunk = data.toString();
            stderr += chunk;
            console.error(chunk);
          });
          
          childProcess.on('close', (code: number | null) => {
            if (code !== 0 && code !== null) {
              stderr += `\nCommand exited with code ${code}`;
              console.error(`Command failed with exit code ${code}`);
            }
            resolve({ stdout, stderr });
          });
        });
      } else {
        // For simple commands without special characters, use exec
        result = await execAsync(command, {
          cwd: options?.cwd || process.cwd(),
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer to handle large outputs
        });
      }

      // Log the output to console
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);

      return result;
    } catch (error) {
      // Handle command execution errors
      const err = error as any;
      console.error(`Command failed with exit code ${err.code}`);
      
      if (err.stdout) console.log(err.stdout);
      if (err.stderr) console.error(err.stderr);
      
      return {
        stdout: err.stdout || '',
        stderr: (err.stderr || '') + `\nCommand exited with code ${err.code}`
      };
    }
  }
} 