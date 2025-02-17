import { Stats } from 'fs-extra';

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
  
  // Working directory
  getCwd(): string;
} 