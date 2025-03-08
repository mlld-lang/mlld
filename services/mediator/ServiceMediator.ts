import { singleton } from 'tsyringe';
import { IParserService } from '../pipeline/ParserService/IParserService.js';
import { IResolutionService, ResolutionContext } from '../resolution/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '../fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '../fs/PathService/IPathService.js';
import { Service } from '@core/ServiceProvider.js';

/**
 * ServiceMediator acts as a central point for breaking circular dependencies between services.
 * It stores references to services and provides methods to interact with them,
 * allowing services to communicate without directly depending on each other.
 */
@singleton()
@Service({
  description: 'Mediator service that breaks circular dependencies between core services'
})
export class ServiceMediator {
  private parserService?: IParserService;
  private resolutionService?: IResolutionService;
  private fileSystemService?: IFileSystemService;
  private pathService?: IPathService;

  // Setters for each service
  setParserService(service: IParserService): void {
    this.parserService = service;
  }
  
  setResolutionService(service: IResolutionService): void {
    this.resolutionService = service;
  }
  
  setFileSystemService(service: IFileSystemService): void {
    this.fileSystemService = service;
  }
  
  setPathService(service: IPathService): void {
    this.pathService = service;
  }

  // Mediated methods for parser ↔ resolution interaction
  
  /**
   * Resolves a variable in a given context using the resolution service
   * This method is used by the parser service to resolve variables during transformation
   */
  async resolveVariableForParser(variable: string, context: ResolutionContext): Promise<string> {
    if (!this.resolutionService) {
      throw new Error('ResolutionService not initialized in mediator');
    }
    return this.resolutionService.resolveInContext(variable, context);
  }

  /**
   * Parses content using the parser service
   * This method is used by the resolution service to parse content during variable resolution
   */
  async parseForResolution(content: string, filePath?: string): Promise<any[]> {
    if (!this.parserService) {
      throw new Error('ParserService not initialized in mediator');
    }
    return this.parserService.parse(content, filePath);
  }
  
  /**
   * Parses content with location information using the parser service
   * This is used by resolution service when source mapping is important
   */
  async parseWithLocationsForResolution(content: string, filePath?: string): Promise<any[]> {
    if (!this.parserService) {
      throw new Error('ParserService not initialized in mediator');
    }
    return this.parserService.parseWithLocations(content, filePath);
  }
  
  // Mediated methods for filesystem ↔ path interactions
  
  /**
   * Resolves a path using the path service
   * This method is used by the filesystem service to resolve paths
   */
  resolvePath(path: string): string {
    if (!this.pathService) {
      throw new Error('PathService not initialized in mediator');
    }
    return this.pathService.resolvePath(path);
  }
  
  /**
   * Normalizes a path using the path service
   * This method is used by the filesystem service for path normalization
   */
  normalizePath(path: string): string {
    if (!this.pathService) {
      throw new Error('PathService not initialized in mediator');
    }
    return this.pathService.normalizePath(path);
  }
  
  /**
   * Checks if a path is a directory using the filesystem service
   * This method is used by the path service to verify paths
   */
  async isDirectory(path: string): Promise<boolean> {
    if (!this.fileSystemService) {
      throw new Error('FileSystemService not initialized in mediator');
    }
    return this.fileSystemService.isDirectory(path);
  }
  
  /**
   * Checks if a path exists using the filesystem service
   * This method is used by the path service to verify paths
   */
  async exists(path: string): Promise<boolean> {
    if (!this.fileSystemService) {
      throw new Error('FileSystemService not initialized in mediator');
    }
    return this.fileSystemService.exists(path);
  }
}