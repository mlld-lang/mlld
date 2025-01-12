import type { DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './types.js';
import { DataDirectiveHandler } from './data.js';
import { RunDirectiveHandler } from './run.js';
import { ImportDirectiveHandler } from './import.js';
import { DefineDirectiveHandler } from './define.js';
import { TextDirectiveHandler } from './text.js';
import { PathDirectiveHandler } from './pathDirective.js';
import { EmbedDirectiveHandler } from './embed.js';

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
DirectiveRegistry.registerHandler(new DefineDirectiveHandler());
DirectiveRegistry.registerHandler(new TextDirectiveHandler());
DirectiveRegistry.registerHandler(new PathDirectiveHandler());
DirectiveRegistry.registerHandler(new EmbedDirectiveHandler()); 