import { singleton } from 'tsyringe';
import { IParserService } from '../pipeline/ParserService/IParserService.js';
import { IResolutionService, ResolutionContext } from '../resolution/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '../fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '../fs/PathService/IPathService.js';
import { IStateService } from '../state/StateService/IStateService.js';
import { Service } from '@core/ServiceProvider.js';
import { IServiceMediator } from './IServiceMediator.js';

/**
 * ServiceMediator acts as a central point for breaking circular dependencies between services.
 * It stores references to services and provides methods to interact with them,
 * allowing services to communicate without directly depending on each other.
 * 
 * @deprecated This class is deprecated and will be removed in a future version.
 * Use the Factory Pattern instead for circular dependency resolution.
 */
@singleton()
@Service({
  description: 'Mediator service that breaks circular dependencies between core services'
})
export class ServiceMediator implements IServiceMediator {
  private parserService?: IParserService;
  private resolutionService?: IResolutionService;
  private fileSystemService?: IFileSystemService;
  private pathService?: IPathService;
  private stateService?: IStateService;

  /**
   * Helper method to log deprecation warnings
   * @private
   * @param methodName - The name of the deprecated method
   * @param alternativeFactory - The name of the factory to use instead
   */
  private logDeprecationWarning(methodName: string, alternativeFactory: string): void {
    console.warn(
      `[DEPRECATED] ServiceMediator.${methodName} is deprecated and will be removed in a future version. ` +
      `Use ${alternativeFactory} instead. ` +
      `See docs/dev/DI-ARCHITECTURE.md for more information on the factory pattern.`
    );
  }

  // Setters for each service
  /**
   * Registers a parser service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setParserService(service: IParserService): void {
    this.logDeprecationWarning('setParserService', 'ParserServiceClientFactory');
    this.parserService = service;
  }
  
  /**
   * Registers a resolution service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setResolutionService(service: IResolutionService): void {
    this.logDeprecationWarning('setResolutionService', 'ResolutionServiceClientFactory');
    this.resolutionService = service;
  }
  
  /**
   * Registers a file system service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setFileSystemService(service: IFileSystemService): void {
    this.logDeprecationWarning('setFileSystemService', 'FileSystemServiceClientFactory');
    this.fileSystemService = service;
  }
  
  /**
   * Registers a path service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setPathService(service: IPathService): void {
    this.logDeprecationWarning('setPathService', 'PathServiceClientFactory');
    this.pathService = service;
  }
  
  /**
   * Registers a state service with the mediator
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use the Factory Pattern instead for circular dependency resolution.
   */
  setStateService(service: IStateService): void {
    this.logDeprecationWarning('setStateService', 'StateServiceClientFactory');
    this.stateService = service;
  }

  // Mediated methods for parser ↔ resolution interaction
  
  /**
   * Resolves a variable in a given context using the resolution service
   * This method is used by the parser service to resolve variables during transformation
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  async resolveVariableForParser(variable: string, context: ResolutionContext): Promise<string> {
    this.logDeprecationWarning('resolveVariableForParser', 'ResolutionServiceClientFactory');
    
    if (!this.resolutionService) {
      throw new Error('ResolutionService not initialized in mediator');
    }

    // First, ensure this variable passes validation in the given context
    try {
      await this.resolutionService.validateResolution(variable, context);
    } catch (error) {
      // Log and rethrow validation errors
      console.error('Validation error in resolveVariableForParser:', error);
      throw error;
    }

    return this.resolutionService.resolveInContext(variable, context);
  }

  /**
   * Resolves field access for complex variables 
   * This method is used to access fields within data variables
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  async resolveFieldAccess(variable: string, field: string, context: ResolutionContext): Promise<unknown> {
    this.logDeprecationWarning('resolveFieldAccess', 'ResolutionServiceClientFactory');
    
    if (!this.resolutionService) {
      throw new Error('ResolutionService not initialized in mediator');
    }
    
    // First check if parent variable is allowed in this context
    try {
      await this.resolutionService.validateResolution(variable, context);
    } catch (error) {
      console.error('Validation error in resolveFieldAccess:', error);
      throw error;
    }
    
    if (!this.stateService) {
      throw new Error('StateService not initialized in mediator');
    }
    
    // Get the data variable
    const data = this.stateService.getDataVar(variable);
    if (!data || typeof data !== 'object' || data === null) {
      throw new Error(`Cannot access field '${field}' of non-object variable '${variable}'`);
    }
    
    // Return the field value
    return (data as Record<string, unknown>)[field];
  }

  /**
   * Debug helper for field access problems
   * This helps diagnose issues with field access in tests
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  debugFieldAccess(variable: string, context: ResolutionContext): unknown {
    this.logDeprecationWarning('debugFieldAccess', 'ResolutionServiceClientFactory');
    
    if (!this.stateService) {
      throw new Error('StateService not initialized in mediator');
    }
    
    // Log context and available variables
    console.log('Debug field access:', {
      variable,
      context,
      textVars: [...this.stateService.getAllTextVars().entries()],
      dataVars: [...this.stateService.getAllDataVars().entries()].map(([k,v]) => [k, typeof v]),
      pathVars: [...this.stateService.getAllPathVars().entries()]
    });
    
    return this.stateService.getDataVar(variable);
  }

  /**
   * Parses content for resolution using the parser service
   * This is used by resolution service when parsing variable references
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  async parseForResolution(content: string, filePath?: string): Promise<any[]> {
    this.logDeprecationWarning('parseForResolution', 'ParserServiceClientFactory');
    
    if (!this.parserService) {
      throw new Error('ParserService not initialized in mediator');
    }
    // If filePath is provided, use parseWithLocations, otherwise use parse
    return filePath 
      ? this.parserService.parseWithLocations(content, filePath)
      : this.parserService.parse(content);
  }
  
  /**
   * Parses content with location information using the parser service
   * This is used by resolution service when source mapping is important
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use ParserServiceClientFactory and ResolutionServiceClientFactory instead.
   */
  async parseWithLocationsForResolution(content: string, filePath?: string): Promise<any[]> {
    this.logDeprecationWarning('parseWithLocationsForResolution', 'ParserServiceClientFactory');
    
    if (!this.parserService) {
      throw new Error('ParserService not initialized in mediator');
    }
    return this.parserService.parseWithLocations(content, filePath);
  }
  
