import { Stats } from 'fs-extra';

interface IFileSystem {
  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<Stats>;
  
  // Directory operations
  readDir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  
  // File watching
  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>;

  // Command execution
  executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;
  
  // Optional testing property
  isTestEnvironment?: boolean;
}

export type { IFileSystem }; 