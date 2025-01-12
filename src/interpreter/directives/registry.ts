import { DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './types.js';
import { RunDirectiveHandler } from './run.js';
import { ImportDirectiveHandler } from './import.js';
import { EmbedDirectiveHandler } from './embed.js';
import { DefineDirectiveHandler } from './define.js';
import { TextDirectiveHandler } from './text.js';
import { PathDirectiveHandler } from './path.js';
import { DataDirectiveHandler } from './data.js';
import { ApiDirectiveHandler } from './api.js';
import { CallDirectiveHandler } from './call.js';

export class DirectiveRegistry {
  private static handlers = new Map<DirectiveKind, DirectiveHandler>();
  private static initialized = false;

  static {
    // Initialize built-in handlers
    DirectiveRegistry.initializeBuiltInHandlers();
  }

  private static initializeBuiltInHandlers(): void {
    if (DirectiveRegistry.initialized) return;

    const builtInHandlers = [
      new RunDirectiveHandler(),
      new ImportDirectiveHandler(),
      new EmbedDirectiveHandler(),
      new DefineDirectiveHandler(),
      new TextDirectiveHandler(),
      new PathDirectiveHandler(),
      new DataDirectiveHandler(),
      new ApiDirectiveHandler(),
      new CallDirectiveHandler()
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

    const kinds = Array.isArray(handler.canHandle) 
      ? handler.canHandle 
      : [handler.canHandle];

    for (const kind of kinds) {
      if (typeof kind === 'string') {
        DirectiveRegistry.handlers.set(kind as DirectiveKind, handler);
      }
    }
  }

  static findHandler(kind: DirectiveKind): DirectiveHandler | undefined {
    return DirectiveRegistry.handlers.get(kind);
  }

  static clear(): void {
    DirectiveRegistry.handlers.clear();
    DirectiveRegistry.initialized = false;
  }
} 