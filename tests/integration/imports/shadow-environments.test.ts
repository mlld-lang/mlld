import { describe, it, expect } from 'vitest';
import { testImport, ImportTestRunner } from './test-utils';

describe('Shadow Environment Import Tests', () => {
  describe('Basic Shadow Function Imports', () => {
    it('should preserve shadow functions through selected import', async () => {
      const result = await testImport(`
/import { math } from "./math-utils.mld"  
/var @result = @math.calculate(10)
/show @result`, {
        files: {
          'math-utils.mld': `
/exe @double(x) = js { return x * 2; }
/exe @triple(x) = js { return x * 3; }

>> First declare shadow environment for functions to access each other
/exe @js = { double, triple }

>> Now define function that uses shadow functions
/exe @calculate(@n) = js {
  return double(n) + triple(n);
}

/var @math = { calculate: @calculate }`
        },
        expectedOutput: '50' // (10*2) + (10*3) = 20 + 30 = 50
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it('should preserve shadow functions through namespace import', async () => {
      const result = await testImport(`
/import "./string-utils.mld" as @utils
/var @result = @utils.process.format("hello", "world")
/show @result`, {
        files: {
          'string-utils.mld': `
/exe @capitalize(s) = js { 
  return s.charAt(0).toUpperCase() + s.slice(1); 
}
/exe @join(a, b, sep) = js { 
  return a + (sep || " ") + b; 
}

>> Set up shadow environment
/exe @js = { capitalize, join }

>> Function using shadow functions
/exe @format(@str1, @str2) = js {
  const cap1 = capitalize(str1);
  const cap2 = capitalize(str2);
  return join(cap1, cap2, " - ");
}

/var @process = { format: @format }`
        },
        expectedOutput: 'Hello - World'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Nested Shadow Dependencies', () => {
    it('should handle multi-level shadow function calls', async () => {
      const result = await testImport(`
/import { validator } from "./validation.mld"
/var @result = @validator.check('test@example.com')
/show @result`, {
        files: {
          'validation.mld': `
>> Level 1: Basic helpers
/exe @isString(val) = js { 
  return typeof val === "string"; 
}

>> Level 2: Uses level 1
/exe @hasAt(str) = js {
  return isString(str) && str.includes("@");
}

>> Level 3: Uses level 2  
/exe @isEmail(val) = js {
  return hasAt(val) && val.includes(".");
}

>> Set up shadow environment with all functions
/exe @js = { isString, hasAt, isEmail }

>> Public function uses level 3
/exe @checkEmail(@email) = js {
  return isEmail(email) ? "valid" : "invalid";
}

/var @validator = { check: @checkEmail }`
        },
        expectedOutput: 'valid'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Cross-Language Shadow Environments', () => {
    it('should handle both JS and Node shadow environments in same module', async () => {
      const runner = new ImportTestRunner();
      await runner.setup();
      
      try {
        const result = await runner.runTest({
          name: 'cross-language-shadows',
          description: 'Module with both JS and Node shadow functions',
          files: {
            'hybrid.mld': `
>> JavaScript shadow functions
/exe @jsHelper() = js { return "from JS"; }
/exe @js = { jsHelper }
/exe @useJs() = js { return jsHelper() + " shadow"; }

>> Node.js shadow functions  
/exe @nodeHelper() = node { return "from Node"; }
/exe @node = { nodeHelper }
/exe @useNode() = node { 
  const result = await nodeHelper();
  return result + " shadow";
}

/var @exports = {
  jsFunc: @useJs,
  nodeFunc: @useNode
}`
          },
          mainScript: `
/import { exports } from "./hybrid.mld"
/var @jsResult = @exports.jsFunc()
/var @nodeResult = @exports.nodeFunc()
/show @jsResult
/show @nodeResult`,
          expectedOutput: `from JS shadow

from Node shadow`
        });
        
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      } finally {
        await runner.cleanup();
      }
    });
  });
  
  describe('Shadow Environment Edge Cases', () => {
    it('should fail gracefully when shadow function is missing', async () => {
      const result = await testImport(`
/import { broken } from "./broken.mld"
/var @result = @broken.call()`, {
        files: {
          'broken.mld': `
>> Function that uses non-existent shadow function
/exe @callMissing() = js {
  return missingFunction();
}
/var @broken = { call: @callMissing }`
        },
        expectedError: /missingFunction is not defined/
      });
      
      expect(result.success).toBe(true); // Expects error
      expect(result.exitCode).toBe(1);
    });
    
    it('should handle shadow functions with parameters', async () => {
      const result = await testImport(`
/import { calc } from "./param-shadows.mld"
/var @result = @calc.compute(5, 3)
/show @result`, {
        files: {
          'param-shadows.mld': `
/exe @add(a, b) = js { return a + b; }
/exe @multiply(a, b) = js { return a * b; }
/exe @js = { add, multiply }

/exe @compute(@x, @y) = js {
  const sum = add(x, y);
  const product = multiply(x, y);
  return sum + product;
}

/var @calc = { compute: @compute }`
        },
        expectedOutput: '23' // (5+3) + (5*3) = 8 + 15 = 23
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Import Chains with Shadow Environments', () => {
    it.skip('should preserve shadows through multiple import levels', async () => {
      // TODO: Fix shadow environment preservation through import chains (https://github.com/mlld-lang/modules/issues/6)
      const runner = new ImportTestRunner();
      await runner.setup();
      
      try {
        const result = await runner.runTest({
          name: 'import-chain-shadows',
          description: 'Shadow functions through import chain',
          files: {
            'level1.mld': `
/exe @base() = js { return "base"; }
/exe @js = { base }
/exe @level1Func() = js { return base() + "->L1"; }
/var @exports = { func: @level1Func }`,
            
            'level2.mld': `
/import { exports as @l1exports } from "./level1.mld"
/var @l1Result = @l1exports.func()
/exe @level2Func() = js { return "@l1Result->L2"; }
/var @exports = {
  func: @level2Func,
  l1: @l1exports
}`,
            
            'level3.mld': `
/import { exports } from "./level2.mld"
/var @l2Result = @exports.func()
/var @exports = {
  result: @l2Result,
  l1Func: @exports.l1.func
}`
          },
          mainScript: `
/import { exports } from "./level3.mld"
/show @exports.result
/var @l1Direct = @exports.l1Func()
/show @l1Direct`,
          expectedOutput: `base->L1->L2
base->L1`
        });
        
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      } finally {
        await runner.cleanup();
      }
    });
  });
});
