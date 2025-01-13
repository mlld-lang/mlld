import { interpret } from '../interpreter';
import { MeldError } from '../errors/errors';
import { parseMeld } from '../parser';
import { TestContext } from './test-utils';

describe('Error Location Handling', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
  });

  describe('nested directive errors', () => {
    it('should preserve error location in nested directives', () => {
      const content = `
@embed
  content: |
    @text
      name: test
      value: |
        Hello world
      invalid: field
`;
      const nodes = parseMeld(content);
      
      try {
        interpret(nodes, context.state);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        if (error instanceof MeldError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(8); // Points to invalid field
        }
      }
    });

    it('should adjust error locations in right-side mode', () => {
      const baseLocation = context.createLocation(10, 1);
      const nestedContext = context.createNestedContext(baseLocation);
      
      const content = `
@text
  name: test
  invalid: field
`;
      const nodes = parseMeld(content);
      
      try {
        interpret(nodes, nestedContext.state);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        if (error instanceof MeldError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(13); // base.line (10) + relative.line (4) - 1
        }
      }
    });
  });

  describe('directive handler errors', () => {
    it('should preserve error location in handler errors', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('text', { 
        name: 'test',
        invalid: 'field'
      }, location);

      try {
        interpret([node], context.state);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        if (error instanceof MeldError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(5);
          expect(error.location?.column).toBe(3);
        }
      }
    });
  });

  describe('parser errors', () => {
    it('should include location in parse errors', () => {
      const content = `
@text
  invalid-yaml
`;
      try {
        parseMeld(content);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        if (error instanceof MeldError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(3);
        }
      }
    });
  });
}); 