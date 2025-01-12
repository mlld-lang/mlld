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
    DirectiveRegistry.registerHandler(apiDirectiveHandler);
    DirectiveRegistry.registerHandler(callDirectiveHandler);

    DirectiveRegistry.initialized = true;
  }

  /**
   * Normalizes a directive kind by ensuring it has the @ prefix
   */
  private static normalizeDirectiveKind(kind: string): string {
    return kind.startsWith('@') ? kind : `@${kind}`;
  }

  static registerHandler(handler: DirectiveHandler): void {
    if (!handler) {
      throw new Error('Cannot register null or undefined handler');
    }
    DirectiveRegistry.handlers.push(handler);
  }

  /**
   * Finds a handler that can handle the specified kind in the given mode.
   * Automatically adds @ prefix if not present.
   */
  static findHandler(kind: string, mode: 'toplevel' | 'rightside'): DirectiveHandler | undefined {
    // Ensure handlers are initialized
    DirectiveRegistry.initializeBuiltInHandlers();

    const normalizedKind = DirectiveRegistry.normalizeDirectiveKind(kind);
    return DirectiveRegistry.handlers.find(h => h.canHandle(normalizedKind, mode));
  }

  static clear(): void {
    DirectiveRegistry.handlers = [];
    DirectiveRegistry.initialized = false;
  }
} 