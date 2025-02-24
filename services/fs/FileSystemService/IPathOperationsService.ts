import * as path from 'path';

export interface IPathOperationsService {
  /**
   * Join all arguments together and normalize the resulting path
   */
  join(...paths: string[]): string;

  /**
   * Resolves a sequence of paths or path segments into an absolute path
   */
  resolve(...paths: string[]): string;

  /**
   * Returns the directory name of a path
   */
  dirname(filePath: string): string;

  /**
   * Returns the last portion of a path
   */
  basename(filePath: string): string;

  /**
   * Normalize a string path, reducing '..' and '.' parts
   */
  normalize(filePath: string): string;

  /**
   * Determines if path is an absolute path
   */
  isAbsolute(filePath: string): boolean;

  /**
   * Returns the relative path from 'from' to 'to'
   */
  relative(from: string, to: string): string;

  /**
   * Returns an object whose properties represent significant elements of the path
   */
  parse(filePath: string): path.ParsedPath;
} 