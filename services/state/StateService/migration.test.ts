import { describe, it, expect, beforeEach } from 'vitest';
import { StateService } from '@services/state/StateService/StateService.js';
import { migrateState, validateMigration } from '@services/state/StateService/migration.js';
import type { MeldNode } from '@core/syntax/types.js';
import type { StateNode } from '@services/state/StateService/types.js';

describe('State Migration', () => {
  let oldState: StateService;

  beforeEach(() => {
    oldState = new StateService();
  });

  describe('basic migration', () => {
    it('should migrate empty state', () => {
      const result = migrateState(oldState, { validate: false });
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
      // Set up old state
      oldState.setTextVar('text', 'value');
      oldState.setDataVar('data', { key: 'value' });
      oldState.setPathVar('path', '/test/path');

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      // Verify text variables
      expect(result.state.variables.text.get('text')).toBe('value');

      // Verify data variables
      expect(result.state.variables.data.get('data')).toEqual({ key: 'value' });

      // Verify path variables
      expect(result.state.variables.path.get('path')).toBe('/test/path');
    });

    it('should migrate state with commands', () => {
      // Set up old state
      oldState.setCommand('test', 'echo test');
      oldState.setCommand('complex', { command: 'test', options: { silent: true } });

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      // Verify commands
      expect(result.state.commands.get('test')).toEqual({ command: 'echo test' });
      expect(result.state.commands.get('complex')).toEqual({ 
        command: 'test', 
        options: { silent: true } 
      });
    });

    it('should migrate state with imports', () => {
      // Set up old state
      oldState.addImport('test1.md');
      oldState.addImport('test2.md');

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      // Verify imports
      expect(result.state.imports.has('test1.md')).toBe(true);
      expect(result.state.imports.has('test2.md')).toBe(true);
    });

    it('should migrate state with nodes', () => {
      // Set up old state
      const node: MeldNode = {
        type: 'text',
        value: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      oldState.addNode(node);

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      // Verify nodes
      expect(result.state.nodes).toHaveLength(1);
      expect(result.state.nodes[0]).toEqual(node);
    });
  });

  describe('validation', () => {
    it('should detect mismatched text variables', () => {
      // Create a state that will be different after migration
      oldState.setTextVar('test', 'value');

      // Create a mismatched state manually
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

      // Validate the mismatched state
      const warnings: string[] = [];
      validateMigration(oldState, mismatchedState, warnings);
      expect(warnings).toContain('Text variable mismatch: test');
    });

    it('should fail strictly with validation errors', () => {
      oldState.setTextVar('test', 'value');

      // Create a mismatched state to force validation error
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
      // Create an invalid state that will cause migration to fail
      const invalidState = {
        getAllTextVars: () => { throw new Error('Test error'); },
        getAllDataVars: () => new Map(),
        getAllPathVars: () => new Map(),
        getAllCommands: () => new Map(),
        getImports: () => new Set(),
        getNodes: () => [],
        getCurrentFilePath: () => null
      } as unknown as StateService;

      const result = migrateState(invalidState);
      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Error: Test error');
      expect(result.state.variables.text.size).toBe(0);
    });
  });
}); 