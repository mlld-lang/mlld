/**
 * Path resolution utilities for memfs testing
 */
import * as path from 'path';

/**
 * Handles consistent path resolution for memfs and real fs
 */
export class PathResolver {
  private projectRoot: string;
  
  constructor(projectRoot: string = 'project') {
    this.projectRoot = projectRoot;
  }
  
  /**
   * Convert a path for use with memfs
   */
  toMemfsPath(filePath: string): string {
    // Log for debugging
    console.log('Converting path for memfs:', filePath);
    
    // Check if path is already prefixed with project root
    if (filePath.includes(`/${this.projectRoot}/`)) {
      console.log('Path already has project prefix:', filePath);
      return filePath;
    }
    
    // Different handling based on path type
    let resolvedPath;
    
    if (filePath.startsWith('/')) {
      // Absolute path, strip leading slash for memfs
      resolvedPath = filePath.substring(1);
    } else if (filePath.startsWith('./')) {
      // Relative path with explicit ./ prefix
      resolvedPath = filePath.substring(2);
    } else {
      // Other paths - just use as is
      resolvedPath = filePath;
    }
    
    // Add project prefix if not already there
    const result = resolvedPath.startsWith(`${this.projectRoot}/`) ?
      resolvedPath :
      `${this.projectRoot}/${resolvedPath}`;
    
    console.log('Converted path:', result);
    return result;
  }
  
  /**
   * Convert a memfs path to a real fs path
   */
  fromMemfsPath(memfsPath: string): string {
    // Remove project prefix if present
    if (memfsPath.startsWith(`${this.projectRoot}/`)) {
      return `/${memfsPath.substring(this.projectRoot.length + 1)}`;
    }
    
    // Add leading slash if not present
    if (!memfsPath.startsWith('/')) {
      return `/${memfsPath}`;
    }
    
    return memfsPath;
  }
  
  /**
   * Join path segments and normalize for memfs
   */
  join(...segments: string[]): string {
    const joined = path.join(...segments);
    return this.toMemfsPath(joined);
  }
  
  /**
   * Resolve a path relative to the project root
   */
  resolve(...segments: string[]): string {
    const resolved = path.resolve(...segments);
    return this.toMemfsPath(resolved);
  }
}