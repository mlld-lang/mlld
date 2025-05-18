import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ExecDirectiveHandler } from './ExecDirectiveHandler';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { ASTFixtureLoader } from '@tests/utils';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import type { ExecDirectiveNode } from '@core/ast/types/exec';
import { createLocation } from '@tests/utils/testFactories';
import { VariableType } from '@core/types/variables';
import type { ResolutionContext } from '@core/types/resolution';

describe('ExecDirectiveHandler (Fixture Tests)', () => {
  let handler: ExecDirectiveHandler;
  let stateService: IStateService;
  let validationService: IValidationService;
  let resolutionService: IResolutionService;
  let fixtureLoader: ASTFixtureLoader;

  beforeEach(() => {
    stateService = mock<IStateService>();
    validationService = mock<IValidationService>();
    resolutionService = mock<IResolutionService>();
    
    // Initialize the handler with mocked services
    handler = new ExecDirectiveHandler(validationService, resolutionService);
    fixtureLoader = new ASTFixtureLoader();
  });

  describe('execCommand subtype', () => {
    it('should handle exec-command directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('exec-command');
      if (!fixture) throw new Error('Fixture not found');
      const execNode = fixture.ast[0] as ExecDirectiveNode;

      const context: DirectiveProcessingContext = {
        directiveNode: execNode,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      // Mock resolution service to return resolved content
      resolutionService.resolveNodes = vi.fn().mockResolvedValue('echo "Hello, @name!"');

      const result = await handler.handle(context);

      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges!.variables).toBeDefined();
      expect(result.stateChanges!.variables!['greet']).toBeDefined();
      const variable = result.stateChanges!.variables!['greet'];
      expect(variable.type).toBe(VariableType.COMMAND);
      expect(variable.value.type).toBe('basic');
      expect(variable.value.commandTemplate).toBe('echo "Hello, @name!"');
    });
  });

  describe('execCode with language', () => {
    it('should handle exec with code and language', async () => {
      // Create an exec code node since the fixtures seem to be missing proper exec code examples
      const execNode: ExecDirectiveNode = {
        kind: 'exec',
        subtype: 'execCode',
        values: {
          identifier: [{ type: 'Text', content: 'myScript' }],
          params: [],
          lang: [{ type: 'Text', content: 'javascript' }],
          code: [{ type: 'Text', content: 'console.log("Hello World");' }]
        },
        raw: {
          identifier: 'myScript',
          params: [],
          lang: 'javascript',
          code: 'console.log("Hello World");'
        },
        meta: {
          parameterCount: 0,
          language: 'javascript'
        },
        location: createLocation(1, 1)
      };

      const context: DirectiveProcessingContext = {
        directiveNode: execNode,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      // Mock resolution service
      resolutionService.resolveNodes = vi.fn().mockResolvedValue('console.log("Hello World");');

      const result = await handler.handle(context);

      expect(result.stateChanges).toBeDefined();
      const variable = result.stateChanges!.variables!['myScript'];
      expect(variable.type).toBe(VariableType.COMMAND);
      expect(variable.value.type).toBe('language');
      expect(variable.value.language).toBe('javascript');
      expect(variable.value.codeBlock).toBe('console.log("Hello World");');
    });
  });

  describe('exec with literal value', () => {
    it('should handle exec with literal value', async () => {
      // Create a node with just a value property
      const execNode: ExecDirectiveNode = {
        kind: 'exec',
        subtype: 'execCommand',
        values: {
          identifier: [{ type: 'Text', content: 'simpleCmd' }],
          params: [],
          value: [{ type: 'Text', content: 'echo "Hello"' }]
        },
        raw: {
          identifier: 'simpleCmd',
          params: [],
          value: 'echo "Hello"'
        },
        meta: {
          parameterCount: 0
        },
        location: createLocation(1, 1)
      };

      const context: DirectiveProcessingContext = {
        directiveNode: execNode,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      // Mock resolution service
      resolutionService.resolveNodes = vi.fn().mockResolvedValue('echo "Hello"');

      const result = await handler.handle(context);

      expect(result.stateChanges).toBeDefined();
      const variable = result.stateChanges!.variables!['simpleCmd'];
      expect(variable.type).toBe(VariableType.COMMAND);
      expect(variable.value.type).toBe('basic');
      expect(variable.value.commandTemplate).toBe('echo "Hello"');
    });
  });

  describe('exec reference', () => {
    it('should handle exec-reference with existing command', async () => {
      const fixture = fixtureLoader.getFixture('exec-reference');
      if (!fixture) throw new Error('Fixture not found');
      
      // The second exec in the fixture is the one that references the first
      const execNode = fixture.ast[1] as ExecDirectiveNode;

      // Mock state to return existing command definition
      stateService.getVariable = vi.fn((name: string) => {
        if (name === 'echo') {
          return {
            type: VariableType.COMMAND,
            value: {
              type: 'basic',
              commandTemplate: 'echo "@text"',
              name: 'echo',
              parameters: [{name: 'text', position: 1}]
            }
          };
        }
        return undefined;
      });

      const context: DirectiveProcessingContext = {
        directiveNode: execNode,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      // Mock resolution for the command ref
      resolutionService.resolveNodes = vi.fn().mockResolvedValue('echo "Hello from reference"');

      const result = await handler.handle(context);

      expect(result.stateChanges).toBeDefined();
      const variable = result.stateChanges!.variables!['greet'];
      expect(variable.type).toBe(VariableType.COMMAND);
      expect(variable.value.type).toBe('basic');
      expect(variable.value.name).toBe('greet');
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid directive node', async () => {
      const invalidNode = {
        kind: 'text' as const,
        location: createLocation(1, 1),
        values: {},
        raw: {}
      };

      const context: DirectiveProcessingContext = {
        directiveNode: invalidNode as any,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      await expect(handler.handle(context))
        .rejects
        .toThrow(/Invalid node type/);
    });

    it('should handle exec without required content', async () => {
      const execNode: ExecDirectiveNode = {
        kind: 'exec',
        subtype: 'execCommand',
        values: {
          identifier: [{ type: 'Text', content: 'invalidCmd' }],
          params: []
          // Missing value, command, code, or commandRef
        },
        raw: {
          identifier: 'invalidCmd',
          params: []
        },
        meta: {
          parameterCount: 0
        },
        location: createLocation(1, 1)
      };

      const context: DirectiveProcessingContext = {
        directiveNode: execNode,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      await expect(handler.handle(context))
        .rejects
        .toThrow(/Exec directive must have a value, command, code, or commandRef/);
    });
  });

  describe('parameter handling', () => {
    it('should handle exec with parameters correctly', async () => {
      const fixture = fixtureLoader.getFixture('exec-command');
      if (!fixture) throw new Error('Fixture not found');
      const execNode = fixture.ast[0] as ExecDirectiveNode;

      const context: DirectiveProcessingContext = {
        directiveNode: execNode,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      // Mock resolution service
      resolutionService.resolveNodes = vi.fn().mockResolvedValue('echo "Hello, @name!"');

      const result = await handler.handle(context);

      const variable = result.stateChanges!.variables!['greet'];
      expect(variable.value.parameters).toHaveLength(1);
      expect(variable.value.parameters[0].name).toBe('name');
      expect(variable.value.parameters[0].position).toBe(1);
    });
  });

  describe('metadata handling', () => {
    it('should handle risk metadata in identifier', async () => {
      const execNode: ExecDirectiveNode = {
        kind: 'exec',
        subtype: 'execCommand',
        values: {
          identifier: [{ type: 'Text', content: 'dangerousCmd.risk.high' }],
          params: [],
          command: [{ type: 'Text', content: 'rm -rf /' }]
        },
        raw: {
          identifier: 'dangerousCmd.risk.high',
          params: [],
          command: 'rm -rf /'
        },
        meta: {
          parameterCount: 0
        },
        location: createLocation(1, 1)
      };

      const context: DirectiveProcessingContext = {
        directiveNode: execNode,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      // Mock resolution service
      resolutionService.resolveNodes = vi.fn().mockResolvedValue('rm -rf /');

      const result = await handler.handle(context);

      const variable = result.stateChanges!.variables!['dangerousCmd'];
      expect(variable.value.riskLevel).toBe('high');
    });

    it('should handle about metadata in identifier', async () => {
      const execNode: ExecDirectiveNode = {
        kind: 'exec',
        subtype: 'execCommand',
        values: {
          identifier: [{ type: 'Text', content: 'safeCmd.about.List files in current directory' }],
          params: [],
          command: [{ type: 'Text', content: 'ls -la' }]
        },
        raw: {
          identifier: 'safeCmd.about.List files in current directory',
          params: [],
          command: 'ls -la'
        },
        meta: {
          parameterCount: 0
        },
        location: createLocation(1, 1)
      };

      const context: DirectiveProcessingContext = {
        directiveNode: execNode,
        state: stateService,
        resolutionContext: {} as ResolutionContext
      };

      // Mock resolution service
      resolutionService.resolveNodes = vi.fn().mockResolvedValue('ls -la');

      const result = await handler.handle(context);

      const variable = result.stateChanges!.variables!['safeCmd'];
      expect(variable.value.description).toBe('List files in current directory');
    });
  });
});