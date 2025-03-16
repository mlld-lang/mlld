import '@core/di-config.js';
import * as path from 'path';
import { resolveService, registerServiceInstance } from '@core/ServiceProvider.js';
import type { MeldNode } from '@core/syntax/types/index.js';
import type { StateServiceLike, ResolutionServiceLike } from '@core/shared-service-types.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { directiveLogger } from '@core/utils/logger.js';

// Core services (implementation classes - keep as regular exports)
export * from '@services/pipeline/InterpreterService/InterpreterService.js';
export * from '@services/pipeline/ParserService/ParserService.js';
export * from '@services/state/StateService/StateService.js';
export * from '@services/resolution/ResolutionService/ResolutionService.js';
export * from '@services/pipeline/DirectiveService/DirectiveService.js';
export * from '@services/resolution/ValidationService/ValidationService.js';
export * from '@services/fs/PathService/PathService.js';
export * from '@services/fs/FileSystemService/FileSystemService.js';
export * from '@services/fs/FileSystemService/PathOperationsService.js';
export * from '@services/pipeline/OutputService/OutputService.js';
export * from '@services/resolution/CircularityService/CircularityService.js';

// Core types and errors - use type-only exports for types
export * from '@core/types/index.js';
export * from '@core/errors/MeldDirectiveError.js';
export * from '@core/errors/MeldInterpreterError.js';
export * from '@core/errors/MeldParseError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';

// Import simple API helpers
import { runMeld as runMeldImpl, MemoryFileSystem } from '@api/run-meld.js';

// Re-export runMeld as both named and default export for ease of use
export { runMeld } from './run-meld.js';
export { MemoryFileSystem } from './run-meld.js';

// Default export of runMeld for simplicity
export default runMeldImpl;

// Import service classes
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import { ProcessOptions, Services } from '@core/types/index.js';
import type { IStateDebuggerService } from '@tests/utils/debug/StateDebuggerService/IStateDebuggerService.js';

// Import service factory types
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import { StateServiceClientFactory } from '@services/state/StateService/factories/StateServiceClientFactory.js';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';

// Import debug services
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService.js';
import { interpreterLogger as logger } from '@core/utils/logger.js';

// Package info
export { version } from '@core/version.js';

import { validateServicePipeline } from '@core/utils/serviceValidation.js';

// Define the required services type
type RequiredServices = {
  filesystem: FileSystemService;
  parser: ParserService;
  interpreter: InterpreterService;
  directive: DirectiveService;
  state: StateService;
  output: OutputService;
  eventService: StateEventService;
  path: PathService;
  validation: ValidationService;
  circularity: CircularityService;
  resolution: ResolutionService;
  debug?: StateDebuggerService;
};

