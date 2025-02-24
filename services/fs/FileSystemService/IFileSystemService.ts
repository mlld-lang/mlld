import type { Stats } from 'fs-extra';
import type { IFileSystem } from './IFileSystem.js';

export interface IFileSystemService {
  // File operations
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  stat(filePath: string): Promise<Stats>;
  isFile(filePath: string): Promise<boolean>;
  
  // Directory operations
  readDir(dirPath: string): Promise<string[]>;
  ensureDir(dirPath: string): Promise<void>;
  isDirectory(filePath: string): Promise<boolean>;
  
  // File watching
  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>;
  
  // Working directory
  getCwd(): string;

  // Command execution
  executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;

  setFileSystem(fileSystem: IFileSystem): void;
} 