  // Mediated methods for filesystem ↔ path interactions
  
  /**
   * Resolves a path using the path service
   * This is used by filesystem service to resolve paths
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use PathServiceClientFactory and FileSystemServiceClientFactory instead.
   */
  resolvePath(path: string): string {
    this.logDeprecationWarning('resolvePath', 'PathServiceClientFactory');
    
    if (!this.pathService) {
      throw new Error('PathService not initialized in mediator');
    }
    return this.pathService.resolvePath(path);
  }
  
  /**
   * Normalizes a path using the path service
   * This method is used by the filesystem service for path normalization
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use PathServiceClientFactory and FileSystemServiceClientFactory instead.
   */
  normalizePath(path: string): string {
    this.logDeprecationWarning('normalizePath', 'PathServiceClientFactory');
    
    if (!this.pathService) {
      throw new Error('PathService not initialized in mediator');
    }
    // Since IPathService doesn't have normalizePath, we'll use resolvePath instead
    return this.pathService.resolvePath(path);
  }
  
  /**
   * Checks if a path is a directory using the filesystem service
   * This method is used by the path service to verify paths
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use PathServiceClientFactory and FileSystemServiceClientFactory instead.
   */
  async isDirectory(path: string): Promise<boolean> {
    this.logDeprecationWarning('isDirectory', 'FileSystemServiceClientFactory');
    
    if (!this.fileSystemService) {
      throw new Error('FileSystemService not initialized in mediator');
    }
    return this.fileSystemService.isDirectory(path);
  }
  
  /**
   * Checks if a path exists using the filesystem service
   * This method is used by the path service to verify paths
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use PathServiceClientFactory and FileSystemServiceClientFactory instead.
   */
  async exists(path: string): Promise<boolean> {
    this.logDeprecationWarning('exists', 'FileSystemServiceClientFactory');
    
    if (!this.fileSystemService) {
      throw new Error('FileSystemService not initialized in mediator');
    }
    return this.fileSystemService.exists(path);
  }
  
  // Mediated methods for state ↔ resolution interactions
  
  /**
   * Gets a text variable from the state service
   * This method is used by the resolution service to access text variables
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getTextVar(name: string): string | undefined {
    this.logDeprecationWarning('getTextVar', 'StateServiceClientFactory');
    
    if (!this.stateService) {
      throw new Error('StateService not initialized in mediator');
    }
    return this.stateService.getTextVar(name);
  }
  
  /**
   * Gets a data variable from the state service
   * This method is used by the resolution service to access data variables
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getDataVar(name: string): unknown {
    this.logDeprecationWarning('getDataVar', 'StateServiceClientFactory');
    
    if (!this.stateService) {
      throw new Error('StateService not initialized in mediator');
    }
    return this.stateService.getDataVar(name);
  }
  
  /**
   * Gets a path variable from the state service
   * This method is used by the resolution service to access path variables
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getPathVar(name: string): string | undefined {
    this.logDeprecationWarning('getPathVar', 'StateServiceClientFactory');
    
    if (!this.stateService) {
      throw new Error('StateService not initialized in mediator');
    }
    return this.stateService.getPathVar(name);
  }
  
  /**
   * Gets all text variables from the state service
   * This method is used by the resolution service to access all text variables
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getAllTextVars(): Map<string, string> {
    this.logDeprecationWarning('getAllTextVars', 'StateServiceClientFactory');
    
    if (!this.stateService) {
      throw new Error('StateService not initialized in mediator');
    }
    return this.stateService.getAllTextVars();
  }
  
  /**
   * Gets all data variables from the state service
   * This method is used by the resolution service to access all data variables
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getAllDataVars(): Map<string, unknown> {
    this.logDeprecationWarning('getAllDataVars', 'StateServiceClientFactory');
    
    if (!this.stateService) {
      throw new Error('StateService not initialized in mediator');
    }
    return this.stateService.getAllDataVars();
  }
  
  /**
   * Gets all path variables from the state service
   * This method is used by the resolution service to access all path variables
   * 
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use StateServiceClientFactory and StateTrackingServiceClientFactory instead.
   */
  getAllPathVars(): Map<string, string> {
    this.logDeprecationWarning('getAllPathVars', 'StateServiceClientFactory');
    
    if (!this.stateService) {
      throw new Error('StateService not initialized in mediator');
    }
    return this.stateService.getAllPathVars();
  }
}