import * as path from 'path';
import { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService.js';
import { Service } from '@core/ServiceProvider.js';
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
} 