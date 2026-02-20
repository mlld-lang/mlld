/**
 * Simplified file system service interface for the interpreter
 */
export interface IFileSystemService {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  appendFile(filePath: string, content: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  access?(filePath: string): Promise<void>;
  mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(dirPath: string): Promise<string[]>;
  unlink?(filePath: string): Promise<void>;
  rm?(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  isDirectory(filePath: string): Promise<boolean>;
  stat(filePath: string): Promise<{ isDirectory(): boolean; isFile(): boolean; size?: number }>;
  isVirtual?(): boolean;
}
