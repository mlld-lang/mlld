import { NodeFileSystem } from './NodeFileSystem';
import type { IFileSystemService } from './IFileSystemService';

/**
 * FileSystemService is just an alias for the concrete implementation
 * In the future, this could be a factory or abstract class
 */
export class FileSystemService extends NodeFileSystem implements IFileSystemService {
  // Currently just extends NodeFileSystem
  // Could add additional functionality here if needed
}