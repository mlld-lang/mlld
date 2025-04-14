import type { Stats } from 'fs-extra';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { FileSystemBase } from '@core/shared/types.js';
import type { ValidatedResourcePath } from '@core/types/paths.js';

/**
 * Service responsible for file system operations.
 * Provides methods for reading, writing, and manipulating files and directories.
 * Abstracts underlying file system implementation to support both real and test environments.
 * Methods taking paths now expect validated paths.
 * 
 * @remarks
 * This is a high-level service interface that should be used by application code.
 * Expects paths to be validated by PathService before being passed in.
 * 
 * Dependencies:
 * - IFileSystem: For low-level filesystem operations
 * - IPathService: For path validation and resolution
 */
interface IFileSystemService extends FileSystemBase {
  /**
   * Reads the content of a file as a string.
   * 
   * @param filePath - Validated path to the file to read
   * @returns A promise that resolves with the file content as a string
   * @throws {MeldFileSystemError} If the file cannot be read or does not exist
   * 
   * @example
   * ```ts
   * const validatedPath = await pathService.validatePath(...);
   * const content = await fileSystemService.readFile(validatedPath);
   * console.log(content);
   * ```
   */
  readFile(filePath: ValidatedResourcePath): Promise<string>;
  
  /**
   * Writes content to a file.
   * Creates the file if it doesn't exist, and overwrites it if it does.
   * 
   * @param filePath - Validated path to the file to write
   * @param content - Content to write to the file
   * @returns A promise that resolves when the write operation is complete
   * @throws {MeldFileSystemError} If the file cannot be written
   * 
   * @example
   * ```ts
   * const validatedPath = await pathService.validatePath(...);
   * await fileSystemService.writeFile(validatedPath, 'Hello, world!');
   * ```
   */
  writeFile(filePath: ValidatedResourcePath, content: string): Promise<void>;
  
  /**
   * Checks if a file or directory exists.
   * This is the preferred method over any potential legacy 'fileExists' methods.
   * 
   * @param filePath - Validated path to check
   * @returns A promise that resolves with true if the path exists, false otherwise
   */
  exists(filePath: ValidatedResourcePath): Promise<boolean>;
  
  /**
   * Gets information about a file or directory.
   * 
   * @param filePath - Validated path to get information about
   * @returns A promise that resolves with a Stats object containing file information
   * @throws {MeldFileSystemError} If the path cannot be accessed
   */
  stat(filePath: ValidatedResourcePath): Promise<Stats>;
  
  /**
   * Checks if a path points to a file.
   * 
   * @param filePath - Validated path to check
   * @returns A promise that resolves with true if the path is a file, false otherwise
   */
  isFile(filePath: ValidatedResourcePath): Promise<boolean>;
  
  /**
   * Lists the contents of a directory.
   * 
   * @param dirPath - Validated path to the directory to read
   * @returns A promise that resolves with an array of filenames in the directory
   * @throws {MeldFileSystemError} If the directory cannot be read or does not exist
   */
  readDir(dirPath: ValidatedResourcePath): Promise<string[]>;
  
  /**
   * Creates a directory and any necessary parent directories.
   * 
   * @param dirPath - Validated path to the directory to create
   * @returns A promise that resolves when the directory is created
   * @throws {MeldFileSystemError} If the directory cannot be created
   */
  ensureDir(dirPath: ValidatedResourcePath): Promise<void>;
  
  /**
   * Checks if a path points to a directory.
   * 
   * @param filePath - Validated path to check
   * @returns A promise that resolves with true if the path is a directory, false otherwise
   */
  isDirectory(filePath: ValidatedResourcePath): Promise<boolean>;
  
  /**
   * Watches a file or directory for changes.
   * 
   * @param path - Validated path to watch
   * @param options - Watch options
   * @param options.recursive - Whether to watch subdirectories recursively
   * @returns An async iterator that yields file change events
   * 
   * @example
   * ```ts
   * const validatedPath = await pathService.validatePath(...);
   * const watcher = fileSystemService.watch(validatedPath, { recursive: true });
   * for await (const event of watcher) {
   *   console.log(`${event.filename} ${event.eventType}`);
   * }
   * ```
   */
  watch(path: ValidatedResourcePath, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>;
  
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
   * @param dirPath - Validated path to the directory to create
   * @param options - Options for directory creation
   * @param options.recursive - Whether to create parent directories if they don't exist
   * @returns A promise that resolves when the directory is created
   * @throws {MeldFileSystemError} If the directory cannot be created
   */
  mkdir(dirPath: ValidatedResourcePath, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Deletes a file at the specified path.
   * Should not throw if the file doesn't exist.
   * @param filePath Path to the file to delete
   * @returns A promise that resolves when the file is deleted
   */
  deleteFile(filePath: string): Promise<void>;
}

export type { IFileSystemService }; 