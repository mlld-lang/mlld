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
      expect(result.values.namespace[0].identifier).toBe('file'); // Auto-derived from filename
      
      // Check raw
      expect(result.raw.path).toBeDefined();
      expect(result.raw.namespace).toBe('file');
      
      // Check meta
      expect(result.meta.path).toBeDefined();
      expect(result.meta.path.hasVariables).toBe(false);
    });
    
    it('should parse a namespace import with explicit alias', async () => {
      const input = '/import "path/to/file.mlld" as @myModule';
      const result = (await parse(input)).ast[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importNamespace');
      expect(result.source).toBe('path'); // Check new source field
      
      // Check values
      expect(result.values.path).toBeDefined();
      expect(result.values.namespace[0].identifier).toBe('myModule'); // Explicit alias (stored without prefix)
      
      // Check raw
      expect(result.raw.path).toBeDefined();
      expect(result.raw.namespace).toBe('@myModule');
      
      // Check meta
      expect(result.meta.path).toBeDefined();
      expect(result.meta.path.hasVariables).toBe(false);
    });
    
    it('should parse a namespace import with path variable and alias', async () => {
      const input = '/import "@pathVar" as @config';
      const result = (await parse(input)).ast[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importNamespace');
      expect(result.source).toBe('path'); // Check new source field
      
      // Check path has a variable
      expect(result.values.path).toHaveLength(1);
      expect(result.values.path[0].type).toBe('VariableReference');
      expect(result.values.namespace[0].identifier).toBe('config'); // Explicit alias required for variable paths
      
      // Check meta
      expect(result.meta.path.hasVariables).toBe(true);
    });

    it('should parse a module reference with explicit extension', async () => {
      const input = '/import @context/agents.mld as @mx';
      const result = (await parse(input)).ast[0];

      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importNamespace');
      expect(result.values.namespace[0].identifier).toBe('mx');
      expect(result.raw.path).toBe('@context/agents.mld');
      expect(result.meta?.path?.extension).toBe('.mld');
      expect(result.meta?.path?.name).toBe('agents');
    });

    it('should reject shorthand alias without @ prefix', async () => {
      const input = '/import "path/to/file.mlld" as module';
      const result = await parse(input);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Import aliases must include '@'. Use 'as @module'");
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

    it('should parse selected imports across multiple lines', async () => {
      const input = `/import {
  @first,
  second as @secondAlias,
  third
} from "./file.mld"`;
      const result = await parse(input);
      expect(result.success).toBe(true);

      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.kind).toBe('import');
      expect(directive.subtype).toBe('importSelected');
      expect(directive.values.imports).toHaveLength(3);
      expect(directive.values.imports[0].identifier).toBe('first');
      expect(directive.values.imports[1].identifier).toBe('second');
      expect(directive.values.imports[1].alias).toBe('secondAlias');
      expect(directive.values.imports[2].identifier).toBe('third');
    });

    it('should report malformed multi-line import errors at the import line', async () => {
      const input = `/import {
  @first
  @second
} from "./file.mld"
/for @x in [1,2] => @x`;
      const result = await parse(input);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unclosed import list in import directive');

      const parseError = result.error as Error & {
        mlldErrorLocation?: { start: { line: number; column: number } };
      };
      expect(parseError.mlldErrorLocation?.start.line).toBe(1);
      expect(parseError.mlldErrorLocation?.start.column).toBe(1);
    });

    it('should parse a node import source', async () => {
      const input = '/import { join } from node @path';
      const result = (await parse(input)).ast[0];

      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importSelected');
      expect(result.source).toBe('path');
      expect(result.values.path[0].content).toBe('@path');
      expect(result.raw.path).toBe('@path');
      expect(result.meta.path.isNodeImport).toBe(true);
      expect(result.meta.path.package).toBe('@path');
    });

    it('should support @-prefixed selected imports', async () => {
      const input = '/import {@this, @that} from @author/module';
      const result = (await parse(input)).ast[0];

      expect(result.type).toBe('Directive');
      expect(result.subtype).toBe('importSelected');
      expect(result.values.imports[0].identifier).toBe('this');
      expect(result.values.imports[1].identifier).toBe('that');
      expect(result.raw.imports).toBe('@this, @that');
    });

    it('should reject selected import aliases without @ prefix', async () => {
      const input = '/import { helper as alias } from "./file.mld"';
      const result = await parse(input);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Import aliases must include '@'. Use 'as @alias'");
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

  describe('Import MCP tools', () => {
    it('should parse MCP tool selected imports', async () => {
      const input = '/import tools { @echo } from mcp "@anthropic/filesystem"';
      const result = (await parse(input)).ast[0];

      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importMcpSelected');
      expect(result.values.imports).toHaveLength(1);
      expect(result.values.imports[0].identifier).toBe('echo');
    });

    it('should parse MCP tool namespace imports', async () => {
      const input = '/import tools from mcp "@github/issues" as @github';
      const result = (await parse(input)).ast[0];

      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('import');
      expect(result.subtype).toBe('importMcpNamespace');
      expect(result.values.namespace[0].identifier).toBe('github');
    });

    it('should reject MCP namespace imports without alias', async () => {
      const input = '/import tools from mcp "@github/issues"';
      const result = await parse(input);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('MCP tool imports require an alias');
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
