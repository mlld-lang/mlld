import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../../../tests/utils';
import { InterpreterService } from '../InterpreterService';
import { DirectiveService } from '../../DirectiveService/DirectiveService';
import { ValidationService } from '../../ValidationService/ValidationService';
import { StateService } from '../../StateService/StateService';
import { PathService } from '../../PathService/PathService';
import { FileSystemService } from '../../FileSystemService/FileSystemService';
import { ParserService } from '../../ParserService/ParserService';
import { CircularityService } from '../../CircularityService/CircularityService';
import { MeldInterpreterError } from '../../../core/errors/MeldInterpreterError';

describe('InterpreterService Integration', () => {
  let context: TestContext;
  let service: InterpreterService;
  let stateService: StateService;
  let directiveService: DirectiveService;

  beforeEach(async () => {
    // Initialize test context
    context = new TestContext();
    await context.initialize();
    await context.fixtures.load('interpreterTestProject');

    // Initialize all required services
    const validationService = new ValidationService();
    stateService = new StateService();
    const pathService = new PathService(context.fs);
    const fileSystemService = new FileSystemService(context.fs);
    const parserService = new ParserService();
    const circularityService = new CircularityService();

    // Initialize directive service first
    directiveService = new DirectiveService();
    directiveService.initialize(
      validationService,
      stateService,
      pathService,
      fileSystemService,
      parserService,
      service, // This will be set after interpreter service is created
      circularityService
    );

    // Initialize interpreter service
    service = new InterpreterService();
    service.initialize(directiveService, stateService);

    // Update directive service with interpreter reference
    directiveService.updateInterpreterService(service);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Basic interpretation', () => {
    it('interprets a simple document', async () => {
      const content = await context.fs.readFile('project/src/main.meld');
      const nodes = context.parseMeld(content);
      const state = await service.interpret(nodes);

      expect(state.getTextVar('root')).toBe('Root');
    });

    it('maintains node order in state', async () => {
      const content = await context.fs.readFile('project/src/main.meld');
      const nodes = context.parseMeld(content);
      const state = await service.interpret(nodes);

      const stateNodes = state.getNodes();
      expect(stateNodes[0].type).toBe('Directive'); // @text directive
      expect(stateNodes[1].type).toBe('Directive'); // @import directive
    });
  });

  describe('Nested imports', () => {
    it('processes nested imports with correct state inheritance', async () => {
      const content = await context.fs.readFile('project/src/main.meld');
      const nodes = context.parseMeld(content);
      const state = await service.interpret(nodes);

      // Variables from all levels should be available
      expect(state.getTextVar('root')).toBe('Root');     // from main.meld
      expect(state.getTextVar('child')).toBe('Child');   // from child.meld
      expect(state.getTextVar('common')).toBe('Shared'); // from common.meld
      expect(state.getDataVar('nums')).toEqual([1, 2, 3]);
      expect(state.getDataVar('shared')).toEqual({ type: 'common' });
    });

    it('maintains correct file paths during interpretation', async () => {
      const content = await context.fs.readFile('project/src/main.meld');
      const nodes = context.parseMeld(content);
      const state = await service.interpret(nodes, {
        filePath: 'project/src/main.meld'
      });

      // The final current path should be back to the root file
      expect(state.getCurrentFilePath()).toBe('project/src/main.meld');
    });
  });

  describe('Section embedding', () => {
    it('embeds and interprets specific sections', async () => {
      const content = await context.fs.readFile('project/src/complex.meld');
      const nodes = context.parseMeld(content);
      const state = await service.interpret(nodes);

      expect(state.getTextVar('base')).toBe('Base');
      expect(state.getTextVar('inSection')).toBe('Inside');
      expect(state.getTextVar('skipped')).toBeUndefined();
    });
  });

  describe('Variable resolution', () => {
    it('resolves variables during interpretation', async () => {
      const content = await context.fs.readFile('project/src/variables.meld');
      const nodes = context.parseMeld(content);
      const state = await service.interpret(nodes);

      expect(state.getTextVar('greeting')).toBe('Hello World!');
      expect(state.getDataVar('user')).toEqual({ name: 'World' });
    });
  });

  describe('Error handling', () => {
    it('handles circular imports', async () => {
      const content = await context.fs.readFile('project/nested/circular1.meld');
      const nodes = context.parseMeld(content);

      await expect(service.interpret(nodes, {
        filePath: 'project/nested/circular1.meld'
      })).rejects.toThrow(/circular/i);
    });

    it('provides location information in errors', async () => {
      const content = '@text invalid';  // Invalid directive
      const nodes = context.parseMeld(content);

      try {
        await service.interpret(nodes);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        expect(error.location).toBeDefined();
      }
    });

    it('maintains state consistency after errors', async () => {
      const content = '@text valid = "OK"\n@text invalid\n@text after = "Never Set"';
      const nodes = context.parseMeld(content);

      try {
        await service.interpret(nodes);
        fail('Should have thrown');
      } catch (error) {
        const state = stateService.getState();
        expect(state.getTextVar('valid')).toBe('OK');
        expect(state.getTextVar('after')).toBeUndefined();
      }
    });
  });

  describe('State management', () => {
    it('creates isolated states for different interpretations', async () => {
      // First interpretation
      const content1 = await context.fs.readFile('project/src/main.meld');
      const nodes1 = context.parseMeld(content1);
      const state1 = await service.interpret(nodes1);

      // Second interpretation
      const content2 = await context.fs.readFile('project/src/variables.meld');
      const nodes2 = context.parseMeld(content2);
      const state2 = await service.interpret(nodes2);

      // States should be isolated
      expect(state1.getTextVar('root')).toBe('Root');
      expect(state1.getTextVar('greeting')).toBeUndefined();
      expect(state2.getTextVar('greeting')).toBe('Hello World!');
      expect(state2.getTextVar('root')).toBeUndefined();
    });

    it('merges child states correctly', async () => {
      const content = await context.fs.readFile('project/src/main.meld');
      const nodes = context.parseMeld(content);
      
      // Create a parent state with some variables
      const parentState = new StateService();
      parentState.setTextVar('parent', 'Parent');

      const result = await service.interpret(nodes, {
        initialState: parentState,
        mergeState: true
      });

      // Should have both parent and child variables
      expect(result.getTextVar('parent')).toBe('Parent');
      expect(result.getTextVar('root')).toBe('Root');
      expect(result.getTextVar('child')).toBe('Child');
    });
  });
}); 