import { describe, it, expect } from 'vitest';
import { isImportSelectedDirective } from '@core/types/guards';
import { parse } from '@grammar/parser';
import { importFixtures } from './fixtures/import';
import { parseDirective } from './utils/test-helpers';


describe('Import Directive Syntax Tests', () => {
  describe('Import Namespace (Shorthand)', () => {
    it('should parse a shorthand namespace import', async () => {
      const input = '/import "path/to/file.mlld"';
      const result = (await parse(input)).ast[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importNamespace');
      expect(result.source).toBe('path'); // Check new source field
      
      // Check values
      expect(result.values.path).toBeDefined();
      expect(result.values.namespace[0].content).toBe('file'); // Auto-derived from filename
      
      // Check raw
      expect(result.raw.path).toBeDefined();
      expect(result.raw.namespace).toBe('file');
      
      // Check meta
      expect(result.meta.path).toBeDefined();
      expect(result.meta.path.hasVariables).toBe(false);
    });
    
    it('should parse a namespace import with explicit alias', async () => {
      const input = '/import "path/to/file.mlld" as myModule';
      const result = (await parse(input)).ast[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importNamespace');
      expect(result.source).toBe('path'); // Check new source field
      
      // Check values
      expect(result.values.path).toBeDefined();
      expect(result.values.namespace[0].content).toBe('myModule'); // Explicit alias
      
      // Check raw
      expect(result.raw.path).toBeDefined();
      expect(result.raw.namespace).toBe('myModule');
      
      // Check meta
      expect(result.meta.path).toBeDefined();
      expect(result.meta.path.hasVariables).toBe(false);
    });
    
    it('should parse a namespace import with path variable and alias', async () => {
      const input = '/import "@pathVar" as config';
      const result = (await parse(input)).ast[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importNamespace');
      expect(result.source).toBe('path'); // Check new source field
      
      // Check path has a variable
      expect(result.values.path).toHaveLength(1);
      expect(result.values.path[0].type).toBe('VariableReference');
      expect(result.values.namespace[0].content).toBe('config'); // Explicit alias required for variable paths
      
      // Check meta
      expect(result.meta.path.hasVariables).toBe(true);
    });
  });
  
  describe('Import Selected', () => {
    it('should parse a selective import', async () => {
      const input = '/import { var1, var2 } from "path/to/file.mlld"';
      const result = (await parse(input)).ast[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importSelected');
      expect(result.source).toBe('path'); // Check new source field
      
      // Check values
      expect(result.values.imports).toHaveLength(2);
      // Check type but don't rely on identifier location
      expect(result.values.imports[0].type).toBe('VariableReference');
      expect(result.values.imports[0].valueType).toBe('import');
      expect(result.values.imports[1].type).toBe('VariableReference');
      expect(result.values.imports[1].valueType).toBe('import');
      
      // Check meta
      expect(result.meta.path).toBeDefined();
      expect(result.meta.path.hasVariables).toBe(false);
      
      // Check type guard
      expect(isImportSelectedDirective(result)).toBe(true);
    });
    
    // Alias support has been removed from the grammar
    // The test for aliases has been removed as this syntax is no longer supported
    
    it('should parse an import with @var variable in path', async () => {
      const input = '/import { var1 } from "prefix/@textVar/suffix.mlld"';
      const result = (await parse(input)).ast[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importSelected');
      expect(result.source).toBe('path'); // Check new source field
      
      // Check meta for @var variable
      expect(result.meta.path.hasVariables).toBe(true);
      
      // Check type guard
      expect(isImportSelectedDirective(result)).toBe(true);
    });
  });
});

describe('Import Directive AST Structure', () => {
  describe('New Values Object Structure', () => {
    for (const fixture of importFixtures) {
      it(`should parse ${fixture.name} with correct values object structure`, async () => {
        const node = await parseDirective(fixture.input);
        
        // Verify basic directive properties
        expect(node.type).toBe('Directive');
        expect(node.kind).toBe(fixture.expected.kind);
        expect(node.subtype).toBe(fixture.expected.subtype);
        expect(node.source).toBe('path'); // Check source field
        
        // Verify the values object structure exists
        expect(node.values).toBeDefined();
        expect(typeof node.values).toBe('object');
        
        // Check that expected keys exist in values
        for (const key of Object.keys(fixture.expected.values)) {
          expect(node.values).toHaveProperty(key);
          // Special case: namespace field in importNamespace is an array of Text nodes
          if (node.subtype === 'importNamespace' && key === 'namespace') {
            expect(Array.isArray(node.values[key])).toBe(true);
          } else {
            expect(Array.isArray(node.values[key])).toBe(true);
          }
        }
        
        // Sample check (specific nodes will be verified in implementation tests)
        if (node.values.imports) {
          expect(node.values.imports.length).toBeGreaterThan(0);
          // Verify type instead of identifier
          expect(node.values.imports[0].type).toBe('VariableReference');
          expect(node.values.imports[0].valueType).toBe('import');
        }
        
        if (node.values.path) {
          expect(node.values.path.length).toBeGreaterThan(0);
        }
      });
    }
  });
  
  describe('Raw Values Property', () => {
    for (const fixture of importFixtures) {
      if (fixture.expected.raw) {
        it(`should include raw strings for ${fixture.name}`, async () => {
          const node = await parseDirective(fixture.input);
          
          // Verify raw property exists
          expect(node.raw).toBeDefined();
          expect(typeof node.raw).toBe('object');
          
          // Check that expected keys exist in raw with correct types
          for (const key of Object.keys(fixture.expected.raw!)) {
            // Validate property exists on the raw object
            expect(node.raw).toHaveProperty(key);
            expect(typeof node.raw[key]).toBe('string');
          }
        });
      }
    }
  });
  
  describe('Metadata Property', () => {
    for (const fixture of importFixtures) {
      if (fixture.expected.meta) {
        it(`should include metadata for ${fixture.name}`, async () => {
          const node = await parseDirective(fixture.input);
          
          
          // Verify meta property exists
          expect(node.meta).toBeDefined();
          expect(typeof node.meta).toBe('object');
          
          // For now, just check that the meta object exists - we will check specific properties
          // after we see what the actual structure is
        });
      }
    }
  });
});