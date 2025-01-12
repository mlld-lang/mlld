import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectiveRegistry } from '../registry';
import type { DirectiveHandler, DirectiveKind } from '../types';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode } from 'meld-spec';

describe('DirectiveRegistry', () => {
  beforeEach(() => {
    DirectiveRegistry.clear();
  });

  describe('registration', () => {
    it('should register and find handlers', () => {
      const mockHandler: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === '@run',
        handle: vi.fn()
      };

      DirectiveRegistry.registerHandler(mockHandler);
      const handler = DirectiveRegistry.findHandler('@run');

      expect(handler).toBeDefined();
      expect(handler).toBe(mockHandler);
    });

    it('should return undefined for unknown directive kinds', () => {
      expect(DirectiveRegistry.findHandler('@unknown')).toBeUndefined();
    });

    it('should find the correct handler when multiple are registered', () => {
      const handler1: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === '@run',
        handle: vi.fn()
      };

      const handler2: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === '@data',
        handle: vi.fn()
      };

      DirectiveRegistry.registerHandler(handler1);
      DirectiveRegistry.registerHandler(handler2);

      expect(DirectiveRegistry.findHandler('@run')).toBe(handler1);
      expect(DirectiveRegistry.findHandler('@data')).toBe(handler2);
    });
  });

  describe('handler execution', () => {
    it('should properly execute handlers with state', () => {
      const mockHandler: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === '@run',
        handle: vi.fn()
      };

      DirectiveRegistry.registerHandler(mockHandler);
      const handler = DirectiveRegistry.findHandler('@run');
      const state = new InterpreterState();

      handler?.handle({ type: 'Directive', directive: { kind: '@run' } }, state);
      expect(mockHandler.handle).toHaveBeenCalledWith(
        { type: 'Directive', directive: { kind: '@run' } },
        state
      );
    });
  });

  describe('clear', () => {
    it('should remove all registered handlers', () => {
      const mockHandler: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === '@run',
        handle: vi.fn()
      };

      DirectiveRegistry.registerHandler(mockHandler);
      DirectiveRegistry.clear();

      expect(DirectiveRegistry.findHandler('@run')).toBeUndefined();
    });
  });
}); 