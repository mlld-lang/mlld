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

  static registerHandler(handler: DirectiveHandler): void {
    for (const kind of DIRECTIVE_KINDS) {
      if (handler.canHandle(kind)) {
        this.handlers.set(kind, handler);
      }
    }
  }

  static findHandler(kind: DirectiveKind): DirectiveHandler | undefined {
    return this.handlers.get(kind);
  }

  static clear(): void {
    this.handlers.clear();
  }
}

// Register built-in handlers
DirectiveRegistry.registerHandler(dataDirectiveHandler);
DirectiveRegistry.registerHandler(runDirectiveHandler);
DirectiveRegistry.registerHandler(importDirectiveHandler);
DirectiveRegistry.registerHandler(defineDirectiveHandler);
DirectiveRegistry.registerHandler(textDirectiveHandler);
DirectiveRegistry.registerHandler(pathDirectiveHandler);
DirectiveRegistry.registerHandler(embedDirectiveHandler); 