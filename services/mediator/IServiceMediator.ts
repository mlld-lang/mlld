import { IParserService } from '../pipeline/ParserService/IParserService.js';
import { IResolutionService, ResolutionContext } from '../resolution/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '../fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '../fs/PathService/IPathService.js';
import { IStateService } from '../state/StateService/IStateService.js';

/**
 * Interface for the ServiceMediator
 * Defines methods for mediating interactions between services with circular dependencies
 */
export interface IServiceMediator {
  // Service registration methods
  /**
   * Registers a parser service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setParserService(service: IParserService): void;
  
  /**
   * Registers a resolution service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setResolutionService(service: IResolutionService): void;
  
  /**
   * Registers a file system service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setFileSystemService(service: IFileSystemService): void;
  
  /**
   * Registers a path service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setPathService(service: IPathService): void;
  
  /**
   * Registers a state service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setStateService(service: IStateService): void;
  
  // Parser ↔ Resolution mediation
  resolveVariableForParser(variable: string, context: ResolutionContext): Promise<string>;
  parseForResolution(content: string, filePath?: string): Promise<any[]>;
  parseWithLocationsForResolution(content: string, filePath?: string): Promise<any[]>;
  
  // Field access resolution
  resolveFieldAccess(variable: string, field: string, context: ResolutionContext): Promise<unknown>;
  debugFieldAccess(variable: string, context: ResolutionContext): unknown;
  
  // FileSystem ↔ Path mediation
  resolvePath(path: string): string;
  normalizePath(path: string): string;
  isDirectory(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  
  // State ↔ Resolution mediation
  getTextVar(name: string): string | undefined;
  getDataVar(name: string): unknown;
  getPathVar(name: string): string | undefined;
  getAllTextVars(): Map<string, string>;
  getAllDataVars(): Map<string, unknown>;
  getAllPathVars(): Map<string, string>;
}