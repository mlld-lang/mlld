/**
 * Filesystem adapter for Node.js fs module
 */
import * as fs from 'fs';
import type { IFileSystemAdapter } from './explorer.js';

/**
 * Adapter that wraps Node's fs module to implement IFileSystemAdapter
 */
export class NodeFsAdapter implements IFileSystemAdapter {
  writeFileSync(path: string, content: string, encoding?: string): void {
    fs.writeFileSync(path, content, encoding ? { encoding: encoding as BufferEncoding } : undefined);
  }

  readFileSync(path: string, encoding?: string): string {
    return fs.readFileSync(path, encoding ? { encoding: encoding as BufferEncoding } : undefined).toString();
  }

  existsSync(path: string): boolean {
    return fs.existsSync(path);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    fs.mkdirSync(path, options);
  }

  readdirSync(path: string): string[] {
    return fs.readdirSync(path);
  }

  rmSync(path: string, options?: { recursive?: boolean, force?: boolean }): void {
    fs.rmSync(path, options);
  }
}

// Singleton instance
export const nodeFsAdapter = new NodeFsAdapter();