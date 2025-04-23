import * as path from 'path';
import type { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService';
import { Service } from '@core/ServiceProvider';
import { injectable } from 'tsyringe';

@injectable()
@Service({
  description: 'Service that provides path manipulation operations'
})
export class PathOperationsService implements IPathOperationsService {
  join(...paths: string[]): string {
    return path.join(...paths);
  }

  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  normalize(filePath: string): string {
    return path.normalize(filePath);
  }

  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  parse(filePath: string): path.ParsedPath {
    return path.parse(filePath);
  }
  
  /**
   * Resolves a path to its absolute form.
   * This is an alias for the resolve method to maintain compatibility with IPathServiceClient.
   * 
   * @param filePath - The path to resolve
   * @param baseDir - Optional base directory for relative paths
   * @returns The resolved absolute path
   */
  resolvePath(filePath: string, baseDir?: string): string {
    if (baseDir) {
      return this.resolve(baseDir, filePath);
    }
    return this.resolve(filePath);
  }
} 