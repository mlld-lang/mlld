/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/parser';

describe('directives/@import with named imports', () => {
  describe('valid cases', () => {
    it('should support basic named imports', async () => {
      const input = '@import [var1, var2] from [vars.meld]';
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const node = result.ast[0];
      expect(node).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'import',
          path: {
            raw: 'vars.meld',
          },
          imports: [
            { name: 'var1', alias: null },
            { name: 'var2', alias: null }
          ]
        }
      });
    });

    it('should support named imports with aliases', async () => {
      const input = '@import [var1, var2 as alias2] from [vars.meld]';
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const node = result.ast[0];
      expect(node).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'import',
          path: {
            raw: 'vars.meld',
          },
          imports: [
            { name: 'var1', alias: null },
            { name: 'var2', alias: 'alias2' }
          ]
        }
      });
    });

    it('should support explicit wildcard import', async () => {
      const input = '@import [*] from [vars.meld]';
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const node = result.ast[0];
      expect(node).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'import',
          subtype: 'importAll',
          path: {
            raw: 'vars.meld'
          },
          imports: [
            {
              type: 'VariableReference',
              identifier: '*',
              valueType: 'import',
              isVariableReference: true,
            },
          ]
        }
      });
    });

    it('should handle empty import list', async () => {
      const input = '@import [] from [vars.meld]';
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const node = result.ast[0];
      expect(node).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'import',
          path: {
            raw: 'vars.meld'
          },
          imports: []
        }
      });
    });

    it('should maintain backward compatibility for traditional imports', async () => {
      const input = '@import [vars.meld]';
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const node = result.ast[0];
      expect(node).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'import',
          subtype: 'importAll',
          path: {
            raw: 'vars.meld'
          },
          imports: [
            {
              type: 'VariableReference',
              identifier: '*',
              valueType: 'import',
              isVariableReference: true,
            },
          ]
        }
      });
    });

    it('should support named imports with variable path', async () => {
      const input = '@import [var1, var2] from {{path_var}}';
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const node = result.ast[0];
      expect(node).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'import',
          path: {
            raw: '{{path_var}}'
          },
          imports: [
            { name: 'var1', alias: null },
            { name: 'var2', alias: null }
          ]
        }
      });
    });
  });

  describe('invalid cases', () => {
    it('should fail with invalid alias syntax', async () => {
      const input = '@import [var1, var2 alias2] from [vars.meld]';
      await expect(parse(input)).rejects.toThrow();
    });
  });
}); 