import { vi } from 'vitest';
import { FileSystemError, mockFiles, handleError, normalizePath } from './fs';

export const readFile = vi.fn(async (path: string, encoding?: string): Promise<string> => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  const content = mockFiles.get(normalizedPath);
  if (!content) {
    throw new FileSystemError(`ENOENT: no such file or directory, open '${path}'`, 'ENOENT');
  }
  return content;
});

export const writeFile = vi.fn(async (path: string, content: string): Promise<void> => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  mockFiles.set(normalizedPath, content);
});

export const mkdir = vi.fn(async (path: string): Promise<void> => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  if (!mockFiles.has(normalizedPath)) {
    mockFiles.set(normalizedPath, '');
  }
});

export const access = vi.fn(async (path: string): Promise<void> => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  if (!mockFiles.has(normalizedPath)) {
    throw new FileSystemError(`ENOENT: no such file or directory, access '${path}'`, 'ENOENT');
  }
});

export const stat = vi.fn(async (path: string) => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  if (!mockFiles.has(normalizedPath)) {
    throw new FileSystemError(`ENOENT: no such file or directory, stat '${path}'`, 'ENOENT');
  }
  return {
    isFile: () => true,
    isDirectory: () => false,
  };
});

// Export both named exports and a default export with all methods
export default {
  readFile,
  writeFile,
  mkdir,
  access,
  stat,
}; 