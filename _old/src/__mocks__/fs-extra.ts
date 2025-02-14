import { vi } from 'vitest';
import {
  readFile,
  writeFile,
  emptyDir,
  ensureDir,
  remove,
  pathExists,
  FileSystemError,
  addMockFile,
  addMockError,
  clearMocks
} from './fs';

// Re-export all the fs mock functionality
export {
  readFile,
  writeFile,
  emptyDir,
  ensureDir,
  remove,
  pathExists,
  FileSystemError,
  addMockFile,
  addMockError,
  clearMocks
};

// Export as default for fs-extra style imports
export default {
  readFile,
  writeFile,
  emptyDir,
  ensureDir,
  remove,
  pathExists
}; 