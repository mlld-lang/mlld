import path from 'node:path';
import type { DataLabel } from '@core/types/security';
import type { IFileSystemService } from './IFileSystemService';

type StatShape = { isDirectory(): boolean; isFile(): boolean; size?: number };
type FlushScope = { path?: string };

export type VirtualFSChangeType = 'created' | 'modified' | 'deleted';
export type VirtualFSChangeEntity = 'file' | 'directory';

export interface VirtualFSChange {
  path: string;
  type: VirtualFSChangeType;
  entity: VirtualFSChangeEntity;
}

export type VirtualFSPatchOperation = 'write' | 'mkdir' | 'delete';

export interface VirtualFSSigningContext {
  identity: string;
  taint: DataLabel[];
}

export interface VirtualFSShadowEntry {
  content: string;
  signingContext?: VirtualFSSigningContext;
}

export interface VirtualFSPatchWriteEntry {
  path: string;
  op: 'write';
  content: string;
  signingContext?: VirtualFSSigningContext;
}

export interface VirtualFSPatchMkdirEntry {
  path: string;
  op: 'mkdir';
}

export interface VirtualFSPatchDeleteEntry {
  path: string;
  op: 'delete';
}

export type VirtualFSPatchEntry =
  | VirtualFSPatchWriteEntry
  | VirtualFSPatchMkdirEntry
  | VirtualFSPatchDeleteEntry;

export interface VirtualFSPatch {
  version: 1;
  entries: VirtualFSPatchEntry[];
}

export type VirtualFSFlushListener = (
  path: string,
  signingContext?: VirtualFSSigningContext
) => Promise<void> | void;

/**
 * VirtualFS is a copy-on-write filesystem overlay.
 * Reads resolve shadow state first, then fall back to optional backing storage.
 * Writes mutate shadow state only.
 */
export class VirtualFS implements IFileSystemService {
  private readonly shadowFiles = new Map<string, VirtualFSShadowEntry>();
  private readonly deletedPaths = new Set<string>();
  private readonly explicitDirectories = new Set<string>();
  private readonly flushListeners = new Set<VirtualFSFlushListener>();

  private constructor(private readonly backing?: IFileSystemService) {}

  static empty(): VirtualFS {
    return new VirtualFS();
  }

  static over(backing: IFileSystemService): VirtualFS {
    return new VirtualFS(backing);
  }

  getBackingFileSystem(): IFileSystemService | undefined {
    return this.backing;
  }

  async changes(): Promise<VirtualFSChange[]> {
    const changes: VirtualFSChange[] = [];
    const candidatePaths = new Set<string>([
      ...this.shadowFiles.keys(),
      ...this.explicitDirectories.keys(),
      ...this.deletedPaths.keys()
    ]);

    for (const candidatePath of Array.from(candidatePaths).sort()) {
      if (this.deletedPaths.has(candidatePath)) {
        changes.push({
          path: candidatePath,
          type: 'deleted',
          entity: (await this.isDirectoryInBacking(candidatePath)) ? 'directory' : 'file'
        });
        continue;
      }

      if (this.shadowFiles.has(candidatePath)) {
        const shadowContent = (this.shadowFiles.get(candidatePath) as VirtualFSShadowEntry).content;
        const existsInBacking = await this.existsInBacking(candidatePath);
        if (!existsInBacking) {
          changes.push({
            path: candidatePath,
            type: 'created',
            entity: 'file'
          });
          continue;
        }

        const backingContent = await this.readBackingFile(candidatePath);
        if (backingContent !== shadowContent) {
          changes.push({
            path: candidatePath,
            type: 'modified',
            entity: 'file'
          });
        }
        continue;
      }

      if (this.explicitDirectories.has(candidatePath) && !(await this.existsInBacking(candidatePath))) {
        changes.push({
          path: candidatePath,
          type: 'created',
          entity: 'directory'
        });
      }
    }

    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }

