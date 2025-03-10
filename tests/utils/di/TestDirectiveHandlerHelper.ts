import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.js';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.js';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.js';
import { EmbedDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { TestContextDI } from './TestContextDI.js';

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
    const interpreterService = context.services.interpreter;
    
    // Initialize the service with all dependencies
    await directiveService.initialize(
      validationService,
      stateService,
      pathService,
      filesystemService,
      parserService,
      interpreterService,
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
    const importHandler = new ImportDirectiveHandler(
      validation,
      state,
      resolution,
      path,
      filesystem,
      parser,
      circularity
    );
    service.registerHandler(importHandler);
    
    const embedHandler = new EmbedDirectiveHandler(
      validation,
      state,
      resolution,
      path,
      filesystem
    );
    service.registerHandler(embedHandler);
    
    const runHandler = new RunDirectiveHandler(
      validation,
      state,
      resolution
    );
    service.registerHandler(runHandler);
  }
} 