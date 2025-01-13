import { DirectiveHandler } from './types';
import { runDirectiveHandler } from './run';
import { importDirectiveHandler } from './import';
import { embedDirectiveHandler } from './embed';
import { defineDirectiveHandler } from './define';
import { textDirectiveHandler } from './text';
import { pathDirectiveHandler } from './path';
import { dataDirectiveHandler } from './data';
import { directiveLogger } from '../../utils/logger';

export class DirectiveRegistry {
  private static handlers: Map<string, DirectiveHandler> = new Map();
  private static initialized = false;

  private static initializeBuiltInHandlers(): void {
    if (DirectiveRegistry.initialized) return;

    directiveLogger.info('Initializing built-in directive handlers');

    // Register built-in handlers
    DirectiveRegistry.registerHandler(runDirectiveHandler);
    DirectiveRegistry.registerHandler(importDirectiveHandler);
    DirectiveRegistry.registerHandler(embedDirectiveHandler);
    DirectiveRegistry.registerHandler(defineDirectiveHandler);
    DirectiveRegistry.registerHandler(textDirectiveHandler);
    DirectiveRegistry.registerHandler(pathDirectiveHandler);
    DirectiveRegistry.registerHandler(dataDirectiveHandler);

    DirectiveRegistry.initialized = true;
    directiveLogger.info('Built-in directive handlers initialized');
  }

  static registerHandler(handler: DirectiveHandler): void {
    if (!handler) {
      directiveLogger.error('Cannot register null or undefined handler');
      throw new Error('Cannot register null or undefined handler');
    }

    const ctor = handler.constructor as any;
    if (!ctor.directiveKind) {
      directiveLogger.error('Handler is missing a static directiveKind property', { handler: handler.constructor.name });
      throw new Error('Handler is missing a static directiveKind property');
    }

    const kind: string = ctor.directiveKind;
    DirectiveRegistry.handlers.set(kind, handler);
    directiveLogger.debug(`Registered handler for directive kind: ${kind}`, { handler: handler.constructor.name });
  }

  static findHandler(kind: string, mode: 'toplevel' | 'rightside'): DirectiveHandler | undefined {
    // Remove @ prefix if present for consistency
    const normalizedKind = kind.startsWith('@') ? kind.slice(1) : kind;

    // First try exact match
    const handler = DirectiveRegistry.handlers.get(normalizedKind);
    if (handler && handler.canHandle(normalizedKind, mode)) {
      directiveLogger.debug(`Found handler for directive kind: ${normalizedKind}`, { 
        handler: handler.constructor.name,
        mode 
      });
      return handler;
    }

    directiveLogger.warn(`No handler found for directive kind: ${normalizedKind}`, { mode });
    return undefined;
  }

  static clear(): void {
    directiveLogger.info('Clearing all directive handlers');
    DirectiveRegistry.handlers.clear();
    DirectiveRegistry.initialized = false;
  }
} 