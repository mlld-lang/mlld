import { vi } from 'vitest';
import * as pathModule from 'path';

export class FileSystemError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'FileSystemError';
    this.code = code;
  }
}

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

// Core fs methods
export const existsSync = vi.fn((path: string): boolean => {
  try {
    handleError(path);
    const normalizedPath = normalizePath(path);
    return mockFiles.has(normalizedPath);
  } catch (error) {
    return false;
  }
});

export const readFileSync = vi.fn((path: string, encoding?: string | { encoding?: string }): string => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  const content = mockFiles.get(normalizedPath);
  if (!content) {
    throw new FileSystemError(`ENOENT: no such file or directory, open '${path}'`, 'ENOENT');
  }
  return content;
});

export const writeFileSync = vi.fn((path: string, content: string): void => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  mockFiles.set(normalizedPath, content);
});

// fs/promises methods
export const promises = {
  readFile: vi.fn(async (path: string, encoding?: string | { encoding?: string }): Promise<string> => {
    handleError(path);
    const normalizedPath = normalizePath(path);
    const content = mockFiles.get(normalizedPath);
    if (!content) {
      throw new FileSystemError(`ENOENT: no such file or directory, open '${path}'`, 'ENOENT');
    }
    return content;
  }),

  writeFile: vi.fn(async (path: string, content: string): Promise<void> => {
    handleError(path);
    const normalizedPath = normalizePath(path);
    mockFiles.set(normalizedPath, content);
  }),
};

// fs-extra methods
export const emptyDir = vi.fn(async (path: string): Promise<void> => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  for (const [key] of mockFiles) {
    if (key.startsWith(normalizedPath)) {
      mockFiles.delete(key);
    }
  }
});

export const ensureDir = vi.fn(async (path: string): Promise<void> => {
  handleError(path);
  // No need to do anything since we don't track directories
});

export const remove = vi.fn(async (path: string): Promise<void> => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  mockFiles.delete(normalizedPath);
});

export const pathExists = vi.fn(async (path: string): Promise<boolean> => {
  try {
    handleError(path);
    const normalizedPath = normalizePath(path);
    return mockFiles.has(normalizedPath);
  } catch (error) {
    return false;
  }
});

// Add fs-extra methods to the default export
export const writeFile = vi.fn(async (path: string, content: string): Promise<void> => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  mockFiles.set(normalizedPath, content);
});

export const readFile = vi.fn(async (path: string, encoding?: string | { encoding?: string }): Promise<string> => {
  handleError(path);
  const normalizedPath = normalizePath(path);
  const content = mockFiles.get(normalizedPath);
  if (!content) {
    throw new FileSystemError(`ENOENT: no such file or directory, open '${path}'`, 'ENOENT');
  }
  return content;
});

// Export everything needed for both fs and fs-extra
export default {
  existsSync,
  readFileSync,
  writeFileSync,
  promises,
  emptyDir,
  ensureDir,
  remove,
  pathExists,
  writeFile,
  readFile
};