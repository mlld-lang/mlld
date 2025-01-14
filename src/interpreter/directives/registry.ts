import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { runDirectiveHandler } from './run';
import { importDirectiveHandler } from './import';
import { embedDirectiveHandler } from './embed';
import { defineDirectiveHandler } from './define';
import { textDirectiveHandler } from './text';
import { pathDirectiveHandler } from './path';
import { dataDirectiveHandler } from './data';

export class DirectiveRegistry {
  private static handlers: DirectiveHandler[] = [];
  private static initialized = false;

  static {
    // Initialize built-in handlers
    DirectiveRegistry.initializeBuiltInHandlers();
  }

  static initializeBuiltInHandlers(): void {
    if (DirectiveRegistry.initialized) return;

    directiveLogger.info('Initializing built-in directive handlers');

    const builtInHandlers = [
      runDirectiveHandler,
      importDirectiveHandler,
      embedDirectiveHandler,
      defineDirectiveHandler,
      textDirectiveHandler,
      pathDirectiveHandler,
      dataDirectiveHandler
    ];

    for (const handler of builtInHandlers) {
      DirectiveRegistry.registerHandler(handler);
    }

    DirectiveRegistry.initialized = true;
    directiveLogger.info('Built-in directive handlers initialized');
  }

  static registerHandler(handler: DirectiveHandler): void {
    if (!handler) {
      directiveLogger.error('Cannot register null or undefined handler');
      throw new Error('Cannot register null or undefined handler');
    }
    DirectiveRegistry.handlers.push(handler);
  }

  static findHandler(kind: string, mode: 'toplevel' | 'rightside'): DirectiveHandler | undefined {
    return DirectiveRegistry.handlers.find(handler => handler.canHandle(kind, mode));
  }

  static clear(): void {
    DirectiveRegistry.handlers = [];
    DirectiveRegistry.initialized = false;
    directiveLogger.info('Cleared all directive handlers');
  }

  static async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const kind = node.directive.kind;
    const handler = DirectiveRegistry.findHandler(kind, context.mode);

    if (!handler) {
      directiveLogger.error('No handler found for directive', {
        kind,
        mode: context.mode,
        location: node.location
      });
      throwWithContext(
        ErrorFactory.createDirectiveError,
        `No handler found for directive kind: ${kind}`,
        node.location,
        context,
        kind
      );
    }

    await handler.handle(node, state, context);
  }
} 