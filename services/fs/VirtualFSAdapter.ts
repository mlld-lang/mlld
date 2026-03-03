/**
 * VirtualFSAdapter bridges mlld's VirtualFS to just-bash's IFileSystem interface.
 *
 * This allows a just-bash Bash instance to execute commands against the same
 * copy-on-write shadow state that the mlld interpreter uses. All reads/writes
 * flow through VirtualFS, so changes(), export(), flush() etc. remain coherent.
 */

import type {
  IFileSystem,
  FsStat,
  MkdirOptions,
  RmOptions,
  CpOptions,
  ReadFileOptions,
  WriteFileOptions,
  BufferEncoding,
  FileContent,
  DirentEntry,
} from 'just-bash';
import type { VirtualFS } from './VirtualFS';

function normalizePath(p: string): string {
  // Normalize to absolute, collapse //, resolve . and ..
  const parts = p.replace(/\\/g, '/').split('/');
  const absolute = p.startsWith('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return '/' + resolved.join('/');
}

function posixDirname(p: string): string {
  const normalized = normalizePath(p);
  if (normalized === '/') return '/';
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === 0) return '/';
  return normalized.slice(0, lastSlash);
}

function posixBasename(p: string): string {
  const normalized = normalizePath(p);
  if (normalized === '/') return '/';
  const lastSlash = normalized.lastIndexOf('/');
  return normalized.slice(lastSlash + 1);
}

function posixJoin(base: string, child: string): string {
  if (child.startsWith('/')) return normalizePath(child);
  return normalizePath(base + '/' + child);
}

function contentToString(content: FileContent): string {
  if (typeof content === 'string') return content;
  // Uint8Array → string via TextDecoder
  return new TextDecoder().decode(content);
}

