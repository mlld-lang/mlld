import { IParserService } from '../pipeline/ParserService/IParserService.js';
import { IResolutionService, ResolutionContext } from '../resolution/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '../fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '../fs/PathService/IPathService.js';
import { IStateService } from '../state/StateService/IStateService.js';

/**
 * Interface for the ServiceMediator
 * Defines methods for mediating interactions between services with circular dependencies
 * 
 * @deprecated This interface is deprecated and will be removed in a future version.
 * Use the Factory Pattern instead for circular dependency resolution.
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
  /**
   * Resolves a variable in a given context using the resolution service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  resolveVariableForParser(variable: string, context: ResolutionContext): Promise<string>;
  
  /**
   * Parses content for resolution using the parser service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  parseForResolution(content: string, filePath?: string): Promise<any[]>;
  
  /**
   * Parses content with location information using the parser service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  parseWithLocationsForResolution(content: string, filePath?: string): Promise<any[]>;
  
  // Field access resolution
  /**
   * Resolves field access for complex variables
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  resolveFieldAccess(variable: string, field: string, context: ResolutionContext): Promise<unknown>;
  
  /**
   * Debug helper for field access problems
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  debugFieldAccess(variable: string, context: ResolutionContext): unknown;
  
  // FileSystem ↔ Path mediation
  /**
   * Resolves a path using the path service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use PathServiceClientFactory and FileSystemServiceClientFactory instead.
   */
  resolvePath(path: string): string;
  
  /**
   * Normalizes a path using the path service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use PathServiceClientFactory and FileSystemServiceClientFactory instead.
   */
  normalizePath(path: string): string;
  
  /**
   * Checks if a path is a directory using the filesystem service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use PathServiceClientFactory and FileSystemServiceClientFactory instead.
   */
  isDirectory(path: string): Promise<boolean>;
  
  /**
   * Checks if a path exists using the filesystem service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use PathServiceClientFactory and FileSystemServiceClientFactory instead.
   */
  exists(path: string): Promise<boolean>;
  
  // State ↔ Resolution mediation
  /**
   * Gets a text variable from the state service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getTextVar(name: string): string | undefined;
  
  /**
   * Gets a data variable from the state service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getDataVar(name: string): unknown;
  
  /**
   * Gets a path variable from the state service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getPathVar(name: string): string | undefined;
  
  /**
   * Gets all text variables from the state service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getAllTextVars(): Map<string, string>;
  
  /**
   * Gets all data variables from the state service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getAllDataVars(): Map<string, unknown>;
  
  /**
   * Gets all path variables from the state service
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getAllPathVars(): Map<string, string>;
}