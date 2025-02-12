import { vi } from 'vitest';
import { FileSystemError } from './fs';
import * as pathModule from 'path';

const mockFiles = new Map<string, string>();
const mockErrors = new Map<string, FileSystemError>();

const normalizePath = (path: string | undefined): string => {
  if (!path) {
    throw new FileSystemError(
      'The "path" argument must be of type string or an instance of Buffer or URL. Received undefined',
      'ERR_INVALID_ARG_TYPE'
    );
  }
  return pathModule.normalize(path);
};

export const addMockFile = (path: string, content: string): void => {
  const normalizedPath = normalizePath(path);
  mockFiles.set(normalizedPath, content);
};

export const addMockError = (path: string, error: FileSystemError): void => {
  const normalizedPath = normalizePath(path);
  mockErrors.set(normalizedPath, error);
};

export const clearMocks = (): void => {
  mockFiles.clear();
  mockErrors.clear();
};

const handleError = (path: string): void => {
  const normalizedPath = normalizePath(path);
  const error = mockErrors.get(normalizedPath);
  if (error) {
    throw error;
  }
};

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
  // No need to do anything since we don't track directories
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