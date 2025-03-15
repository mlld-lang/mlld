import * as path from 'path';

/**
 * Service providing platform-independent path manipulation operations.
 * Abstracts the Node.js path module to provide a consistent API across platforms.
 * 
 * @remarks
 * The PathOperationsService provides low-level path manipulation utilities without enforcing
 * Meld's path validation rules. These operations are platform-aware and handle differences
 * between Windows, macOS, and Linux path formats.
 * 
 * For secure path validation, resolution, and enforcement of Meld path rules, use IPathService instead.
 * This service is primarily used internally by other services that need basic path manipulation.
 * 
 * Dependencies:
 * - Node.js path module
 */
interface IPathOperationsService {
  /**
   * Join all arguments together and normalize the resulting path.
   * 
   * @param paths - The path segments to join
   * @returns The joined path
   * 
   * @example
   * ```ts
   * const fullPath = pathOps.join('/base/dir', 'subdir', 'file.txt');
   * // On POSIX: '/base/dir/subdir/file.txt'
   * // On Windows: '\\base\\dir\\subdir\\file.txt'
   * ```
   */
  join(...paths: string[]): string;

  /**
   * Resolves a sequence of paths or path segments into an absolute path.
   * 
   * @param paths - The path segments to resolve
   * @returns The resolved absolute path
   * 
   * @example
   * ```ts
   * const absPath = pathOps.resolve('relative/path', '../sibling/file.txt');
   * // Resolves to absolute path with any '..' segments processed
   * ```
   */
  resolve(...paths: string[]): string;

  /**
   * Returns the directory name of a path.
   * 
   * @param filePath - The path to get the directory from
   * @returns The directory portion of the path
   * 
   * @example
   * ```ts
   * const dir = pathOps.dirname('/path/to/file.txt');
   * // On POSIX: '/path/to'
   * ```
   */
  dirname(filePath: string): string;

  /**
   * Returns the last portion of a path.
   * 
   * @param filePath - The path to get the filename from
   * @returns The file name portion of the path
   * 
   * @example
   * ```ts
   * const fileName = pathOps.basename('/path/to/file.txt');
   * // 'file.txt'
   * ```
   */
  basename(filePath: string): string;

  /**
   * Normalize a string path, reducing '..' and '.' parts.
   * 
   * @param filePath - The path to normalize
   * @returns The normalized path
   * 
   * @example
   * ```ts
   * const normalPath = pathOps.normalize('/path/./to/../to/file.txt');
   * // On POSIX: '/path/to/file.txt'
   * ```
   */
  normalize(filePath: string): string;

  /**
   * Determines if path is an absolute path.
   * 
   * @param filePath - The path to check
   * @returns true if the path is absolute, false otherwise
   * 
   * @example
   * ```ts
   * const isAbs = pathOps.isAbsolute('/path/to/file.txt');
   * // On POSIX: true
   * ```
   */
  isAbsolute(filePath: string): boolean;

  /**
   * Returns the relative path from 'from' to 'to'.
   * 
   * @param from - The source path
   * @param to - The target path
   * @returns The relative path from source to target
   * 
   * @example
   * ```ts
   * const rel = pathOps.relative('/path/to', '/path/to/subdir/file.txt');
   * // On POSIX: 'subdir/file.txt'
   * ```
   */
  relative(from: string, to: string): string;

  /**
   * Returns an object whose properties represent significant elements of the path.
   * 
   * @param filePath - The path to parse
   * @returns An object with path components (root, dir, base, name, ext)
   * 
   * @example
   * ```ts
   * const parts = pathOps.parse('/path/to/file.txt');
   * // { root: '/', dir: '/path/to', base: 'file.txt', name: 'file', ext: '.txt' }
   * ```
   */
  parse(filePath: string): path.ParsedPath;
}

export type { IPathOperationsService }; 