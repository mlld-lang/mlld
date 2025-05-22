import { container } from 'tsyringe';
import type { IDirectiveHandler } from './IDirectiveService.new';
import type { IDirectiveService } from './IDirectiveService.new';

// Import all handlers
import { TextDirectiveHandler } from './handlers/TextDirectiveHandler.new';
import { DataDirectiveHandler } from './handlers/DataDirectiveHandler.new';
import { PathDirectiveHandler } from './handlers/PathDirectiveHandler.new';
import { ExecDirectiveHandler } from './handlers/ExecDirectiveHandler.new';
import { RunDirectiveHandler } from './handlers/RunDirectiveHandler.new';
import { AddDirectiveHandler } from './handlers/AddDirectiveHandler.new';
import { ImportDirectiveHandler } from './handlers/ImportDirectiveHandler.new';

/**
 * Registry for directive handlers.
 * Registers all handlers with the DI container and directive service.
 */
export class HandlerRegistry {
  private static handlers: Array<new (...args: any[]) => IDirectiveHandler> = [
    TextDirectiveHandler,
    DataDirectiveHandler,
    PathDirectiveHandler,
    ExecDirectiveHandler,
    RunDirectiveHandler,
    AddDirectiveHandler,
    ImportDirectiveHandler
  ];
  
  /**
   * Register all handlers with the DI container
   */
  static registerWithContainer(targetContainer: any = container): void {
    // Register each handler class
    this.handlers.forEach(HandlerClass => {
      targetContainer.register(HandlerClass, { useClass: HandlerClass });
    });
  }
  
  /**
   * Register all handlers with a directive service
   */
  static registerWithService(service: IDirectiveService, targetContainer: any = container): void {
    // Create and register each handler
    this.handlers.forEach(HandlerClass => {
      const handler = targetContainer.resolve(HandlerClass);
      service.registerHandler(handler);
    });
  }
  
  /**
   * Get all handler instances
   */
  static getAllHandlers(targetContainer: any = container): IDirectiveHandler[] {
    return this.handlers.map(HandlerClass => targetContainer.resolve(HandlerClass));
  }
  
  /**
   * Get a specific handler by kind
   */
  static getHandler(kind: string, targetContainer: any = container): IDirectiveHandler | undefined {
    const handlers = this.getAllHandlers(targetContainer);
    return handlers.find(h => h.kind === kind);
  }
}