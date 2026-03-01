import path from 'node:path';
import type { IFileSystemService } from './IFileSystemService';

type StatShape = { isDirectory(): boolean; isFile(): boolean; size?: number };

/**
 * VirtualFS is a copy-on-write filesystem overlay.
 * Reads resolve shadow state first, then fall back to optional backing storage.
 * Writes mutate shadow state only.
 */
export class VirtualFS implements IFileSystemService {
  private readonly shadowFiles = new Map<string, string>();
  private readonly deletedPaths = new Set<string>();
  private readonly explicitDirectories = new Set<string>();

  private constructor(private readonly backing?: IFileSystemService) {}

  static empty(): VirtualFS {
    return new VirtualFS();
  }

  static over(backing: IFileSystemService): VirtualFS {
    return new VirtualFS(backing);
  }

  isVirtual(): boolean {
    return true;
  }

  async readFile(filePath: string): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);
    if (this.isDeleted(normalizedPath)) {
      throw this.createFsError('ENOENT', 'open', normalizedPath);
    }

    if (this.shadowFiles.has(normalizedPath)) {
      return this.shadowFiles.get(normalizedPath) as string;
    }

    if (await this.isDirectory(normalizedPath)) {
      throw this.createFsError('EISDIR', 'open', normalizedPath);
    }

    if (!this.backing) {
      throw this.createFsError('ENOENT', 'open', normalizedPath);
    }

    try {
      return await this.backing.readFile(normalizedPath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        throw this.createFsError('ENOENT', 'open', normalizedPath);
      }
      throw error;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    if (normalizedPath === '/') {
      throw this.createFsError('EISDIR', 'open', normalizedPath);
    }
    if (await this.isDirectory(normalizedPath)) {
      throw this.createFsError('EISDIR', 'open', normalizedPath);
    }

    const parentDir = path.posix.dirname(normalizedPath);
    if (!(await this.isDirectory(parentDir))) {
      await this.mkdir(parentDir, { recursive: true });
    }

    this.shadowFiles.set(normalizedPath, content);
    this.explicitDirectories.delete(normalizedPath);
    this.clearDeletionForPath(normalizedPath);
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    if (await this.isDirectory(normalizedPath)) {
      throw this.createFsError('EISDIR', 'open', normalizedPath);
    }
    const existing = await this.readFileIfExists(normalizedPath);
    await this.writeFile(normalizedPath, `${existing}${content}`);
  }

  async exists(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    if (this.isDeleted(normalizedPath)) {
      return false;
    }

    if (this.shadowFiles.has(normalizedPath)) {
      return true;
    }
    if (this.explicitDirectories.has(normalizedPath)) {
      return true;
    }
    if (this.hasVirtualDescendant(normalizedPath)) {
      return true;
    }

    return await this.existsInBacking(normalizedPath);
  }

  async access(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    if (!(await this.exists(normalizedPath))) {
      throw this.createFsError('ENOENT', 'access', normalizedPath);
    }
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const normalizedPath = this.normalizePath(dirPath);
    if (normalizedPath === '/') {
      return;
    }

    const recursive = Boolean(options?.recursive);
    const parentDir = path.posix.dirname(normalizedPath);

    if (this.shadowFiles.has(normalizedPath) || (await this.isFileInBacking(normalizedPath))) {
      throw this.createFsError('EEXIST', 'mkdir', normalizedPath);
    }

    if (!recursive && !(await this.isDirectory(parentDir))) {
      throw this.createFsError('ENOENT', 'mkdir', normalizedPath);
    }

    if (recursive) {
      const segments = normalizedPath.split('/').filter(Boolean);
      let current = '';
      for (const segment of segments) {
        current = `${current}/${segment}`;
        this.explicitDirectories.add(current);
        this.clearDeletionForPath(current);
      }
      return;
    }

    this.explicitDirectories.add(normalizedPath);
    this.clearDeletionForPath(normalizedPath);
  }

  async readdir(dirPath: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(dirPath);
    if (this.isDeleted(normalizedPath)) {
      throw this.createFsError('ENOENT', 'scandir', normalizedPath);
    }

    if (!(await this.isDirectory(normalizedPath))) {
      throw this.createFsError('ENOENT', 'scandir', normalizedPath);
    }

    const entries = new Set<string>();

    if (this.backing && (await this.isDirectoryInBacking(normalizedPath))) {
      const backingEntries = await this.backing.readdir(normalizedPath).catch(() => [] as string[]);
      for (const entry of backingEntries) {
        const childPath = path.posix.join(normalizedPath, entry);
        if (!this.isDeleted(childPath)) {
          entries.add(entry);
        }
      }
    }

    this.addVirtualChildEntries(normalizedPath, this.shadowFiles.keys(), entries);
    this.addVirtualChildEntries(normalizedPath, this.explicitDirectories.keys(), entries);

    return Array.from(entries).sort();
  }

  async unlink(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    if (await this.isDirectory(normalizedPath)) {
      throw this.createFsError('EISDIR', 'unlink', normalizedPath);
    }
    await this.rm(normalizedPath);
  }

  async rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    const recursive = Boolean(options?.recursive);
    const force = Boolean(options?.force);

    const existsInShadow = this.shadowFiles.has(normalizedPath) || this.explicitDirectories.has(normalizedPath) || this.hasVirtualDescendant(normalizedPath);
    const existsInBacking = await this.existsInBacking(normalizedPath);
    const targetExists = !this.isDeleted(normalizedPath) && (existsInShadow || existsInBacking);

    if (!targetExists) {
      if (force) return;
      throw this.createFsError('ENOENT', 'rm', normalizedPath);
    }

    const isDirectoryTarget =
      this.explicitDirectories.has(normalizedPath) ||
      this.hasVirtualDescendant(normalizedPath) ||
      (await this.isDirectoryInBacking(normalizedPath));

    if (isDirectoryTarget && !recursive) {
      throw this.createFsError('EISDIR', 'rm', normalizedPath);
    }

    this.removeShadowPath(normalizedPath, recursive);

    if (existsInBacking) {
      this.deletedPaths.add(normalizedPath);
    } else {
      this.deletedPaths.delete(normalizedPath);
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    if (this.isDeleted(normalizedPath)) {
      return false;
    }

    if (this.shadowFiles.has(normalizedPath)) {
      return false;
    }
    if (this.explicitDirectories.has(normalizedPath)) {
      return true;
    }
    if (this.hasVirtualDescendant(normalizedPath)) {
      return true;
    }

    return await this.isDirectoryInBacking(normalizedPath);
  }

  async stat(filePath: string): Promise<StatShape> {
    const normalizedPath = this.normalizePath(filePath);
    if (this.isDeleted(normalizedPath)) {
      throw this.createFsError('ENOENT', 'stat', normalizedPath);
    }

    if (this.shadowFiles.has(normalizedPath)) {
      const content = this.shadowFiles.get(normalizedPath) as string;
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: Buffer.byteLength(content, 'utf8')
      };
    }

    if (await this.isDirectory(normalizedPath)) {
      return {
        isDirectory: () => true,
        isFile: () => false,
        size: 0
      };
    }

    if (this.backing) {
      try {
        return await this.backing.stat(normalizedPath);
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
          throw this.createFsError('ENOENT', 'stat', normalizedPath);
        }
        throw error;
      }
    }

    throw this.createFsError('ENOENT', 'stat', normalizedPath);
  }

  private normalizePath(input: string): string {
    const value = String(input ?? '').replace(/\\/g, '/');
    const absolute = value.startsWith('/') ? value : `/${value}`;
    const normalized = path.posix.normalize(absolute);
    if (normalized.length > 1 && normalized.endsWith('/')) {
      return normalized.slice(0, -1);
    }
    return normalized || '/';
  }

  private createFsError(
    code: 'ENOENT' | 'EISDIR' | 'EEXIST',
    operation: string,
    targetPath: string
  ): NodeJS.ErrnoException {
    const error = new Error(`${code}: ${operation} '${targetPath}'`) as NodeJS.ErrnoException;
    error.code = code;
    error.path = targetPath;
    return error;
  }

  private async existsInBacking(targetPath: string): Promise<boolean> {
    if (!this.backing) return false;
    try {
      return await this.backing.exists(targetPath);
    } catch {
      return false;
    }
  }

  private async isDirectoryInBacking(targetPath: string): Promise<boolean> {
    if (!this.backing) return false;
    try {
      return await this.backing.isDirectory(targetPath);
    } catch {
      return false;
    }
  }

  private async isFileInBacking(targetPath: string): Promise<boolean> {
    if (!this.backing) return false;
    try {
      const stats = await this.backing.stat(targetPath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  private async readFileIfExists(targetPath: string): Promise<string> {
    if (this.shadowFiles.has(targetPath)) {
      return this.shadowFiles.get(targetPath) as string;
    }
    if (this.isDeleted(targetPath)) {
      return '';
    }
    if (!this.backing) {
      return '';
    }
    try {
      return await this.backing.readFile(targetPath);
    } catch {
      return '';
    }
  }

  private clearDeletionForPath(targetPath: string): void {
    let current = targetPath;
    while (true) {
      this.deletedPaths.delete(current);
      if (current === '/') {
        break;
      }
      current = path.posix.dirname(current);
    }
    const childPrefix = targetPath === '/' ? '/' : `${targetPath}/`;
    for (const deletedPath of Array.from(this.deletedPaths)) {
      if (deletedPath.startsWith(childPrefix)) {
        this.deletedPaths.delete(deletedPath);
      }
    }
  }

  private isDeleted(targetPath: string): boolean {
    let current = targetPath;
    while (true) {
      if (this.deletedPaths.has(current)) {
        return true;
      }
      if (current === '/') {
        return false;
      }
      current = path.posix.dirname(current);
    }
  }

  private hasVirtualDescendant(targetPath: string): boolean {
    const prefix = targetPath === '/' ? '/' : `${targetPath}/`;
    for (const filePath of this.shadowFiles.keys()) {
      if (filePath.startsWith(prefix) && !this.isDeleted(filePath)) {
        return true;
      }
    }
    for (const directoryPath of this.explicitDirectories.keys()) {
      if (directoryPath.startsWith(prefix) && !this.isDeleted(directoryPath)) {
        return true;
      }
    }
    return false;
  }

  private addVirtualChildEntries(
    dirPath: string,
    paths: Iterable<string>,
    entries: Set<string>
  ): void {
    for (const itemPath of paths) {
      if (this.isDeleted(itemPath)) {
        continue;
      }
      if (path.posix.dirname(itemPath) !== dirPath) {
        continue;
      }
      entries.add(path.posix.basename(itemPath));
    }
  }

  private removeShadowPath(targetPath: string, recursive: boolean): void {
    if (recursive) {
      const prefix = targetPath === '/' ? '/' : `${targetPath}/`;
      for (const key of Array.from(this.shadowFiles.keys())) {
        if (key === targetPath || key.startsWith(prefix)) {
          this.shadowFiles.delete(key);
        }
      }
      for (const key of Array.from(this.explicitDirectories.keys())) {
        if (key === targetPath || key.startsWith(prefix)) {
          this.explicitDirectories.delete(key);
        }
      }
      return;
    }

    this.shadowFiles.delete(targetPath);
    this.explicitDirectories.delete(targetPath);
  }
}
