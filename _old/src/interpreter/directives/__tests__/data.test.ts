import { dataDirectiveHandler } from '../data';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';
import { pathService } from '../../../services/path-service';

// Mock path module
vi.mock('path', async () => {
  const { createPathMock } = await import('../../../../tests/__mocks__/path');
  return createPathMock();
});

describe('DataDirectiveHandler', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('basic data handling', () => {
    it('should handle simple data values', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('data', {
        name: 'test',
        value: 'value'
      }, location);

      dataDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      expect(context.state.getDataVar('test')).toBe('value');
    });

    it('should handle object values', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('data', {
        name: 'test',
        value: { key: 'value' }
      }, location);

      dataDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      expect(context.state.getDataVar('test')).toEqual({ key: 'value' });
    });

    it('should handle array values', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('data', {
        name: 'test',
        value: [1, 2, 3]
      }, location);

      dataDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      expect(context.state.getDataVar('test')).toEqual([1, 2, 3]);
    });
  });

  describe('error handling', () => {
    it('should throw error for missing name', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('data', {
        value: 'test'
      }, location);

      expect(() => 
        dataDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).toThrow(MeldError);
    });

    it('should throw error for missing value', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('data', {
        name: 'test'
      }, location);

      expect(() => 
        dataDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).toThrow(MeldError);
    });

    it('should preserve error locations in right-side mode', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const dataLocation = nestedContext.createLocation(2, 4);

      const node = nestedContext.createDirectiveNode('data', {
        name: 'test'
      }, dataLocation);

      try {
        dataDirectiveHandler.handle(node, nestedContext.state, nestedContext.createHandlerContext());
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        if (error instanceof MeldError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(6); // base.line (5) + relative.line (2) - 1
          expect(error.location?.column).toBe(4);
        }
      }
    });
  });

  describe('variable scoping', () => {
    it('should handle variable shadowing', () => {
      const location1 = context.createLocation(1, 1);
      const location2 = context.createLocation(2, 1);

      const node1 = context.createDirectiveNode('data', {
        name: 'test',
        value: 'original'
      }, location1);

      const node2 = context.createDirectiveNode('data', {
        name: 'test',
        value: 'shadowed'
      }, location2);

      dataDirectiveHandler.handle(node1, context.state, context.createHandlerContext());
      dataDirectiveHandler.handle(node2, context.state, context.createHandlerContext());

      expect(context.state.getDataVar('test')).toBe('shadowed');
    });

    it('should handle nested scopes', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);

      const parentNode = context.createDirectiveNode('data', {
        name: 'test',
        value: 'parent'
      }, context.createLocation(1, 1));

      const childNode = nestedContext.createDirectiveNode('data', {
        name: 'test',
        value: 'child'
      }, nestedContext.createLocation(2, 4));

      dataDirectiveHandler.handle(parentNode, context.state, context.createHandlerContext());
      dataDirectiveHandler.handle(childNode, nestedContext.state, nestedContext.createHandlerContext());

      expect(context.state.getDataVar('test')).toBe('parent');
      expect(nestedContext.state.getDataVar('test')).toBe('child');
    });
  });

  describe('path handling', () => {
    it('should handle path variables in data values', async () => {
      // Set up a path variable
      context.state.setPathVar('testPath', await pathService.resolvePath('$PROJECTPATH/test/file.txt'));

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('data', {
        name: 'config',
        value: {
          path: '${testPath}',
          other: 'value'
        }
      }, location);

      dataDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const config = context.state.getDataVar('config');
      expect(config.path).toBe(await pathService.resolvePath('$PROJECTPATH/test/file.txt'));
      expect(config.other).toBe('value');
    });

    it('should handle special path variables directly', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('data', {
        name: 'paths',
        value: {
          project: '$PROJECTPATH/file.txt',
          home: '$HOMEPATH/config.txt'
        }
      }, location);

      dataDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const paths = context.state.getDataVar('paths');
      expect(paths.project).toBe('$PROJECTPATH/file.txt');
      expect(paths.home).toBe('$HOMEPATH/config.txt');
    });

    it('should handle path aliases in data values', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('data', {
        name: 'paths',
        value: {
          project: '$./file.txt',
          home: '$~/config.txt'
        }
      }, location);

      dataDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const paths = context.state.getDataVar('paths');
      expect(paths.project).toBe('$./file.txt');
      expect(paths.home).toBe('$~/config.txt');
    });
  });
}); 