  async diff(): Promise<VirtualFSChange[]> {
    return await this.changes();
  }

  async fileDiff(targetPath: string): Promise<string> {
    const normalizedPath = this.normalizePath(targetPath);

    if (await this.isDirectory(normalizedPath)) {
      throw this.createFsError('EISDIR', 'open', normalizedPath);
    }

    const before = await this.readBackingFile(normalizedPath);
    const after = this.deletedPaths.has(normalizedPath)
      ? null
      : this.shadowFiles.has(normalizedPath)
        ? (this.shadowFiles.get(normalizedPath) as VirtualFSShadowEntry).content
        : before;

    if (before === null && after === null) {
      throw this.createFsError('ENOENT', 'open', normalizedPath);
    }

    if (before === after) {
      return '';
    }

    const beforeLines = this.splitLinesForDiff(before ?? '');
    const afterLines = this.splitLinesForDiff(after ?? '');
    const fileLabel = this.toDiffLabel(normalizedPath);
    const oldLabel = before === null ? '/dev/null' : `a/${fileLabel}`;
    const newLabel = after === null ? '/dev/null' : `b/${fileLabel}`;

    const hunk = this.buildUnifiedDiffHunk(beforeLines, afterLines);
    return [`--- ${oldLabel}`, `+++ ${newLabel}`, hunk, ''].join('\n');
  }

  reset(): void {
    this.shadowFiles.clear();
    this.deletedPaths.clear();
    this.explicitDirectories.clear();
  }

  discard(targetPath: string): void {
    const normalizedPath = this.normalizePath(targetPath);
    this.removeShadowPath(normalizedPath, true);
    this.deleteMatchingPaths(this.deletedPaths, normalizedPath);
  }

