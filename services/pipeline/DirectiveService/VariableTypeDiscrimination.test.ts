import { describe, it, expect } from 'vitest';
import { VariableType, type MeldVariable, type TextVariable, type DataVariable, type PathVariable, type CommandVariable } from '@core/types/variables';
import { createTextVariable, createDataVariable, createPathVariable, createCommandVariable } from '@tests/utils/testFactories';

describe('Variable Type Discrimination', () => {
  describe('Type Guards and Discrimination', () => {
    it('should correctly discriminate TextVariable type', () => {
      const textVar = createTextVariable('test-text');
      const variable: MeldVariable = textVar;

      expect(variable.type).toBe(VariableType.TEXT);
      if (variable.type === VariableType.TEXT) {
        // TypeScript should narrow the type here
        const text: TextVariable = variable;
        expect(text.value).toBe('test-text');
        // This line would fail TypeScript compilation if type narrowing didn't work:
        // @ts-expect-error - Verify type narrowing prevents accessing non-text properties
        expect(text.stdout).toBeUndefined();
      }
    });

    it('should correctly discriminate DataVariable type', () => {
      const dataVar = createDataVariable({ key: 'value' });
      const variable: MeldVariable = dataVar;

      expect(variable.type).toBe(VariableType.DATA);
      if (variable.type === VariableType.DATA) {
        // TypeScript should narrow the type here
        const data: DataVariable = variable;
        expect(data.value).toEqual({ key: 'value' });
        // @ts-expect-error - Verify type narrowing prevents accessing non-data properties
        expect(data.content).toBeUndefined();
      }
    });

    it('should correctly discriminate PathVariable type', () => {
      const pathVar = createPathVariable('/test/path');
      const variable: MeldVariable = pathVar;

      expect(variable.type).toBe(VariableType.PATH);
      if (variable.type === VariableType.PATH) {
        // TypeScript should narrow the type here
        const path: PathVariable = variable;
        expect(path.value).toBe('/test/path');
        // @ts-expect-error - Verify type narrowing prevents accessing non-path properties
        expect(path.stdout).toBeUndefined();
      }
    });

    it('should correctly discriminate CommandVariable type', () => {
      const commandVar = createCommandVariable('echo test', { stdout: 'test', stderr: '', exitCode: 0 });
      const variable: MeldVariable = commandVar;

      expect(variable.type).toBe(VariableType.COMMAND);
      if (variable.type === VariableType.COMMAND) {
        // TypeScript should narrow the type here
        const command: CommandVariable = variable;
        expect(command.value).toBe('echo test');
        expect(command.stdout).toBe('test');
        expect(command.stderr).toBe('');
        expect(command.exitCode).toBe(0);
      }
    });
  });

  describe('Type Safety in Variable Operations', () => {
    it('should enforce type safety when working with variable values', () => {
      const textVar = createTextVariable('hello');
      const dataVar = createDataVariable({ message: 'world' });
      const pathVar = createPathVariable('/test/path');
      const commandVar = createCommandVariable('echo test', { stdout: 'test', stderr: '', exitCode: 0 });

      const variables: MeldVariable[] = [textVar, dataVar, pathVar, commandVar];

      variables.forEach(variable => {
        switch (variable.type) {
          case VariableType.TEXT:
            expect(typeof variable.value).toBe('string');
            break;
          case VariableType.DATA:
            expect(typeof variable.value).toBe('object');
            break;
          case VariableType.PATH:
            expect(typeof variable.value).toBe('string');
            break;
          case VariableType.COMMAND:
            expect(typeof variable.value).toBe('string');
            expect(typeof variable.stdout).toBe('string');
            expect(typeof variable.stderr).toBe('string');
            expect(typeof variable.exitCode).toBe('number');
            break;
        }
      });
    });

    it('should prevent assigning incorrect value types', () => {
      const textVar = createTextVariable('test');

      // @ts-expect-error - Should not allow assigning number to text variable
      textVar.value = 42;

      const dataVar = createDataVariable({ key: 'value' });
      
      // @ts-expect-error - Should not allow assigning string to data variable
      dataVar.value = 'invalid';

      const pathVar = createPathVariable('/test/path');

      // @ts-expect-error - Should not allow assigning object to path variable
      pathVar.value = { path: '/test' };

      const commandVar = createCommandVariable('test', { stdout: '', stderr: '', exitCode: 0 });

      // @ts-expect-error - Should not allow assigning number to command stdout
      commandVar.stdout = 42;
    });
  });
}); 