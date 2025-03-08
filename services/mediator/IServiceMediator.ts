import { IParserService } from '../pipeline/ParserService/IParserService.js';
import { IResolutionService, ResolutionContext } from '../resolution/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '../fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '../fs/PathService/IPathService.js';

/**
 * Interface for the ServiceMediator
 * Defines methods for mediating interactions between services with circular dependencies
 */
export interface IServiceMediator {
  // Service registration methods
  setParserService(service: IParserService): void;
  setResolutionService(service: IResolutionService): void;
  setFileSystemService(service: IFileSystemService): void;
  setPathService(service: IPathService): void;
  
  // Parser ↔ Resolution mediation
  resolveVariableForParser(variable: string, context: ResolutionContext): Promise<string>;
  parseForResolution(content: string, filePath?: string): Promise<any[]>;
  parseWithLocationsForResolution(content: string, filePath?: string): Promise<any[]>;
  
  // FileSystem ↔ Path mediation
  resolvePath(path: string): string;
  normalizePath(path: string): string;
  isDirectory(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}