  export(): VirtualFSPatch {
    const entries: VirtualFSPatchEntry[] = [];

    for (const dirPath of this.explicitDirectories.keys()) {
      entries.push({
        path: dirPath,
        op: 'mkdir'
      });
    }

    for (const [filePath, content] of this.shadowFiles.entries()) {
      entries.push({
        path: filePath,
        op: 'write',
        content: content.content,
        ...(content.signingContext ? { signingContext: content.signingContext } : {})
      });
    }

    for (const deletedPath of this.deletedPaths.keys()) {
      entries.push({
        path: deletedPath,
        op: 'delete'
      });
    }

    entries.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return this.operationSortKey(a.op) - this.operationSortKey(b.op);
    });

    return {
      version: 1,
      entries
    };
  }

  apply(patch: VirtualFSPatch): void {
    if (!patch || patch.version !== 1 || !Array.isArray(patch.entries)) {
      throw new Error('Invalid VirtualFS patch');
    }

    for (const entry of patch.entries) {
      const normalizedPath = this.normalizePath(entry.path);
      if (entry.op === 'write') {
        this.shadowFiles.set(normalizedPath, {
          content: entry.content,
          ...(entry.signingContext ? { signingContext: entry.signingContext } : {})
        });
        this.clearDeletionForPath(normalizedPath);
        continue;
      }

      if (entry.op === 'mkdir') {
        this.explicitDirectories.add(normalizedPath);
        this.clearDeletionForPath(normalizedPath);
        continue;
      }

      this.removeShadowPath(normalizedPath, true);
      this.deletedPaths.add(normalizedPath);
    }
  }

  async flush(targetPath?: string): Promise<void> {
    if (!this.backing) {
      const error = new Error('VirtualFS cannot flush without backing filesystem') as NodeJS.ErrnoException;
      error.code = 'ENOTSUP';
      throw error;
    }

    const scope: FlushScope = targetPath ? { path: this.normalizePath(targetPath) } : {};
    const entries = this.selectPatchEntriesForScope(this.export().entries, scope);
    for (const entry of entries) {
      if (entry.op === 'mkdir') {
        await this.backing.mkdir(entry.path, { recursive: true });
        this.explicitDirectories.delete(entry.path);
        continue;
      }

      if (entry.op === 'write') {
        await this.backing.writeFile(entry.path, entry.content);
        const shadowEntry = this.shadowFiles.get(entry.path);
        this.shadowFiles.delete(entry.path);
        await this.notifyFlushListeners(entry.path, shadowEntry?.signingContext);
        continue;
      }

      await this.deleteFromBacking(entry.path);
      this.deletedPaths.delete(entry.path);
    }
  }

  isVirtual(): boolean {
    return true;
  }

  onFlush(listener: VirtualFSFlushListener): () => void {
    this.flushListeners.add(listener);
    return () => {
      this.flushListeners.delete(listener);
    };
  }

  setSigningContext(filePath: string, signingContext?: VirtualFSSigningContext): void {
    const normalizedPath = this.normalizePath(filePath);
    const existing = this.shadowFiles.get(normalizedPath);
    if (!existing) {
      return;
    }
    this.shadowFiles.set(normalizedPath, {
      content: existing.content,
      ...(signingContext ? { signingContext } : {})
    });
  }

  getShadowEntry(filePath: string): VirtualFSShadowEntry | undefined {
    const normalizedPath = this.normalizePath(filePath);
    const entry = this.shadowFiles.get(normalizedPath);
    if (!entry) {
      return undefined;
    }
    return {
      content: entry.content,
      ...(entry.signingContext
        ? {
            signingContext: {
              identity: entry.signingContext.identity,
              taint: [...entry.signingContext.taint]
            }
          }
        : {})
    };
  }

  toJSON(): {
    shadowFiles: Record<string, string>;
    deletedPaths: string[];
    explicitDirectories: string[];
    shadowSigningContexts?: Record<string, VirtualFSSigningContext>;
  } {
    const shadowFiles = Object.fromEntries(
      Array.from(this.shadowFiles.entries()).map(([filePath, entry]) => [filePath, entry.content])
    );
    const shadowSigningContexts = Object.fromEntries(
      Array.from(this.shadowFiles.entries())
        .filter(([, entry]) => Boolean(entry.signingContext))
        .map(([filePath, entry]) => [filePath, entry.signingContext as VirtualFSSigningContext])
    );

    return {
      shadowFiles,
      deletedPaths: Array.from(this.deletedPaths.values()),
      explicitDirectories: Array.from(this.explicitDirectories.values()),
      ...(Object.keys(shadowSigningContexts).length > 0
        ? { shadowSigningContexts }
        : {})
    };
  }

  async readFile(filePath: string): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);
    if (this.isDeleted(normalizedPath)) {
      throw this.createFsError('ENOENT', 'open', normalizedPath);
    }

    if (this.shadowFiles.has(normalizedPath)) {
      return (this.shadowFiles.get(normalizedPath) as VirtualFSShadowEntry).content;
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

    this.shadowFiles.set(normalizedPath, { content });
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
    if (normalizedPath === '/') {
      return !this.isDeleted('/');
    }
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
        if (!(await this.isDirectory(current))) {
          this.explicitDirectories.add(current);
        }
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
    if (normalizedPath === '/') {
      return !this.isDeleted('/');
    }
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
      const content = (this.shadowFiles.get(normalizedPath) as VirtualFSShadowEntry).content;
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
      return (this.shadowFiles.get(targetPath) as VirtualFSShadowEntry).content;
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

  private deleteMatchingPaths(paths: Set<string>, targetPath: string): void {
    const prefix = targetPath === '/' ? '/' : `${targetPath}/`;
    for (const value of Array.from(paths)) {
      if (value === targetPath || value.startsWith(prefix)) {
        paths.delete(value);
      }
    }
  }

  private operationSortKey(op: VirtualFSPatchOperation): number {
    switch (op) {
      case 'mkdir':
        return 0;
      case 'write':
        return 1;
      case 'delete':
        return 2;
      default:
        return 99;
    }
  }

  private selectPatchEntriesForScope(
    entries: VirtualFSPatchEntry[],
    scope: FlushScope
  ): VirtualFSPatchEntry[] {
    if (!scope.path) {
      return entries;
    }
    const prefix = scope.path === '/' ? '/' : `${scope.path}/`;
    return entries.filter(entry => entry.path === scope.path || entry.path.startsWith(prefix));
  }

  private async deleteFromBacking(targetPath: string): Promise<void> {
    if (!this.backing) {
      return;
    }

    if (typeof this.backing.rm === 'function') {
      await this.backing.rm(targetPath, { recursive: true, force: true });
      return;
    }

    if (typeof this.backing.unlink === 'function') {
      try {
        await this.backing.unlink(targetPath);
      } catch {
        // Best-effort fallback when rm/unlink support differs by backing implementation.
      }
    }
  }

  private async readBackingFile(targetPath: string): Promise<string | null> {
    if (!this.backing) return null;
    try {
      return await this.backing.readFile(targetPath);
    } catch {
      return null;
    }
  }

  private toDiffLabel(targetPath: string): string {
    return targetPath.replace(/^\/+/, '');
  }

  private async notifyFlushListeners(
    targetPath: string,
    signingContext?: VirtualFSSigningContext
  ): Promise<void> {
    if (this.flushListeners.size === 0) {
      return;
    }
    await Promise.allSettled(
      Array.from(this.flushListeners).map(async (listener) => {
        await listener(targetPath, signingContext);
      })
    );
  }

  private splitLinesForDiff(content: string): string[] {
    const normalized = content.replace(/\r\n/g, '\n');
    if (normalized.length === 0) {
      return [];
    }
    return normalized.endsWith('\n')
      ? normalized.slice(0, -1).split('\n')
      : normalized.split('\n');
  }

  private buildUnifiedDiffHunk(beforeLines: string[], afterLines: string[]): string {
    const ops = this.computeDiffOperations(beforeLines, afterLines);
    const beforeStart = beforeLines.length === 0 ? 0 : 1;
    const afterStart = afterLines.length === 0 ? 0 : 1;
    const header = `@@ -${beforeStart},${beforeLines.length} +${afterStart},${afterLines.length} @@`;
    const body = ops.map(op => {
      if (op.type === 'equal') return ` ${op.value}`;
      if (op.type === 'delete') return `-${op.value}`;
      return `+${op.value}`;
    });
    return [header, ...body].join('\n');
  }

  private computeDiffOperations(
    beforeLines: string[],
    afterLines: string[]
  ): Array<{ type: 'equal' | 'delete' | 'add'; value: string }> {
    const beforeLen = beforeLines.length;
    const afterLen = afterLines.length;
    const lcs = Array.from({ length: beforeLen + 1 }, () => new Array<number>(afterLen + 1).fill(0));

    for (let i = beforeLen - 1; i >= 0; i--) {
      for (let j = afterLen - 1; j >= 0; j--) {
        if (beforeLines[i] === afterLines[j]) {
          lcs[i][j] = lcs[i + 1][j + 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
      }
    }

    const ops: Array<{ type: 'equal' | 'delete' | 'add'; value: string }> = [];
    let i = 0;
    let j = 0;
    while (i < beforeLen && j < afterLen) {
      if (beforeLines[i] === afterLines[j]) {
        ops.push({ type: 'equal', value: beforeLines[i] });
        i++;
        j++;
        continue;
      }

      if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        ops.push({ type: 'delete', value: beforeLines[i] });
        i++;
      } else {
        ops.push({ type: 'add', value: afterLines[j] });
        j++;
      }
    }

    while (i < beforeLen) {
      ops.push({ type: 'delete', value: beforeLines[i] });
      i++;
    }
    while (j < afterLen) {
      ops.push({ type: 'add', value: afterLines[j] });
      j++;
    }

    return ops;
  }
}
