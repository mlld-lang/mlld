import { DirectiveHandler } from './types';
import { runDirectiveHandler } from './run';
import { importDirectiveHandler } from './import';
import { embedDirectiveHandler } from './embed';
import { defineDirectiveHandler } from './define';
import { textDirectiveHandler } from './text';
import { pathDirectiveHandler } from './path';
import { dataDirectiveHandler } from './data';

export class DirectiveRegistry {
  private static handlers: Map<string, DirectiveHandler> = new Map();
  private static initialized = false;

  private static initializeBuiltInHandlers(): void {
    if (DirectiveRegistry.initialized) return;

    // Register built-in handlers
    DirectiveRegistry.registerHandler(runDirectiveHandler);
    DirectiveRegistry.registerHandler(importDirectiveHandler);
    DirectiveRegistry.registerHandler(embedDirectiveHandler);
    DirectiveRegistry.registerHandler(defineDirectiveHandler);
    DirectiveRegistry.registerHandler(textDirectiveHandler);
    DirectiveRegistry.registerHandler(pathDirectiveHandler);
    DirectiveRegistry.registerHandler(dataDirectiveHandler);

    DirectiveRegistry.initialized = true;
  }

  static registerHandler(handler: DirectiveHandler): void {
    if (!handler) {
      throw new Error('Cannot register null or undefined handler');
    }

    const ctor = handler.constructor as any;
    if (!ctor.directiveKind) {
      throw new Error('Handler is missing a static directiveKind property');
    }
    const kind: string = ctor.directiveKind;
    DirectiveRegistry.handlers.set(kind, handler);
  }

  static findHandler(kind: string, mode: 'toplevel' | 'rightside'): DirectiveHandler | undefined {
    // Ensure handlers are initialized
    DirectiveRegistry.initializeBuiltInHandlers();

    // Remove @ prefix if present for consistency
    const normalizedKind = kind.startsWith('@') ? kind.slice(1) : kind;

    // First try exact match
    const handler = DirectiveRegistry.handlers.get(normalizedKind);
    if (handler && handler.canHandle(normalizedKind, mode)) {
      return handler;
    }

    return undefined;
  }

  static clear(): void {
    DirectiveRegistry.handlers.clear();
    DirectiveRegistry.initialized = false;
  }
} 