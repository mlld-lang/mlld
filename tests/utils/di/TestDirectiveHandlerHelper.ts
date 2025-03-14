import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.js';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.js';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.js';
import { EmbedDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';

/**
 * Helper class for setting up directive handlers in tests
 */
export class TestDirectiveHandlerHelper {
  /**
   * Initialize a DirectiveService with all handlers registered
   * @param context The test context
   * @returns The initialized DirectiveService
   */
  public static async initializeDirectiveService(context: TestContextDI): Promise<IDirectiveService> {
    // Create the service using DI container
    const directiveService = context.container.resolve(DirectiveService) as DirectiveService;
    
    // Make sure all required services are available
    const validationService = context.services.validation;
    const stateService = context.services.state;
    const resolutionService = context.services.resolution;
    const pathService = context.services.path;
    const filesystemService = context.services.filesystem;
    const parserService = context.services.parser;
    const circularityService = context.services.circularity;
    
    // Create or get the interpreter service client factory
    let interpreterServiceClientFactory: InterpreterServiceClientFactory;
    try {
      interpreterServiceClientFactory = context.container.resolve('InterpreterServiceClientFactory');
    } catch (error) {
      // If factory doesn't exist in container, create a new one
      interpreterServiceClientFactory = new InterpreterServiceClientFactory();
      
      // Register the interpreter service to be resolved by the factory
      if (context.services.interpreter) {
        // For test compatibility, directly set the interpreter service on the factory
        // This is specifically for tests where we need a concrete service instance
        interpreterServiceClientFactory.setInterpreterServiceForTests(context.services.interpreter);
      }
      
      // Register the factory in the container for future use
      context.container.registerInstance('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    }
    
    // Initialize the service with all dependencies
    await directiveService.initialize(
      validationService,
      stateService,
      pathService,
      filesystemService,
      parserService,
      interpreterServiceClientFactory, // Use factory instead of direct service reference
      circularityService,
      resolutionService
    );
    
    // Manually register each handler to ensure they're properly initialized
    await this.registerAllHandlers(directiveService, context);
    
    // Force registerDefaultHandlers to run again to ensure all handlers are registered
    (directiveService as any).registerDefaultHandlers();
    
    // Verify handlers are registered
    const supportedDirectives = directiveService.getSupportedDirectives();
    if (!supportedDirectives.includes('text') || !supportedDirectives.includes('data')) {
      throw new Error(`Failed to register handlers. Supported: ${supportedDirectives.join(', ')}`);
    }
    
    return directiveService;
  }
  
  /**
   * Register all handlers with the DirectiveService
   * @param service The DirectiveService instance
   * @param context The test context
   */
  private static async registerAllHandlers(service: IDirectiveService, context: TestContextDI): Promise<void> {
    const { validation, state, resolution, path, filesystem, parser, circularity } = context.services;
    
    // Create and register definition handlers
    const textHandler = new TextDirectiveHandler(
      validation,
      state,
      resolution
    );
    textHandler.setFileSystemService(filesystem);
    service.registerHandler(textHandler);
    
    const dataHandler = new DataDirectiveHandler(
      validation,
      state,
      resolution
    );
    service.registerHandler(dataHandler);
    
    const pathHandler = new PathDirectiveHandler(
      validation,
      state,
      resolution
    );
    service.registerHandler(pathHandler);
    
    const defineHandler = new DefineDirectiveHandler(
      validation, 
      state,
      resolution
    );
    service.registerHandler(defineHandler);
    
    // Create and register execution handlers
    const runHandler = new RunDirectiveHandler(
      validation,
      resolution,
      state,
      filesystem
    );
    service.registerHandler(runHandler);
    
    // For embed and import handlers, use the interpreter service client factory
    let interpreterServiceClientFactory: InterpreterServiceClientFactory;
    try {
      interpreterServiceClientFactory = context.container.resolve('InterpreterServiceClientFactory');
    } catch (error) {
      // If factory doesn't exist in container, create a new one
      interpreterServiceClientFactory = new InterpreterServiceClientFactory();
      
      // Register the interpreter service to be resolved by the factory
      if (context.services.interpreter) {
        // For test compatibility, directly set the interpreter service on the factory
        // This is specifically for tests where we need a concrete service instance
        interpreterServiceClientFactory.setInterpreterServiceForTests(context.services.interpreter);
      }
      
      // Register the factory in the container for future use
      context.container.registerInstance('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    }
    
    const embedHandler = new EmbedDirectiveHandler(
      validation,
      resolution,
      state,
      circularity,
      filesystem,
      parser,
      interpreterServiceClientFactory,
      undefined // Use default logger
    );
    service.registerHandler(embedHandler);
    
    const importHandler = new ImportDirectiveHandler(
      validation,
      resolution,
      state,
      filesystem,
      parser,
      interpreterServiceClientFactory,
      circularity
    );
    service.registerHandler(importHandler);
  }
} 