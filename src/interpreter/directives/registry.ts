import type { DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { DataDirectiveHandler } from './data.js';
import { RunDirectiveHandler } from './run.js';
import { ImportDirectiveHandler } from './import.js';

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
DirectiveRegistry.registerHandler(new DataDirectiveHandler());
DirectiveRegistry.registerHandler(new RunDirectiveHandler());
DirectiveRegistry.registerHandler(new ImportDirectiveHandler()); 