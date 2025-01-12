import { DirectiveHandler } from './types';
import { runDirectiveHandler } from './run';
import { importDirectiveHandler } from './import';
import { embedDirectiveHandler } from './embed';
import { defineDirectiveHandler } from './define';
import { textDirectiveHandler } from './text';
import { pathDirectiveHandler } from './path';
import { dataDirectiveHandler } from './data';
import { apiDirectiveHandler } from './api';
import { callDirectiveHandler } from './call';

export class DirectiveRegistry {
  private static handlers: DirectiveHandler[] = [];
  private static initialized = false;

  static {
    // Initialize built-in handlers
    DirectiveRegistry.initializeBuiltInHandlers();
  }

  private static initializeBuiltInHandlers(): void {
    if (DirectiveRegistry.initialized) return;

    const builtInHandlers = [
      runDirectiveHandler,
      importDirectiveHandler,
      embedDirectiveHandler,
      defineDirectiveHandler,
      textDirectiveHandler,
      pathDirectiveHandler,
      dataDirectiveHandler,
      apiDirectiveHandler,
      callDirectiveHandler
    ];

    for (const handler of builtInHandlers) {
      DirectiveRegistry.registerHandler(handler);
    }

    DirectiveRegistry.initialized = true;
  }

  static registerHandler(handler: DirectiveHandler): void {
    if (!handler) {
      throw new Error('Cannot register null or undefined handler');
    }
    DirectiveRegistry.handlers.push(handler);
  }

  static findHandler(kind: string): DirectiveHandler | undefined {
    return DirectiveRegistry.handlers.find(handler => handler.canHandle(kind));
  }

  static clear(): void {
    DirectiveRegistry.handlers = [];
    DirectiveRegistry.initialized = false;
  }
} 