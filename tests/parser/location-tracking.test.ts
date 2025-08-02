import { describe, it, expect } from 'vitest';
import { parseSync as parse } from '@grammar/parser';

/**
 * Tests for location tracking in the mlld parser
 * Ensures all AST nodes have accurate location information
 */

describe('Location Tracking', () => {
  /**
   * Helper to walk the AST and check all nodes
   */
  function walkAST(nodes: any[], callback: (node: any, path: string[]) => void, path: string[] = []) {
    if (!Array.isArray(nodes)) {
      nodes = [nodes];
    }
    
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      
      // Call the callback for this node
      callback(node, path);
      
      // Recurse into child properties
      for (const [key, value] of Object.entries(node)) {
        if (key === 'nodeId' || key === 'location' || key === 'raw' || key === 'meta' || key === 'source') continue;
        
        if (Array.isArray(value)) {
          walkAST(value, callback, [...path, key]);
        } else if (value && typeof value === 'object') {
          // Handle objects with node-like structures (values object, etc)
          if (value.type) {
            walkAST([value], callback, [...path, key]);
          } else {
            // For objects like 'values', recurse into their properties
            for (const [subKey, subValue] of Object.entries(value)) {
              if (Array.isArray(subValue)) {
                walkAST(subValue, callback, [...path, key, subKey]);
              } else if (subValue && typeof subValue === 'object' && subValue.type) {
                walkAST([subValue], callback, [...path, key, subKey]);
              }
            }
          }
        }
      }
    }
  }
  
  /**
   * Helper to check if a location is valid (not dummy)
   */
  function isValidLocation(location: any): boolean {
    if (!location) return false;
    if (!location.start || !location.end) return false;
    
    // Check for dummy locations (0:0 or 1:1)
    const isDummy = (
      (location.start.line === 0 && location.start.column === 0) ||
      (location.start.line === 1 && location.start.column === 1 && 
       location.end.line === 1 && location.end.column === 1 &&
       location.start.offset === 0 && location.end.offset === 0)
    );
    
    return !isDummy;
  }
  
  describe('Basic directives', () => {
    it('should have accurate locations for /var directive', () => {
      const input = '/var @name = "test"';
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.type === 'Directive') {
          expect(node.location).toBeDefined();
          expect(node.location.start.line).toBe(1);
          expect(node.location.start.column).toBe(1);
          expect(node.location.start.offset).toBe(0);
          expect(node.location.end.offset).toBeGreaterThan(0);
        }
      });
    });
    
    it('should have accurate locations for variable references', () => {
      const input = '/show @greeting';
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.type === 'VariableReference') {
          expect(node.location).toBeDefined();
          expect(isValidLocation(node.location)).toBe(true);
          expect(node.location.start.column).toBeGreaterThan(6); // After "/show "
        }
      });
    });
  });
  
  describe('Template interpolation', () => {
    it('should track locations in backtick templates', () => {
      const input = '/var @msg = `Hello @name!`';
      const ast = parse(input);
      
      let foundInterpolation = false;
      walkAST(ast, (node, path) => {
        if (node.type === 'VariableReference' && node.identifier === 'name') {
          foundInterpolation = true;
          expect(node.location).toBeDefined();
          expect(isValidLocation(node.location)).toBe(true);
          expect(node.location.start.column).toBeGreaterThan(19); // After "Hello "
        }
      });
      
      expect(foundInterpolation).toBe(true);
    });
    
    it('should track locations in double-colon templates', () => {
      const input = '/var @docs = ::The `function()` returns @result::';
      const ast = parse(input);
      
      let foundVar = false;
      walkAST(ast, (node, path) => {
        if (node.type === 'VariableReference' && node.identifier === 'result') {
          foundVar = true;
          expect(node.location).toBeDefined();
          expect(isValidLocation(node.location)).toBe(true);
        }
      });
      
      expect(foundVar).toBe(true);
    });
  });
  
  describe('Multi-line constructs', () => {
    it('should track locations across multiple lines', () => {
      const input = `/var @config = {
  "name": "test",
  "value": 42
}`;
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.location) {
          expect(isValidLocation(node.location)).toBe(true);
          expect(node.location.start.line).toBeGreaterThanOrEqual(1);
          expect(node.location.end.line).toBeLessThanOrEqual(4);
        }
      });
    });
    
    it('should track locations in multi-line commands', () => {
      const input = `/sh {
  echo "Line 1"
  echo "Line 2"
}`;
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.type === 'Directive') {
          expect(node.location.start.line).toBe(1);
          expect(node.location.end.line).toBe(4);
        }
      });
    });
  });
  
  describe('Complex expressions', () => {
    it('should track locations in when expressions', () => {
      const input = '/when @score > 90 => /show `Excellent!`';
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.type === 'BinaryExpression') {
          expect(node.location).toBeDefined();
          expect(isValidLocation(node.location)).toBe(true);
        }
      });
    });
    
    it('should track locations in nested field access', () => {
      const input = '/show @user.profile.name';
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.type === 'VariableReference') {
          expect(node.location).toBeDefined();
          expect(isValidLocation(node.location)).toBe(true);
        }
      });
    });
  });
  
  describe('Edge cases', () => {
    it('should handle empty templates', () => {
      const input = '/var @empty = ``';
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.location) {
          expect(isValidLocation(node.location)).toBe(true);
        }
      });
    });
    
    it('should handle special characters', () => {
      const input = '/var @special = `@#$%^&*()`';
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.location) {
          expect(isValidLocation(node.location)).toBe(true);
        }
      });
    });
  });
  
  describe('No dummy locations', () => {
    it('should not have any nodes with dummy locations', () => {
      const complexInput = `
/import { utils } from @company/shared
/var @name = "Alice"
/var @greeting = \`Hello @name, welcome to @place!\`
/when @score > 80 => /show @greeting
/exe @process(data) = js {
  return data.map(d => d.value * 2);
}
/run @process([1, 2, 3])
`;
      
      const ast = parse(complexInput);
      const nodesWithoutLocation: string[] = [];
      const nodesWithDummyLocation: string[] = [];
      
      walkAST(ast, (node, path) => {
        const nodePath = [...path, node.type].join('.');
        
        if (!node.location) {
          nodesWithoutLocation.push(`${nodePath} (${JSON.stringify(node).substring(0, 50)}...)`);
        } else if (!isValidLocation(node.location)) {
          nodesWithDummyLocation.push(`${nodePath} at ${node.location.start.line}:${node.location.start.column}`);
        }
      });
      
      expect(nodesWithoutLocation).toHaveLength(0);
      expect(nodesWithDummyLocation).toHaveLength(0);
    });
  });
  
  describe('Location accuracy', () => {
    it('should have correct offsets for simple directive', () => {
      const input = '/var @x = 5';
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.type === 'Directive') {
          expect(node.location.start.offset).toBe(0);
          expect(node.location.end.offset).toBe(input.length);
        }
      });
    });
    
    it('should have correct line/column for multi-line', () => {
      const input = 'First line\n/var @x = 5';
      const ast = parse(input);
      
      walkAST(ast, (node, path) => {
        if (node.type === 'Directive' && node.kind === 'var') {
          expect(node.location.start.line).toBe(2);
          expect(node.location.start.column).toBe(1);
        }
      });
    });
  });
  
  describe('Import Specifier Location Tracking', () => {
    test('simple import specifiers should have location', () => {
      const input = '/import { utils } from "./file.mld"';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.kind).toBe('import');
      
      const importSpec = directive.values.imports[0];
      expect(importSpec.type).toBe('VariableReference');
      expect(importSpec.identifier).toBe('utils');
      expect(importSpec.location).toBeDefined();
      expect(isValidLocation(importSpec.location)).toBe(true);
    });
    
    test('aliased import specifiers should have location', () => {
      const input = '/import { data as myData } from "./file.mld"';
      const ast = parse(input);
      
      const directive = ast[0];
      const importSpec = directive.values.imports[0];
      expect(importSpec.type).toBe('VariableReference');
      expect(importSpec.identifier).toBe('data');
      expect(importSpec.alias).toBe('myData');
      expect(importSpec.location).toBeDefined();
      expect(isValidLocation(importSpec.location)).toBe(true);
    });
    
    test('multiple import specifiers should each have location', () => {
      const input = '/import { foo, bar as baz, qux } from "./file.mld"';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.values.imports).toHaveLength(3);
      
      // Check each import specifier
      directive.values.imports.forEach((importSpec: any, index: number) => {
        expect(importSpec.type).toBe('VariableReference');
        expect(importSpec.location).toBeDefined();
        expect(isValidLocation(importSpec.location)).toBe(true);
        
        // Verify locations are different for each specifier
        if (index > 0) {
          const prevSpec = directive.values.imports[index - 1];
          expect(importSpec.location.start.offset).toBeGreaterThan(prevSpec.location.end.offset);
        }
      });
    });
    
    test('wildcard imports with alias should have location', () => {
      const input = '/import { * as utils } from "./file.mld"';
      const ast = parse(input);
      
      const directive = ast[0];
      const importSpec = directive.values.imports[0];
      expect(importSpec.type).toBe('VariableReference');
      expect(importSpec.identifier).toBe('*');
      expect(importSpec.alias).toBe('utils');
      expect(importSpec.location).toBeDefined();
      expect(isValidLocation(importSpec.location)).toBe(true);
    });
    
    test('import from module reference should have location', () => {
      const input = '/import { Logger } from @company/shared';
      const ast = parse(input);
      
      const directive = ast[0];
      const importSpec = directive.values.imports[0];
      expect(importSpec.type).toBe('VariableReference');
      expect(importSpec.identifier).toBe('Logger');
      expect(importSpec.location).toBeDefined();
      expect(isValidLocation(importSpec.location)).toBe(true);
    });
    
    test('import with TTL and trust should maintain specifier locations', () => {
      const input = '/import { config as cfg } from "./settings.mld" (5m) trust always';
      const ast = parse(input);
      
      const directive = ast[0];
      const importSpec = directive.values.imports[0];
      expect(importSpec.type).toBe('VariableReference');
      expect(importSpec.identifier).toBe('config');
      expect(importSpec.alias).toBe('cfg');
      expect(importSpec.location).toBeDefined();
      expect(isValidLocation(importSpec.location)).toBe(true);
    });
  });
  
  describe('TTL and Trust Location Tracking', () => {
    test('TTL duration should have location', () => {
      const input = '/path @api = "https://api.com" (5m)';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.kind).toBe('path');
      
      // Check TTL exists
      expect(directive.values.ttl).toBeDefined();
      expect(directive.values.ttl.type).toBe('duration');
      expect(directive.values.ttl.value).toBe(5);
      expect(directive.values.ttl.unit).toBe('minutes');
      expect(directive.values.ttl.location).toBeDefined();
      expect(isValidLocation(directive.values.ttl.location)).toBe(true);
    });
    
    test('TTL special values should have location', () => {
      const input = '/import "./data.mld" (live)';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.values.ttl).toBeDefined();
      expect(directive.values.ttl.type).toBe('special');
      expect(directive.values.ttl.value).toBe('live');
      expect(directive.values.ttl.location).toBeDefined();
      expect(isValidLocation(directive.values.ttl.location)).toBe(true);
    });
    
    test('Trust level should have location', () => {
      const input = '/run {command} trust always';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.kind).toBe('run');
      
      // Check trust level is in withClause
      expect(directive.values.withClause).toBeDefined();
      expect(directive.values.withClause.trust).toBeDefined();
      expect(directive.values.withClause.trust.level).toBe('always');
      expect(directive.values.withClause.trust.location).toBeDefined();
      expect(isValidLocation(directive.values.withClause.trust.location)).toBe(true);
    });
    
    test('TTL and trust combined should both have locations', () => {
      const input = '/import { config } from "./settings.mld" (30d) trust verify';
      const ast = parse(input);
      
      const directive = ast[0];
      
      // Check TTL
      expect(directive.values.ttl).toBeDefined();
      expect(directive.values.ttl.type).toBe('duration');
      expect(directive.values.ttl.value).toBe(30);
      expect(directive.values.ttl.unit).toBe('days');
      expect(directive.values.ttl.location).toBeDefined();
      expect(isValidLocation(directive.values.ttl.location)).toBe(true);
      
      // Check trust is in withClause
      expect(directive.values.withClause).toBeDefined();
      expect(directive.values.withClause.trust).toBeDefined();
      expect(directive.values.withClause.trust.level).toBe('verify');
      expect(directive.values.withClause.trust.location).toBeDefined();
      expect(isValidLocation(directive.values.withClause.trust.location)).toBe(true);
    });
    
    test.skip('TTL in with clause should have location', () => {
      const input = '/run {script} with { ttl: 10h }';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.values.withClause).toBeDefined();
      
      // Note: with clause parsing might need separate investigation
      // This test documents expected behavior once implemented
    });
    
    test('Different TTL units should all have locations', () => {
      const testCases = [
        { input: '/path @a = "url" (5s)', unit: 'seconds' },
        { input: '/path @b = "url" (10m)', unit: 'minutes' },
        { input: '/path @c = "url" (2h)', unit: 'hours' },
        { input: '/path @d = "url" (7d)', unit: 'days' },
        { input: '/path @e = "url" (1w)', unit: 'weeks' }
      ];
      
      testCases.forEach(({ input, unit }) => {
        const ast = parse(input);
        const directive = ast[0];
        
        expect(directive.values.ttl).toBeDefined();
        expect(directive.values.ttl.unit).toBe(unit);
        expect(directive.values.ttl.location).toBeDefined();
        expect(isValidLocation(directive.values.ttl.location)).toBe(true);
      });
    });
  });
  
  describe('Pipeline Operator Location Tracking', () => {
    test('pipeline array syntax should have location for each command', () => {
      const input = '/run {echo "test"} pipeline [@upper, @trim]';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.kind).toBe('run');
      
      // Check pipeline exists in withClause
      expect(directive.values.withClause).toBeDefined();
      expect(directive.values.withClause.pipeline).toBeDefined();
      expect(directive.values.withClause.pipeline).toHaveLength(2);
      
      // Check each pipeline command has location
      const [upper, trim] = directive.values.withClause.pipeline;
      
      // @upper command
      expect(upper.identifier[0].type).toBe('VariableReference');
      expect(upper.identifier[0].identifier).toBe('upper');
      expect(upper.identifier[0].location).toBeDefined();
      expect(isValidLocation(upper.identifier[0].location)).toBe(true);
      
      // @trim command
      expect(trim.identifier[0].type).toBe('VariableReference');
      expect(trim.identifier[0].identifier).toBe('trim');
      expect(trim.identifier[0].location).toBeDefined();
      expect(isValidLocation(trim.identifier[0].location)).toBe(true);
    });
    
    test('pipeline with function arguments should track argument locations', () => {
      const input = '/show @data pipeline [@filter("active"), @sort("name")]';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.values.withClause.pipeline).toHaveLength(2);
      
      const [filter, sort] = directive.values.withClause.pipeline;
      
      // Check filter command
      expect(filter.identifier[0].identifier).toBe('filter');
      expect(filter.args).toHaveLength(1);
      expect(filter.args[0].type).toBe('Text');
      expect(filter.args[0].content).toBe('active');
      expect(filter.args[0].location).toBeDefined();
      expect(isValidLocation(filter.args[0].location)).toBe(true);
      
      // Check sort command
      expect(sort.identifier[0].identifier).toBe('sort');
      expect(sort.args).toHaveLength(1);
      expect(sort.args[0].type).toBe('Text');
      expect(sort.args[0].content).toBe('name');
      expect(sort.args[0].location).toBeDefined();
      expect(isValidLocation(sort.args[0].location)).toBe(true);
    });
    
    test.skip('pipe operator syntax should have location (not yet implemented)', () => {
      const input = '/run {echo "test"} | @upper | @trim';
      const ast = parse(input);
      
      // This test documents the expected behavior once pipe operator is implemented
      const directive = ast[0];
      expect(directive.values.withClause).toBeDefined();
      expect(directive.values.withClause.pipeline).toBeDefined();
      expect(directive.values.withClause.pipeline).toHaveLength(2);
    });
  });
  
  describe('Field Access Location Tracking', () => {
    test('dot notation field access location', () => {
      const input = '/var @data = @user.profile.name';
      const ast = parse(input);
      
      const directive = ast[0];
      const value = directive.values.value[0];
      
      expect(value.type).toBe('VariableReference');
      expect(value.fields).toBeDefined();
      expect(value.fields.length).toBe(2);
      
      // Check first field access (.profile)
      const firstField = value.fields[0];
      expect(firstField.type).toBe('field');
      expect(firstField.value).toBe('profile');
      expect(firstField.location).toBeDefined();
      expect(firstField.location.start.offset).toBe(18); // After @user
      expect(firstField.location.end.offset).toBe(26);   // After .profile
      
      // Check second field access (.name)
      const secondField = value.fields[1];
      expect(secondField.type).toBe('field');
      expect(secondField.value).toBe('name');
      expect(secondField.location).toBeDefined();
      expect(secondField.location.start.offset).toBe(26); // After .profile
      expect(secondField.location.end.offset).toBe(31);   // After .name
    });

    test('array access location', () => {
      const input = '/var @item = @array[0]';
      const ast = parse(input);
      
      const directive = ast[0];
      const value = directive.values.value[0];
      
      expect(value.type).toBe('VariableReference');
      expect(value.fields).toBeDefined();
      expect(value.fields.length).toBe(1);
      
      const arrayAccess = value.fields[0];
      expect(arrayAccess.type).toBe('arrayIndex');
      expect(arrayAccess.value).toBe(0);
      expect(arrayAccess.location).toBeDefined();
      expect(arrayAccess.location.start.offset).toBe(19); // Start of [
      expect(arrayAccess.location.end.offset).toBe(22);   // After ]
    });

    test('mixed field and array access location', () => {
      const input = '/var @result = @data.users[0].name';
      const ast = parse(input);
      
      const directive = ast[0];
      const value = directive.values.value[0];
      
      expect(value.fields.length).toBe(3);
      
      // .users field
      expect(value.fields[0].type).toBe('field');
      expect(value.fields[0].value).toBe('users');
      expect(value.fields[0].location.start.offset).toBe(20);
      
      // [0] array access
      expect(value.fields[1].type).toBe('arrayIndex');
      expect(value.fields[1].value).toBe(0);
      expect(value.fields[1].location.start.offset).toBe(26);
      
      // .name field
      expect(value.fields[2].type).toBe('field');
      expect(value.fields[2].value).toBe('name');
      expect(value.fields[2].location.start.offset).toBe(29);
    });
  });
});