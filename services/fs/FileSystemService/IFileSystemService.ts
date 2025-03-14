import type { Stats } from 'fs-extra';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';

/**
 * Service responsible for file system operations.
 * Provides methods for reading, writing, and manipulating files and directories.
 * Abstracts underlying file system implementation to support both real and test environments.
 * 
 * @remarks
 * This is a high-level service interface that should be used by application code.
 * It provides validation, path resolution, and error handling on top of the basic
 * filesystem operations provided by IFileSystem.
 * 
 * Dependencies:
 * - IFileSystem: For low-level filesystem operations
 * - IPathService: For path validation and resolution
 */
export interface IFileSystemService {
  /**
   * Reads the content of a file as a string.
   * 
   * @param filePath - Path to the file to read
   * @returns A promise that resolves with the file content as a string
   * @throws {MeldFileSystemError} If the file cannot be read or does not exist
   * 
   * @example
   * ```ts
   * const content = await fileSystemService.readFile('/path/to/file.txt');
   * console.log(content);
   * ```
   */
  readFile(filePath: string): Promise<string>;
  
  /**
   * Writes content to a file.
   * Creates the file if it doesn't exist, and overwrites it if it does.
   * 
   * @param filePath - Path to the file to write
   * @param content - Content to write to the file
   * @returns A promise that resolves when the write operation is complete
   * @throws {MeldFileSystemError} If the file cannot be written
   * 
   * @example
   * ```ts
   * await fileSystemService.writeFile('/path/to/file.txt', 'Hello, world!');
   * ```
   */
  writeFile(filePath: string, content: string): Promise<void>;
  
  /**
   * Checks if a file or directory exists.
   * 
   * @param filePath - Path to check
   * @returns A promise that resolves with true if the path exists, false otherwise
   */
  exists(filePath: string): Promise<boolean>;
  
  /**
   * Gets information about a file or directory.
   * 
   * @param filePath - Path to get information about
   * @returns A promise that resolves with a Stats object containing file information
   * @throws {MeldFileSystemError} If the path cannot be accessed
   */
  stat(filePath: string): Promise<Stats>;
  
  /**
   * Checks if a path points to a file.
   * 
   * @param filePath - Path to check
   * @returns A promise that resolves with true if the path is a file, false otherwise
   */
  isFile(filePath: string): Promise<boolean>;
  
  /**
   * Lists the contents of a directory.
   * 
   * @param dirPath - Path to the directory to read
   * @returns A promise that resolves with an array of filenames in the directory
   * @throws {MeldFileSystemError} If the directory cannot be read or does not exist
   */
  readDir(dirPath: string): Promise<string[]>;
  
  /**
   * Creates a directory and any necessary parent directories.
   * 
   * @param dirPath - Path to the directory to create
   * @returns A promise that resolves when the directory is created
   * @throws {MeldFileSystemError} If the directory cannot be created
   */
  ensureDir(dirPath: string): Promise<void>;
  
  /**
   * Checks if a path points to a directory.
   * 
   * @param filePath - Path to check
   * @returns A promise that resolves with true if the path is a directory, false otherwise
   */
  isDirectory(filePath: string): Promise<boolean>;
  
  /**
   * Watches a file or directory for changes.
   * 
   * @param path - Path to watch
   * @param options - Watch options
   * @param options.recursive - Whether to watch subdirectories recursively
   * @returns An async iterator that yields file change events
   * 
   * @example
   * ```ts
   * const watcher = fileSystemService.watch('/path/to/dir', { recursive: true });
   * for await (const event of watcher) {
   *   console.log(`${event.filename} ${event.eventType}`);
   * }
   * ```
   */
  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>;
  
  /**
   * Gets the current working directory.
   * 
   * @returns The current working directory path
   */
  getCwd(): string;

  /**
   * Gets the directory name of a path.
   * 
   * @param filePath - Path to get the directory name from
   * @returns The directory part of the path
   */
  dirname(filePath: string): string;

  /**
   * Executes a shell command.
   * 
   * @param command - Command to execute
   * @param options - Command options
   * @param options.cwd - Working directory for the command
   * @returns A promise that resolves with the command output
   * @throws {MeldCommandError} If the command fails
   * 
   * @example
   * ```ts
   * const result = await fileSystemService.executeCommand('ls -la', { cwd: '/path/to/dir' });
   * console.log(result.stdout);
   * ```
   */
  executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;

  /**
   * Sets the file system implementation to use.
   * This is primarily used for testing to inject a mock filesystem.
   * 
   * @param fileSystem - The filesystem implementation to use
   */
  setFileSystem(fileSystem: IFileSystem): void;
  
  /**
   * Gets the current file system implementation.
   * 
   * @returns The current filesystem implementation
   */
  getFileSystem(): IFileSystem;

  /**
   * Creates a directory and any necessary parent directories.
   * 
   * @deprecated Use `ensureDir` instead. This method will be removed in a future version.
   * @param dirPath - Path to the directory to create
   * @param options - Options for directory creation
   * @param options.recursive - Whether to create parent directories if they don't exist
   * @returns A promise that resolves when the directory is created
   * @throws {MeldFileSystemError} If the directory cannot be created
   */
  mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
} 