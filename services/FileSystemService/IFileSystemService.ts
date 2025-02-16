import type { Stats } from 'fs';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface IFileSystemService {
  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<Stats>;
  isFile(path: string): Promise<boolean>;
  
  // Directory operations
  readDir(path: string): Promise<string[]>;
  ensureDir(path: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  
  // Path operations
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  normalize(path: string): string;
  
  // Command execution
  executeCommand(command: string, options?: { cwd?: string }): Promise<CommandResult>;
  getCwd(): string;
  
  // Test mode
  enableTestMode(testFs: MemfsTestFileSystem): void;
  disableTestMode(): void;
  isTestMode(): boolean;
  
  // Mock file system (for testing)
  mockFile(path: string, content: string): void;
  mockDir(path: string): void;
  clearMocks(): void;
} 