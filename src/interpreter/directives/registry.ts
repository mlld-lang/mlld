import type { DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './types.js';
import { dataDirectiveHandler } from './data.js';
import { runDirectiveHandler } from './run.js';
import { importDirectiveHandler } from './import.js';
import { defineDirectiveHandler } from './define.js';
import { textDirectiveHandler } from './text.js';
import { pathDirectiveHandler } from './pathDirective.js';
import { embedDirectiveHandler } from './embed.js';

const DIRECTIVE_KINDS: DirectiveKind[] = [
  'run',
  'import',
  'embed',
  'define',
  'text',
  'path',
  'data',
  'api',
  'call'
];

export class DirectiveRegistry {
  private static handlers: Map<DirectiveKind, DirectiveHandler> = new Map();
  private static initialized = false;

  static registerHandler(handler: DirectiveHandler): void {
    if (!handler) {
      throw new Error('Cannot register null or undefined handler');
    }
    
    for (const kind of DIRECTIVE_KINDS) {
      try {
        if (handler.canHandle(kind)) {
          this.handlers.set(kind, handler);
        }
      } catch (error) {
        console.error(`Failed to register handler for kind ${kind}:`, error);
      }
    }
  }

  static findHandler(kind: DirectiveKind): DirectiveHandler | undefined {
    this.initializeIfNeeded();
    return this.handlers.get(kind);
  }

  static clear(): void {
    this.handlers.clear();
    this.initialized = false;
  }

  private static initializeIfNeeded(): void {
    if (!this.initialized) {
      // Register built-in handlers
      this.registerHandler(dataDirectiveHandler);
      this.registerHandler(runDirectiveHandler);
      this.registerHandler(importDirectiveHandler);
      this.registerHandler(defineDirectiveHandler);
      this.registerHandler(textDirectiveHandler);
      this.registerHandler(pathDirectiveHandler);
      this.registerHandler(embedDirectiveHandler);
      this.initialized = true;
    }
  }
}

// Initialize handlers on first import
DirectiveRegistry.initializeIfNeeded(); 