function stringToUint8Array(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * Adapts a mlld VirtualFS instance to satisfy just-bash's IFileSystem interface.
 *
 * Limitations vs. a full POSIX fs:
 * - No symlink support (VirtualFS has no symlink concept) — symlink/readlink/lstat
 *   throw ENOSYS. Commands that rely on symlinks will fail gracefully.
 * - No binary content (VirtualFS stores strings) — readFileBuffer returns UTF-8 encoded bytes.
 * - No file mode/permissions — chmod is a no-op, modes default to 0o644/0o755.
 * - No mtime tracking — stat returns epoch, utimes is a no-op.
 */
export class VirtualFSAdapter implements IFileSystem {
  constructor(private readonly vfs: VirtualFS) {}

  // ─── Core read/write ──────────────────────────────────────────────

  async readFile(
    path: string,
    _options?: ReadFileOptions | BufferEncoding
  ): Promise<string> {
    return await this.vfs.readFile(normalizePath(path));
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const content = await this.vfs.readFile(normalizePath(path));
    return stringToUint8Array(content);
  }

  async writeFile(
    path: string,
    content: FileContent,
    _options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    await this.vfs.writeFile(normalizePath(path), contentToString(content));
  }

  async appendFile(
    path: string,
    content: FileContent,
    _options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    await this.vfs.appendFile(normalizePath(path), contentToString(content));
  }

  // ─── Existence / stat ─────────────────────────────────────────────

  async exists(path: string): Promise<boolean> {
    return await this.vfs.exists(normalizePath(path));
  }

  async stat(path: string): Promise<FsStat> {
    const normalized = normalizePath(path);
    const vfsStat = await this.vfs.stat(normalized);
    return {
      isFile: vfsStat.isFile(),
      isDirectory: vfsStat.isDirectory(),
      isSymbolicLink: false,
      mode: vfsStat.isDirectory() ? 0o755 : 0o644,
      size: vfsStat.size ?? 0,
      mtime: new Date(0),
    };
  }

  async lstat(path: string): Promise<FsStat> {
    // No symlinks — lstat === stat
    return await this.stat(path);
  }

  // ─── Directories ──────────────────────────────────────────────────

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    await this.vfs.mkdir(normalizePath(path), options);
  }

  async readdir(path: string): Promise<string[]> {
    return await this.vfs.readdir(normalizePath(path));
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const normalized = normalizePath(path);
    const names = await this.vfs.readdir(normalized);
    const entries: DirentEntry[] = [];
    for (const name of names) {
      const childPath = posixJoin(normalized, name);
      const isDir = await this.vfs.isDirectory(childPath);
      entries.push({
        name,
        isFile: !isDir,
        isDirectory: isDir,
        isSymbolicLink: false,
      });
    }
    return entries;
  }

  // ─── Remove / unlink ──────────────────────────────────────────────

  async rm(path: string, options?: RmOptions): Promise<void> {
    await this.vfs.rm(normalizePath(path), options);
  }

  // ─── Copy / move ──────────────────────────────────────────────────

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const srcNorm = normalizePath(src);
    const destNorm = normalizePath(dest);
    const recursive = Boolean(options?.recursive);

    if (await this.vfs.isDirectory(srcNorm)) {
      if (!recursive) {
        const error = new Error(
          `EISDIR: cp '${srcNorm}' is a directory (not copied)`
        ) as NodeJS.ErrnoException;
        error.code = 'EISDIR';
        throw error;
      }
      await this._copyDirRecursive(srcNorm, destNorm);
    } else {
      const content = await this.vfs.readFile(srcNorm);
      // If dest is an existing directory, copy into it
      if (await this.vfs.isDirectory(destNorm)) {
        await this.vfs.writeFile(
          posixJoin(destNorm, posixBasename(srcNorm)),
          content
        );
      } else {
        await this.vfs.writeFile(destNorm, content);
      }
    }
  }

  private async _copyDirRecursive(src: string, dest: string): Promise<void> {
    await this.vfs.mkdir(dest, { recursive: true });
    const entries = await this.vfs.readdir(src);
    for (const entry of entries) {
      const srcChild = posixJoin(src, entry);
      const destChild = posixJoin(dest, entry);
      if (await this.vfs.isDirectory(srcChild)) {
        await this._copyDirRecursive(srcChild, destChild);
      } else {
        const content = await this.vfs.readFile(srcChild);
        await this.vfs.writeFile(destChild, content);
      }
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.cp(src, dest, { recursive: true });
    await this.vfs.rm(normalizePath(src), { recursive: true });
  }

  // ─── Path utilities ───────────────────────────────────────────────

  resolvePath(base: string, path: string): string {
    return posixJoin(base, path);
  }

  getAllPaths(): string[] {
    // Export patch entries give us all shadow paths; for a full picture we'd
    // need backing paths too, but just-bash uses this mainly for glob matching
    // on in-memory content. Return what we can from the patch export.
    const patch = this.vfs.export();
    return patch.entries
      .filter((e) => e.op !== 'delete')
      .map((e) => e.path)
      .sort();
  }

  // ─── Permissions (no-op for VirtualFS) ────────────────────────────

  async chmod(_path: string, _mode: number): Promise<void> {
    // VirtualFS has no permission model — silently accept
  }

  // ─── Symlinks (unsupported) ───────────────────────────────────────

  async symlink(_target: string, _linkPath: string): Promise<void> {
    const error = new Error('ENOSYS: symlinks not supported in VirtualFS') as NodeJS.ErrnoException;
    error.code = 'ENOSYS';
    throw error;
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    // Hard link = copy content (best-effort approximation)
    const content = await this.vfs.readFile(normalizePath(existingPath));
    await this.vfs.writeFile(normalizePath(newPath), content);
  }

  async readlink(_path: string): Promise<string> {
    const error = new Error('ENOSYS: symlinks not supported in VirtualFS') as NodeJS.ErrnoException;
    error.code = 'ENOSYS';
    throw error;
  }

  async realpath(path: string): Promise<string> {
    // No symlinks — normalized absolute path is the canonical path
    const normalized = normalizePath(path);
    if (!(await this.vfs.exists(normalized))) {
      const error = new Error(`ENOENT: realpath '${normalized}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.path = normalized;
      throw error;
    }
    return normalized;
  }

  // ─── Timestamps (no-op for VirtualFS) ─────────────────────────────

  async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> {
    // VirtualFS has no timestamp model — silently accept
  }
}
