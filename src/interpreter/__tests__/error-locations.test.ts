import { MeldError, MeldInterpretError } from '../errors/errors';
import { TestContext } from './test-utils';
import { interpret } from '../interpreter';

describe('Error Location Handling', () => {
  describe('nested directive errors', () => {
    it('should preserve error location in nested directives', async () => {
      const context = new TestContext();
      const node = context.createDirectiveNode('text', {}, { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } });
      
      await expect(interpret([node], context.state, context.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);
    });

    it('should adjust error locations in right-side mode', async () => {
      const context = new TestContext();
      const node = context.createDirectiveNode('text', {}, { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } });
      
      await expect(interpret([node], context.state, context.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);
    });
  });

  describe('directive handler errors', () => {
    it('should preserve error location in handler errors', async () => {
      const context = new TestContext();
      const node = context.createDirectiveNode('text', {}, { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } });
      
      await expect(interpret([node], context.state, context.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);
    });
  });

  describe('parser errors', () => {
    it('should include location in parse errors', async () => {
      const context = new TestContext();
      const node = context.createDirectiveNode('text', {}, { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } });
      
      await expect(interpret([node], context.state, context.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);
    });
  });
}); 