export function createDefaultServices(options: ProcessOptions): Services & RequiredServices {
  // DI is always used now
  
  // If a custom filesystem is provided, register it with the container
  if (options.fs) {
    registerServiceInstance('IFileSystem', options.fs);
    registerServiceInstance('NodeFileSystem', options.fs);
  }
  
  // Ensure DirectiveLogger is registered in case it wasn't in this container
  registerServiceInstance('DirectiveLogger', directiveLogger);
  
  // Resolve services from the container with proper type assertions
  const filesystem = resolveService<FileSystemService>('FileSystemService');
  const path = resolveService<PathService>('PathService');
  const eventService = resolveService<StateEventService>('StateEventService');
  const state = resolveService<StateService>('StateService');
  const parser = resolveService<ParserService>('ParserService');
  const resolution = resolveService<ResolutionService>('ResolutionService');
  const validation = resolveService<ValidationService>('ValidationService');
  const circularity = resolveService<CircularityService>('CircularityService');
  const directive = resolveService<DirectiveService>('DirectiveService');
  const interpreter = resolveService<InterpreterService>('InterpreterService');
  const output = resolveService<OutputService>('OutputService');
  
  // Initialize special path variables
  state.setPathVar('PROJECTPATH', process.cwd());
  state.setPathVar('HOMEPATH', process.env.HOME || process.env.USERPROFILE || '/home');

  // Create debug service if requested
  let debug: StateDebuggerService | undefined = undefined;
  if (options.debug) {
    try {
      // Try to resolve from the container first
      debug = resolveService<StateDebuggerService>('StateDebuggerService');
    } catch (e) {
      // If not available in container, create manually
      const debugService = new TestDebuggerService(state);
      debugService.initialize(state);
      // Use unknown as an intermediate type for the conversion
      debug = debugService as unknown as StateDebuggerService;
    }
  }
  
  // Create services object in correct initialization order based on dependencies
  const services: Services & RequiredServices = {
    // Base services
    filesystem,
    path,
    // State management
    eventService,
    state,
    // Core pipeline
    parser,
    // Resolution layer
    resolution,
    validation,
    circularity,
    // Pipeline orchestration
    directive,
    interpreter,
    // Output generation
    output,
    // Optional debug service
    debug
  };

  // Validate the service pipeline
  validateServicePipeline(services);

  // Register services with the container
  registerServiceInstance('IFileSystemService', services.filesystem);
  registerServiceInstance('IPathService', services.path);
  registerServiceInstance('IStateService', services.state);
  registerServiceInstance('IStateEventService', services.eventService);
  registerServiceInstance('IParserService', services.parser);
  registerServiceInstance('IInterpreterService', services.interpreter);
  registerServiceInstance('IDirectiveService', services.directive);
  registerServiceInstance('IOutputService', services.output);
  registerServiceInstance('IValidationService', services.validation);
  registerServiceInstance('ICircularityService', services.circularity);
  registerServiceInstance('IResolutionService', services.resolution as unknown as ResolutionServiceLike);
  
  if (services.debug) {
    // Register debug service with the container
    registerServiceInstance('IStateDebuggerService', services.debug);
  }

  return services;
}

