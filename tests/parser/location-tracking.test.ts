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
});