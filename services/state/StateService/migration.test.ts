import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateService } from '@services/state/StateService/StateService.js';
import { migrateState, validateMigration } from '@services/state/StateService/migration.js';
import type { MeldNode } from '@core/syntax/types.js';
import type { StateNode } from '@services/state/StateService/types.js';
import type { IStateService, ICommandDefinition, MigrationResult, IFilesystemPathState } from '@services/state/StateService/types.js';
import { vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/index.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';

describe('State Migration', () => {
  const helpers = TestContextDI.createTestHelpers();
  let context: TestContextDI;
  let oldState: IStateService;
  let result: MigrationResult;

  beforeEach(async () => {
    context = helpers.setupMinimal();
    
    oldState = MockFactory.createStateService();
    
    const textVars = new Map<string, any>();
    const dataVars = new Map<string, any>();
    const pathVars = new Map<string, any>();
    const commandVars = new Map<string, ICommandDefinition>();
    const imports = new Set<string>();
    const nodes: MeldNode[] = [];

    vi.spyOn(oldState, 'setTextVar').mockImplementation(async (name, value) => { textVars.set(name, { value }); return { name, value }; });
    vi.spyOn(oldState, 'setDataVar').mockImplementation(async (name, value) => { dataVars.set(name, { value }); return { name, value }; });
    vi.spyOn(oldState, 'setPathVar').mockImplementation(async (name, value) => { pathVars.set(name, { value }); return { name, value }; });
    vi.spyOn(oldState, 'setCommandVar').mockImplementation(async (name, value) => { commandVars.set(name, value ); return { name, value }; });
    vi.spyOn(oldState, 'addImport').mockImplementation((path) => { imports.add(path); });
    vi.spyOn(oldState, 'addNode').mockImplementation((node) => { nodes.push(node); });

    vi.spyOn(oldState, 'getAllTextVars').mockReturnValue(textVars);
    vi.spyOn(oldState, 'getAllDataVars').mockReturnValue(dataVars);
    vi.spyOn(oldState, 'getAllPathVars').mockReturnValue(pathVars);
    vi.spyOn(oldState, 'getAllCommands').mockReturnValue(commandVars);
    vi.spyOn(oldState, 'getImports').mockReturnValue(imports);
    vi.spyOn(oldState, 'getNodes').mockReturnValue(nodes);
    vi.spyOn(oldState, 'getCurrentFilePath').mockReturnValue(null);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('basic migration', () => {
    beforeEach(() => {
      result = migrateState(oldState);
    });

    it('should migrate empty state', () => {
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.state.variables.text.size).toBe(0);
      expect(result.state.variables.data.size).toBe(0);
      expect(result.state.variables.path.size).toBe(0);
      expect(result.state.commands.size).toBe(0);
      expect(result.state.imports.size).toBe(0);
      expect(result.state.nodes.length).toBe(0);
    });

    it('should migrate state with variables', () => {
      oldState.setTextVar('text', 'value');
      oldState.setDataVar('data', { key: 'value' });
      oldState.setPathVar('path', { raw: '/test/path' });
      
      result = migrateState(oldState);
      expect(result.state.variables.text.get('text')?.value).toBe('value');

      expect(result.state.variables.data.get('data')?.value).toEqual({ key: 'value' });

      const pathVar = result.state.variables.path.get('path');
      expect(pathVar).toBeDefined();
      if (pathVar) {
         expect((pathVar.value as IFilesystemPathState).raw).toBe('/test/path');
      }
    });

    it('should migrate state with commands', () => {
      oldState.setCommandVar('test', { command: 'echo test' });
      oldState.setCommandVar('complex', { command: 'test', options: { silent: true } });
      
      const result = migrateState(oldState);
      
      expect(result.state.commands.size).toBe(2);
      const testCmd = result.state.commands.get('test');
      expect(testCmd?.name).toBe('test');
      expect(testCmd?.value.command).toBe('echo test');
      const complexCmd = result.state.commands.get('complex');
      expect(complexCmd?.name).toBe('complex');
      expect(complexCmd?.value.command).toBe('test');
      expect(complexCmd?.value.options).toEqual({ silent: true });
    });

    it('should migrate state with imports', () => {
      oldState.addImport('test1.md');
      oldState.addImport('test2.md');

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      expect(result.state.imports.has('test1.md')).toBe(true);
      expect(result.state.imports.has('test2.md')).toBe(true);
    });

    it('should migrate state with nodes', () => {
      const node: MeldNode = {
        type: 'text',
        value: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      oldState.addNode(node);

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      expect(result.state.nodes).toHaveLength(1);
      expect(result.state.nodes[0]).toEqual(node);
    });
  });

  describe('validation', () => {
    it('should detect mismatched text variables', () => {
      oldState.setTextVar('test', 'value');

      const mismatchedState: StateNode = {
        variables: {
          text: new Map([['test', 'different']]),
          data: new Map(),
          path: new Map()
        },
        commands: new Map(),
        imports: new Set(),
        nodes: [],
      };

      const warnings: string[] = [];
      validateMigration(oldState, mismatchedState, warnings);
      expect(warnings).toContain('Text variable mismatch: test');
    });

    it('should fail strictly with validation errors', () => {
      oldState.setTextVar('test', 'value');

      const mismatchedState: StateNode = {
        variables: {
          text: new Map([['test', 'different']]),
          data: new Map(),
          path: new Map()
        },
        commands: new Map(),
        imports: new Set(),
        nodes: [],
      };

      expect(() => {
        const warnings: string[] = [];
        validateMigration(oldState, mismatchedState, warnings);
        if (warnings.length > 0) {
          throw new Error('Migration validation failed:\n' + warnings.join('\n'));
        }
      }).toThrow('Migration validation failed');
    });
  });

  describe('error handling', () => {
    it('should handle migration errors gracefully', () => {
      const errorMock = MockFactory.createStateService();
      errorMock.getAllTextVars.mockImplementation(() => { throw new Error('Test error'); });
      errorMock.getAllDataVars.mockReturnValue(new Map());
      errorMock.getAllPathVars.mockReturnValue(new Map());
      errorMock.getAllCommands.mockReturnValue(new Map());
      errorMock.getImports.mockReturnValue(new Set());
      errorMock.getNodes.mockReturnValue([]);
      errorMock.getCurrentFilePath.mockReturnValue(null);

      const result = migrateState(errorMock);

      // Log the actual warnings for debugging
      // process.stdout.write(`[DEBUG migration.test.ts] Warnings: ${JSON.stringify(result.warnings)}\n`); // Remove DEBUG log

      // Assertions
      expect(result.success).toBe(false);
      // Update expected warning message format
      expect(result.warnings).toContain('Error: Test error');
      expect(result.state.variables.text.size).toBe(0);
    });
  });
}); 