export async function main(filePath: string, options: ProcessOptions = {}): Promise<string> {
  // Create default services
  const defaultServices = createDefaultServices(options);

  // Merge with provided services and ensure proper initialization
  const services = options.services ? { ...defaultServices, ...options.services } as Services & RequiredServices : defaultServices;

  // Validate the service pipeline after merging
  validateServicePipeline(services);

  // Initialize service clients using factories
  try {
    // Get factories from the container with proper type assertions
    const pathClientFactory = resolveService<PathServiceClientFactory>('PathServiceClientFactory');
    const fileSystemClientFactory = resolveService<FileSystemServiceClientFactory>('FileSystemServiceClientFactory');
    const parserClientFactory = resolveService<ParserServiceClientFactory>('ParserServiceClientFactory');
    const resolutionClientFactory = resolveService<ResolutionServiceClientFactory>('ResolutionServiceClientFactory');
    const stateClientFactory = resolveService<StateServiceClientFactory>('StateServiceClientFactory');
    const stateTrackingClientFactory = resolveService<StateTrackingServiceClientFactory>('StateTrackingServiceClientFactory');
    
    // Create clients and connect services
    if (services.filesystem && fileSystemClientFactory) {
      try {
        const pathClient = pathClientFactory.createClient();
        // Use type assertion for property assignment
        (services.filesystem as any)['pathClient'] = pathClient;
        logger.debug('Successfully created PathServiceClient for FileSystemService');
      } catch (error) {
        logger.warn('Failed to create PathServiceClient for FileSystemService', { error });
      }
    }
    
    if (services.path && pathClientFactory) {
      try {
        const fileSystemClient = fileSystemClientFactory.createClient();
        // Use type assertion for property assignment
        (services.path as any)['fileSystemClient'] = fileSystemClient;
        logger.debug('Successfully created FileSystemServiceClient for PathService');
      } catch (error) {
        logger.warn('Failed to create FileSystemServiceClient for PathService', { error });
      }
    }
    
    if (services.parser && parserClientFactory) {
      try {
        const resolutionClient = resolutionClientFactory.createClient();
        // Use type assertion for property assignment
        (services.parser as any)['resolutionClient'] = resolutionClient;
        logger.debug('Successfully created ResolutionServiceClient for ParserService');
      } catch (error) {
        logger.warn('Failed to create ResolutionServiceClient for ParserService', { error });
      }
    }
    
    if (services.resolution && resolutionClientFactory) {
      try {
        const parserClient = parserClientFactory.createClient();
        // Use type assertion for property assignment
        (services.resolution as any)['parserClient'] = parserClient;
        logger.debug('Successfully created ParserServiceClient for ResolutionService');
      } catch (error) {
        logger.warn('Failed to create ParserServiceClient for ResolutionService', { error });
      }
    }
    
    if (services.state && stateClientFactory && stateTrackingClientFactory) {
      try {
        const stateTrackingClient = stateTrackingClientFactory.createClient();
        // Use type assertion for property assignment - renamed from stateTrackingClient to trackingClient
        (services.state as any)['trackingClient'] = stateTrackingClient;
        logger.debug('Successfully created StateTrackingServiceClient for StateService');
      } catch (error) {
        logger.warn('Failed to create StateTrackingServiceClient for StateService', { error });
      }
    }
  } catch (error) {
    logger.warn('Failed to resolve one or more service factories', { error });
  }

  // Get the interpreter service client factory
  const interpreterServiceClientFactory = resolveService<InterpreterServiceClientFactory>('InterpreterServiceClientFactory');
  
  // Re-initialize directive and interpreter services to ensure they have the correct dependencies
  services.directive.initialize(
    services.validation,
    services.state,
    services.path,
    services.filesystem,
    services.parser,
    interpreterServiceClientFactory,
    services.circularity,
    services.resolution
  );

  // Re-initialize interpreter with directive
  services.interpreter.initialize(services.directive, services.state);

  // If directive service was injected, we need to re-initialize it and the interpreter
  if (options.services?.directive) {
    const directive = services.directive;
    const interpreter = services.interpreter;

    // Re-initialize directive with interpreter
    directive.registerDefaultHandlers();
  }

  try {
    // Read the file
    const content = await services.filesystem.readFile(filePath);
    
    // Parse the content
    const ast = await services.parser.parse(content);
    
    // Transformation is always enabled now, but we still handle the options parameter for backward compatibility
    if (options.transformation) {
      // This call has no effect (transformation is always true), but we keep it for backward compatibility
      if (typeof options.transformation === 'boolean') {
        services.state.enableTransformation(true);
      } else {
        services.state.enableTransformation(true);
      }
      
      // Add debugging for transformation settings
      logger.debug('Transformation enabled (always true now)', {
        isEnabled: true, // Always true
        options: services.state.getTransformationOptions?.()
      });
    }
    
    // Interpret the AST
    const resultState = await services.interpreter.interpret(ast, { 
      filePath, 
      initialState: services.state,
      strict: true  // Add strict mode to ensure validation errors are propagated
    });
    
    // Check for path directives with invalid paths
    const pathDirectives = ast.filter(node => 
      node.type === 'Directive' && 
      (node as any).directive && 
      (node as any).directive.kind === 'path'
    );
    
    if (pathDirectives.length > 0) {
      for (const pathNode of pathDirectives) {
        const pathValue = (pathNode as any).directive.path?.raw || (pathNode as any).directive.value;
        
        // Check for absolute paths
        if (typeof pathValue === 'string' && path.isAbsolute(pathValue)) {
          throw new Error(`Path directive must use a special path variable: ${pathValue}`);
        }
        
        // Check for relative paths with dot segments, but exclude special prefixes $. and $~
        if (typeof pathValue === 'string') {
          // Skip validation for special path prefixes $. and $~
          if (!pathValue.startsWith('$.') && !pathValue.startsWith('$~') && 
              !pathValue.startsWith('"$.') && !pathValue.startsWith('"$~') && 
              !pathValue.startsWith('\'$.') && !pathValue.startsWith('\'$~')) {
            // Also properly handle path values that may be wrapped in quotes
            let valueToCheck = pathValue;
            // Remove quotes if present (handles both single and double quotes)
            if ((valueToCheck.startsWith('"') && valueToCheck.endsWith('"')) || 
                (valueToCheck.startsWith('\'') && valueToCheck.endsWith('\''))) {
              valueToCheck = valueToCheck.substring(1, valueToCheck.length - 1);
            }
            
            // Check for problematic relative segments
            if (valueToCheck.includes('./') || valueToCheck.includes('../')) {
              throw new Error(`Path cannot contain relative segments: ${pathValue}`);
            }
          }
        }
      }
    }
    
    // Transformation is always enabled
    // This is maintained for backward compatibility, but transformation is now always enabled
    {
      // Ensure transformation is always enabled, regardless of what was passed in options
      resultState.enableTransformation(true);
      
      // Add debugging for resultState transformation settings
      logger.debug('ResultState transformation settings (always enabled)', {
        isEnabled: true, // Always true
        options: resultState.getTransformationOptions?.()
      });

      // IMPORTANT FIX: After interpretation, copy all variables from resultState back to the original state
      // This ensures that variables from imports are properly propagated back to the state
      // referenced by the test context
      if (typeof resultState.getAllTextVars === 'function' && 
          typeof services.state.setTextVar === 'function') {
        // Copy text variables
        const textVars = resultState.getAllTextVars();
        textVars.forEach((value, key) => {
          services.state.setTextVar(key, value);
        });
        
        // Copy data variables
        if (typeof resultState.getAllDataVars === 'function' && 
            typeof services.state.setDataVar === 'function') {
          const dataVars = resultState.getAllDataVars();
          dataVars.forEach((value, key) => {
            services.state.setDataVar(key, value);
          });
        }
        
        // Copy path variables
        if (typeof resultState.getAllPathVars === 'function' && 
            typeof services.state.setPathVar === 'function') {
          const pathVars = resultState.getAllPathVars();
          pathVars.forEach((value, key) => {
            services.state.setPathVar(key, value);
          });
        }
        
        // Copy commands
        if (typeof resultState.getAllCommands === 'function' && 
            typeof services.state.setCommand === 'function') {
          const commands = resultState.getAllCommands();
          commands.forEach((value, key) => {
            services.state.setCommand(key, value);
          });
        }
      }
    }
    
    // Always use transformed nodes now
    const nodesToProcess = resultState.getTransformedNodes();
    
    // Convert to desired format using the updated state
    // Cast resultState to IStateService since it has all the required methods but TypeScript doesn't recognize it
    let converted = await services.output.convert(nodesToProcess, resultState as unknown as IStateService, options.format || 'xml');
    
    // Always check for unresolved variables (transformation is always enabled)
    // Check for any remaining unresolved variable references
    const variableRegex = /\{\{([^{}]+)\}\}/g;
    const matches = Array.from(converted.matchAll(variableRegex));
    
    // Only process if there are actual unresolved variables
    if (matches.length > 0) {
      for (const match of matches) {
        const fullMatch = match[0]; // The entire match, e.g., {{variable}}
        const variableName = match[1].trim(); // The variable name, e.g., variable
        
        // Try to get the variable value from the state
        let value;
        // Try text variable first
        value = resultState.getTextVar(variableName);
        
        // If not found as text variable, try data variable
        if (value === undefined) {
          value = resultState.getDataVar(variableName);
        }
        
        // If a value was found, replace the variable reference with its value
        if (value !== undefined) {
          const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          converted = converted.replace(fullMatch, stringValue);
        }
      }
    }
    
    return converted;
  } catch (error) {
    // If it's a MeldFileNotFoundError, just throw it as is
    if (error instanceof MeldFileNotFoundError) {
      throw error;
    }
    // For other Error instances, preserve the error
    if (error instanceof Error) {
      throw error;
    }
    // For non-Error objects, convert to string
    throw new Error(String(error));
  }
}