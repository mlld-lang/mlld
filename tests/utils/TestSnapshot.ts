import { MemfsTestFileSystem } from './MemfsTestFileSystem';

/**
 * Result of comparing two filesystem snapshots
 */
export interface SnapshotDiff {
  /**
   * Files that were added
   */
  added: string[];

  /**
   * Files that were removed
   */
  removed: string[];

  /**
   * Files that were modified
   */
  modified: string[];

  /**
   * Map of modified files to their new contents
   */
  modifiedContents: Map<string, string>;
}

/**
 * Utility for taking and comparing filesystem snapshots
 */
export class TestSnapshot {
  constructor(private fs: MemfsTestFileSystem) {}

  /**
   * Take a snapshot of the current filesystem state
   */
  async takeSnapshot(dir: string = '/'): Promise<Map<string, string>> {
    const snapshot = new Map<string, string>();
    await this.snapshotDirectory(dir, snapshot);
    return snapshot;
  }

  /**
   * Compare two snapshots and return the differences
   */
  compare(before: Map<string, string>, after: Map<string, string>): SnapshotDiff {
    const result: SnapshotDiff = {
      added: [],
      removed: [],
      modified: [],
      modifiedContents: new Map()
    };

    // Find added and modified files
    for (const [path, content] of after) {
      if (!before.has(path)) {
        result.added.push(path);
      } else if (before.get(path) !== content) {
        result.modified.push(path);
        result.modifiedContents.set(path, content);
      }
    }

    // Find removed files
    for (const path of before.keys()) {
      if (!after.has(path)) {
        result.removed.push(path);
      }
    }

    // Sort arrays for consistent results
    result.added.sort();
    result.removed.sort();
    result.modified.sort();

    return result;
  }

  /**
   * Take a snapshot of a directory and its contents recursively
   */
  private async snapshotDirectory(dir: string, snapshot: Map<string, string>): Promise<void> {
    try {
      const entries = await this.fs.readDir(dir);

      for (const entry of entries) {
        const fullPath = dir === '/' ? `/${entry}` : `${dir}/${entry}`;

        if (await this.fs.isFile(fullPath)) {
          const content = await this.fs.readFile(fullPath);
          snapshot.set(fullPath, content);
        } else if (await this.fs.isDirectory(fullPath)) {
          await this.snapshotDirectory(fullPath, snapshot);
        }
      }
    } catch (error) {
      if (error.message.includes('ENOENT: no such directory')) {
        // Directory doesn't exist, return empty snapshot
        return;
      }
      throw error;
    }
  }
} 