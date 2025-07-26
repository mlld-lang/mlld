import { describe, it, expect } from 'vitest';
import { ImportTestRunner, testImport } from './test-utils';

describe('Complex Import Scenarios', () => {
  describe('Import Chains', () => {
    it('should handle linear import chain (A→B→C)', async () => {
      const runner = new ImportTestRunner();
      await runner.setup();
      
      try {
        const result = await runner.runTest({
          name: 'linear-import-chain',
          description: 'Module A imports B imports C',
          files: {
            'c.mld': `
/var @message = "Hello from C"
/exe @process(x) = js { return x.toUpperCase(); }`,
            
            'b.mld': `
/import { message, process } from "./c.mld"
/var @bMessage = @message
/var @bProcess = @process
/var @combined = @process(@message)`,
            
            'a.mld': `
/import { bMessage, combined } from "./b.mld"
/var @aMessage = @bMessage
/var @aResult = @combined`
          },
          mainScript: `
/import { aMessage, aResult } from "./a.mld"
/show @aMessage
/show @aResult`,
          expectedOutput: `Hello from C
HELLO FROM C`
        });
        
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      } finally {
        await runner.cleanup();
      }
    });
    
    it('should handle diamond import pattern', async () => {
      const runner = new ImportTestRunner();
      await runner.setup();
      
      try {
        const result = await runner.runTest({
          name: 'diamond-import',
          description: 'A and B both import C, main imports A and B',
          files: {
            'shared.mld': '/var @counter = 1',
            
            'left.mld': `
/import { counter } from "./shared.mld"
/var @leftValue = @counter`,
            
            'right.mld': `
/import { counter } from "./shared.mld"  
/var @rightValue = @counter`,
            
            'top.mld': `
/import { leftValue } from "./left.mld"
/import { rightValue } from "./right.mld"
/var @bothValues = { left: @leftValue, right: @rightValue }`
          },
          mainScript: `
/import { bothValues } from "./top.mld"
/show @bothValues.left
/show @bothValues.right`,
          expectedOutput: `1
1`
        });
        
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      } finally {
        await runner.cleanup();
      }
    });
  });
  
  describe('Re-exports', () => {
    it('should handle simple re-export', async () => {
      const result = await testImport(`
/import { utils } from "./wrapper.mld"
/var @result = @utils.helper()
/show @result`, {
        files: {
          'core.mld': '/exe @helper() = js { return "Core helper"; }',
          'wrapper.mld': `
/import { helper } from "./core.mld"
/var @utils = { helper: @helper }`
        },
        expectedOutput: 'Core helper'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it.skip('should handle aggregate re-exports', async () => {
      // TODO: Implement aggregate re-export functionality (https://github.com/mlld-lang/modules/issues/7)
      const result = await testImport(`
/import { toolkit } from "./index.mld"
/show @toolkit.math.add(2, 3)
/show @toolkit.string.upper("hello")
/show @toolkit.array.first([1, 2, 3])`, {
        files: {
          'math.mld': '/exe @add(a, b) = js { return a + b; }',
          'string.mld': '/exe @upper(s) = js { return s.toUpperCase(); }',  
          'array.mld': '/exe @first(arr) = js { return arr[0]; }',
          'index.mld': `
/import { add } from "./math.mld"
/import { upper } from "./string.mld"
/import { first } from "./array.mld"

/var @toolkit = {
  math: { add: @add },
  string: { upper: @upper },
  array: { first: @first }
}`
        },
        expectedOutput: `5
HELLO
1`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Mixed Import Sources', () => {
    it.skip('should combine local and registry imports', async () => {
      // TODO: @mlld/time module not published to registry yet
      const result = await testImport(`
/import { helper } from "./local.mld"
/import { time } from @mlld/time

/var @timestamp = @time.format(@now, "YYYY-MM-DD")
/var @message = @helper(@timestamp)
/show @message`, {
        files: {
          'local.mld': '/exe @helper(date) = `Today is @date`'
        },
        expectedOutput: /^Today is \d{4}-\d{2}-\d{2}$/
      });
      
      expect(result.output).toMatch(/^Today is \d{4}-\d{2}-\d{2}$/);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Simple Import Pattern', () => {
    it.skip('should create default namespace for simple local import', async () => {
      // TODO: Implement simple import namespace creation (https://github.com/mlld-lang/modules/issues/2)
      const result = await testImport(`
/import "./utilities.mld"
/show @utilities.name
/var @result = @utilities.double(21)
/show @result`, {
        files: {
          'utilities.mld': `
/var @name = "Utility Module"
/exe @double(x) = js { return x * 2; }`
        },
        expectedOutput: `Utility Module
42`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it.skip('should create namespace from module name for registry import', async () => {
      // TODO: @mlld/time module not published to registry yet
      const result = await testImport(`
/import @mlld/time
/var @now = @time.time.now()
/show @now`, {
        expectedOutput: /^\d{4}-\d{2}-\d{2}T/
      });
      
      expect(result.output).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Complex Nested Access', () => {
    it('should handle deep property access chains', async () => {
      const result = await testImport(`
/import { api } from "./deep-api.mld"
/var @result = @api.v1.users.actions.create("Alice", "admin")
/show @result`, {
        files: {
          'deep-api.mld': `
/exe @createUser(name, role) = js {
  return "Created user: " + name + " with role: " + role;
}

/var @api = {
  v1: {
    users: {
      actions: {
        create: @createUser
      }
    }
  }
}`
        },
        expectedOutput: 'Created user: Alice with role: admin'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Performance with Large Modules', () => {
    it('should handle module with many exports efficiently', async () => {
      const runner = new ImportTestRunner();
      await runner.setup();
      
      try {
        // Generate a module with 100 exports
        const exports: string[] = [];
        for (let i = 1; i <= 100; i++) {
          exports.push(`/var @var${i} = ${i}`);
        }
        
        const result = await runner.runTest({
          name: 'large-module-import',
          description: 'Import from module with 100+ exports',
          files: {
            'large.mld': exports.join('\n')
          },
          mainScript: `
/import { var1, var50, var100 } from "./large.mld"
/show @var1
/show @var50  
/show @var100`,
          expectedOutput: `1
50
100`,
          timeout: 10000 // Allow more time for large module
        });
        
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
        expect(result.duration).toBeLessThan(5000); // Should still be fast
      } finally {
        await runner.cleanup();
      }
    });
  });
});