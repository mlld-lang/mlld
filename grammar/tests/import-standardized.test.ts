import { describe, it, expect } from 'vitest';
import * as parser from '../meld.peggy';
import { isImportAllDirective, isImportSelectedDirective } from '../types/guards';

describe('Import Directive Tests', () => {
  describe('Import All', () => {
    it('should parse a standardized wildcard import', () => {
      const input = '@import { * } from "path/to/file.meld"';
      const result = parser.parse(input)[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importAll');
      
      // Check values
      expect(result.values.imports).toHaveLength(1);
      expect(result.values.imports[0].identifier).toBe('*');
      expect(result.values.path).toBeDefined();
      
      // Check raw
      expect(result.raw.imports).toBe('*');
      expect(result.raw.path).toBeDefined();
      
      // Check meta
      expect(result.meta.path).toBeDefined();
      expect(result.meta.path.isAbsolute).toBe(false);
      expect(result.meta.path.isRelative).toBe(true);
      expect(result.meta.path.hasVariables).toBe(false);
      
      // Check type guard
      expect(isImportAllDirective(result)).toBe(true);
    });
    
    it('should parse a standardized wildcard import with path variable', () => {
      const input = '@import { * } from "$pathVar"';
      const result = parser.parse(input)[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importAll');
      
      // Check values
      expect(result.values.imports).toHaveLength(1);
      expect(result.values.imports[0].identifier).toBe('*');
      
      // Check path has a variable
      expect(result.values.path).toHaveLength(1);
      expect(result.values.path[0].type).toBe('VariableReference');
      
      // Check meta
      expect(result.meta.path.hasVariables).toBe(true);
      expect(result.meta.path.hasPathVariables).toBe(true);
      
      // Check type guard
      expect(isImportAllDirective(result)).toBe(true);
    });
  });
  
  describe('Import Selected', () => {
    it('should parse a standardized selective import', () => {
      const input = '@import { var1, var2 } from "path/to/file.meld"';
      const result = parser.parse(input)[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importSelected');
      
      // Check values
      expect(result.values.imports).toHaveLength(2);
      expect(result.values.imports[0].identifier).toBe('var1');
      expect(result.values.imports[1].identifier).toBe('var2');
      
      // Check meta
      expect(result.meta.path).toBeDefined();
      expect(result.meta.path.isAbsolute).toBe(false);
      expect(result.meta.path.isRelative).toBe(true);
      
      // Check type guard
      expect(isImportSelectedDirective(result)).toBe(true);
    });
    
    it('should parse a standardized import with aliases', () => {
      const input = '@import { var1 as alias1, var2 as alias2 } from "path/to/file.meld"';
      const result = parser.parse(input)[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importSelected');
      
      // Check values
      expect(result.values.imports).toHaveLength(2);
      expect(result.values.imports[0].identifier).toBe('var1');
      expect(result.values.imports[0].alias).toBe('alias1');
      expect(result.values.imports[1].identifier).toBe('var2');
      expect(result.values.imports[1].alias).toBe('alias2');
      
      // Check type guard
      expect(isImportSelectedDirective(result)).toBe(true);
    });
    
    it('should parse a standardized import with text variable in path', () => {
      const input = '@import { var1 } from "prefix/{{textVar}}/suffix.meld"';
      const result = parser.parse(input)[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importSelected');
      
      // Check meta
      expect(result.meta.path.hasVariables).toBe(true);
      expect(result.meta.path.hasTextVariables).toBe(true);
      
      // Check type guard
      expect(isImportSelectedDirective(result)).toBe(true);
    });
  });
});