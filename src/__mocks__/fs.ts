import { vi } from 'vitest';
import type { PathLike } from 'fs';

// Custom error class for file system errors
class FileSystemError extends Error {
  code: string;
  
  constructor(message: string, code: string) {
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
  // Simple path normalization without relying on path.normalize
  return path.replace(/\\/g, '/').replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '');
};

const addMockFile = (path: string, content: string) => {
  const normalizedPath = normalizePath(path);
  mockFiles.set(normalizedPath, content);
  mockErrors.delete(normalizedPath);
};

const addMockError = (path: string, error: FileSystemError) => {
  const normalizedPath = normalizePath(path);
  mockErrors.set(normalizedPath, error);
  mockFiles.delete(normalizedPath);
};

const clearMocks = () => {
  mockFiles.clear();
  mockErrors.clear();
};

const handleError = (path: string): never => {
  const normalizedPath = normalizePath(path);
  if (mockErrors.has(normalizedPath)) {
    throw mockErrors.get(normalizedPath)!;
  }
  throw new FileSystemError(
    `ENOENT: no such file or directory, open '${path}'`,
    'ENOENT'
  );
};

const readFile = (path: string): string => {
  const normalizedPath = normalizePath(path);
  if (!mockFiles.has(normalizedPath)) {
    handleError(path);
  }
  return mockFiles.get(normalizedPath)!;
};

const readFileSync = vi.fn((path: PathLike, encoding?: string | { encoding?: string }) => {
  return readFile(path.toString());
});

const promises = {
  readFile: vi.fn(async (path: PathLike, encoding?: string | { encoding?: string }) => {
    return readFile(path.toString());
  })
};

const existsSync = vi.fn((path: PathLike) => {
  const normalizedPath = normalizePath(path.toString());
  return mockFiles.has(normalizedPath);
});

export {
  addMockFile,
  addMockError,
  clearMocks,
  readFileSync,
  existsSync,
  promises,
  FileSystemError
};

// Default export for compatibility
export default {
  readFileSync,
  existsSync,
  promises,
  addMockFile,
  addMockError,
  clearMocks,
}; 