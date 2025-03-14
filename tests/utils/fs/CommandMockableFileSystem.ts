import { Volume } from 'memfs';
import * as path from 'path';
import type { Stats } from 'fs';
import { filesystemLogger as logger } from '@core/utils/logger.js';
import { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { MockCommandExecutor, CommandResponse, createCommonCommandMappings } from '@tests/utils/fs/MockCommandExecutor.js';

/**
 * File system implementation that combines memfs with mock command execution
 * Designed for comprehensive test coverage with full control over file operations and command execution
 */
export class CommandMockableFileSystem implements IFileSystem {
  private vol: Volume;
  private root: string = '/';
  public commandExecutor: MockCommandExecutor;

  constructor() {
    logger.debug('Initializing CommandMockableFileSystem');
    try {
      this.vol = new Volume();
      // Initialize root directory
      this.vol.mkdirSync(this.root, { recursive: true });
      // Initialize command executor with common patterns
      this.commandExecutor = new MockCommandExecutor(createCommonCommandMappings());
      logger.debug('CommandMockableFileSystem initialized');
    } catch (error) {
      logger.error('Error initializing CommandMockableFileSystem', { error });
      throw new Error(`Error initializing CommandMockableFileSystem: ${error.message}`);
    }
  }

  /**
   * Initialize or reset the filesystem
   */
  initialize(): void {
    logger.debug('Resetting filesystem');
    try {
      this.vol.reset();
      // Re-initialize root
      this.vol.mkdirSync(this.root, { recursive: true });
      // Reset command executor
      this.commandExecutor.reset();
      this.commandExecutor.setMapping(createCommonCommandMappings());
      logger.debug('Filesystem reset complete');
    } catch (error) {
      logger.error('Error initializing filesystem', { error });
      throw new Error(`Error initializing filesystem: ${error.message}`);
    }
  }

  /**
   * Clean up any resources
   */
  async cleanup(): Promise<void> {
    logger.debug('Cleaning up filesystem');
    try {
      // Reset the volume first to clear everything
      this.vol.reset();
      
      // Re-initialize root
      this.vol.mkdirSync(this.root, { recursive: true });
      
      // Reset command executor
      this.commandExecutor.reset();
      
      logger.debug('Filesystem cleanup complete');
    } catch (error) {
      logger.error('Error during cleanup', { error });
      throw new Error(`Error during cleanup: ${error.message}`);
    }
  }

  /**
   * Read a file's contents
   */
  async readFile(filePath: string): Promise<string> {
    logger.debug('Reading file', { filePath });
    try {
      // Check if file exists
      if (!this.vol.existsSync(filePath)) {
        logger.error('File not found', { filePath });
        throw new Error(`ENOENT: no such file or directory: ${filePath}`);
      }

      // Get stats and check if directory
      const stats = this.vol.statSync(filePath);
      if (stats.isDirectory()) {
        logger.error('Cannot read directory as file', { filePath });
        throw new Error(`EISDIR: Cannot read directory as file: ${filePath}`);
      }

      // Read the file
      const content = this.vol.readFileSync(filePath, 'utf-8');
      
      logger.debug('File read successfully', { filePath, contentLength: content.length });
      return content;
    } catch (error) {
      // If error is already formatted, just rethrow
      if (error.message.startsWith('EISDIR:') || 
          error.message.startsWith('ENOENT:')) {
        throw error;
      }
      // Otherwise wrap in a more descriptive error
      logger.error('Error reading file', { filePath, error });
      throw new Error(`Error reading file '${filePath}': ${error.message}`);
    }
  }

  /**
   * Write a file
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    logger.debug('Writing file', { filePath });
    const dirPath = path.dirname(filePath);
    
    try {
      // Create parent directories if they don't exist
      if (!this.vol.existsSync(dirPath)) {
        this.vol.mkdirSync(dirPath, { recursive: true });
      }
      
      this.vol.writeFileSync(filePath, content, 'utf-8');
      logger.debug('File written successfully', { filePath });
    } catch (error) {
      logger.error('Error writing file', { filePath, error });
      throw new Error(`Error writing file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Check if a file or directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    logger.debug('Checking if path exists', { filePath });
    try {
      const exists = this.vol.existsSync(filePath);
      logger.debug('Path existence check result', { filePath, exists });
      return exists;
    } catch (error) {
      logger.error('Error checking path existence', { filePath, error });
      return false;
    }
  }

  /**
   * Get stats for a file or directory
   */
  async stat(filePath: string): Promise<Stats> {
    logger.debug('Getting stats', { filePath });
    try {
      const stats = this.vol.statSync(filePath) as Stats;
      logger.debug('Got stats', { 
        filePath, 
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size
      });
      return stats;
    } catch (error) {
      logger.error('Error getting stats', { filePath, error });
      throw new Error(`Error getting stats for '${filePath}': ${error.message}`);
    }
  }

  /**
   * Read directory contents
   */
  async readDir(dirPath: string): Promise<string[]> {
    logger.debug('Reading directory', { dirPath });
    try {
      // Check if path exists
      if (!this.vol.existsSync(dirPath)) {
        logger.error('Directory not found', { dirPath });
        throw new Error(`ENOENT: no such directory: ${dirPath}`);
      }

      // Check if it's a directory
      const stats = this.vol.statSync(dirPath);
      if (!stats.isDirectory()) {
        logger.error('Path is not a directory', { dirPath });
        throw new Error(`ENOTDIR: not a directory: ${dirPath}`);
      }

      // Read directory entries
      const entries = this.vol.readdirSync(dirPath);
      
      // Ensure we have a valid array and convert entries to strings
      if (!Array.isArray(entries)) {
        logger.debug('Directory read did not return array, returning empty array', { dirPath });
        return [];
      }

      // Convert any Dirent objects or other types to strings
      const stringEntries = entries.map(entry => entry.toString());

      logger.debug('Directory read successful', { dirPath, entryCount: stringEntries.length });
      return stringEntries;
    } catch (error) {
      if (error.message.startsWith('ENOENT:') || 
          error.message.startsWith('ENOTDIR:')) {
        throw error;
      }
      logger.error('Error reading directory', { dirPath, error });
      throw new Error(`Error reading directory '${dirPath}': ${error.message}`);
    }
  }

  /**
   * Create a directory
   */
  async mkdir(dirPath: string): Promise<void> {
    logger.debug('Creating directory', { dirPath });
    try {
      // Check if path exists
      if (this.vol.existsSync(dirPath)) {
        const stats = this.vol.statSync(dirPath);
        if (stats.isDirectory()) {
          logger.debug('Directory already exists', { dirPath });
          return;
        }
        logger.error('Path exists but is not a directory', { dirPath });
        throw new Error(`ENOTDIR: path exists but is not a directory: ${dirPath}`);
      }

      // Create directory with recursive option
      this.vol.mkdirSync(dirPath, { recursive: true });
      logger.debug('Directory created successfully', { dirPath });
    } catch (error) {
      // If error is already formatted, just rethrow
      if (error.message.startsWith('ENOTDIR:')) {
        throw error;
      }
      // Otherwise wrap in a more descriptive error
      logger.error('Error creating directory', { dirPath, error });
      throw new Error(`Error creating directory '${dirPath}': ${error.message}`);
    }
  }

  /**
   * Check if path is a directory
   */
  async isDirectory(filePath: string): Promise<boolean> {
    logger.debug('Checking if path is directory', { filePath });
    try {
      if (!this.vol.existsSync(filePath)) {
        return false;
      }
      const stats = this.vol.statSync(filePath);
      const isDir = stats.isDirectory();
      logger.debug('Directory check result', { filePath, isDir });
      return isDir;
    } catch (error) {
      logger.error('Error checking if path is directory', { filePath, error });
      return false;
    }
  }

  /**
   * Check if path is a file
   */
  async isFile(filePath: string): Promise<boolean> {
    logger.debug('Checking if path is file', { filePath });
    try {
      if (!this.vol.existsSync(filePath)) {
        return false;
      }
      const stats = this.vol.statSync(filePath);
      const isFile = stats.isFile();
      logger.debug('File check result', { filePath, isFile });
      return isFile;
    } catch (error) {
      logger.error('Error checking if path is file', { filePath, error });
      return false;
    }
  }

  /**
   * Watch a file or directory for changes (simplified implementation for tests)
   */
  async *watch(
    path: string,
    options?: { recursive?: boolean }
  ): AsyncIterableIterator<{ filename: string; eventType: string }> {
    logger.debug('Watch not fully implemented in CommandMockableFileSystem');
    // This is a simplified implementation that doesn't actually watch
    // In real tests, you would trigger events manually
    return { filename: path, eventType: 'change' };
  }

  /**
   * Get current working directory
   */
  getCwd(): string {
    return this.root;
  }

  /**
   * Execute a command using the mock command executor
   */
  async executeCommand(command: string, options?: { cwd?: string }): Promise<CommandResponse> {
    logger.debug('Executing command', { command, cwd: options?.cwd });
    try {
      const result = await this.commandExecutor.executeCommand(command, options);
      logger.debug('Command executed successfully', { 
        command, 
        stdout: result.stdout, 
        stderr: result.stderr,
        exitCode: result.exitCode
      });
      return result;
    } catch (error) {
      logger.error('Error executing command', { command, error });
      throw new Error(`Error executing command: ${command}: ${error.message}`);
    }
  }
}