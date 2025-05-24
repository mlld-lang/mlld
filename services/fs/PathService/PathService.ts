import * as path from 'path';
import type { IPathService } from './IPathService';

/**
 * Default path service implementation using Node.js path module
 */
export class PathService implements IPathService {
  resolve(...segments: string[]): string {
    return path.resolve(...segments);
  }
  
  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
  
  join(...segments: string[]): string {
    return path.join(...segments);
  }
  
  dirname(filePath: string): string {
    return path.dirname(filePath);
  }
  
  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }
  
  extname(filePath: string): string {
    return path.extname(filePath);
  }
  
  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }
  
  normalize(filePath: string): string {
    return path.normalize(filePath);
  }
}