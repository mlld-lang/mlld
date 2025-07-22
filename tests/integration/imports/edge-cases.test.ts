import { describe, it, expect } from 'vitest';
import { ImportTestRunner, testImport } from './test-utils';

describe('Import Edge Cases and Error Scenarios', () => {
  describe('Import Collisions', () => {
    it.skip('should fail when importing same variable name from different sources', async () => {
      // TODO: Implement import collision detection (https://github.com/mlld-lang/modules/issues/3)
      const result = await testImport(`
/import { helper } from "./module1.mld"
/import { helper } from "./module2.mld"`, {
        files: {
          'module1.mld': '/var @helper = "From module 1"',
          'module2.mld': '/var @helper = "From module 2"'
        },
        expectedError: /Variable 'helper' already exists|Import collision/
      });
      
      expect(result.success).toBe(true); // Expects error
      expect(result.exitCode).toBe(1);
    });
    
    it('should allow same name in different namespaces', async () => {
      const result = await testImport(`
/import "./module1.mld" as m1
/import "./module2.mld" as m2
/show @m1.helper
/show @m2.helper`, {
        files: {
          'module1.mld': '/var @helper = "From module 1"',
          'module2.mld': '/var @helper = "From module 2"'
        },
        expectedOutput: `From module 1
From module 2`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Missing Exports', () => {
    it.skip('should provide helpful error for non-existent export', async () => {
      // TODO: Add error for importing non-existent variables (https://github.com/mlld-lang/modules/issues/4)
      const result = await testImport(`
/import { exists, doesNotExist } from "./module.mld"`, {
        files: {
          'module.mld': '/var @exists = "I exist"'
        },
        expectedError: /Variable 'doesNotExist' not found/
      });
      
      expect(result.success).toBe(true); // Expects error
      expect(result.exitCode).toBe(1);
    });
    
    it.skip('should list available exports in error message', async () => {
      // TODO: Include available exports in error messages (https://github.com/mlld-lang/modules/issues/4)
      const runner = new ImportTestRunner();
      await runner.setup();
      
      try {
        const result = await runner.runTest({
          name: 'missing-export-helpful',
          description: 'Error should list available exports',
          files: {
            'module.mld': `
/var @foo = "foo"
/var @bar = "bar"
/var @baz = "baz"`
          },
          mainScript: '/import { qux } from "./module.mld"',
          expectedError: /not found.*Available.*foo.*bar.*baz/s
        });
        
        // Check that error mentions available exports
        expect(result.error).toMatch(/foo|bar|baz/);
        expect(result.exitCode).toBe(1);
      } finally {
        await runner.cleanup();
      }
    });
  });
  
  describe('Malformed Imports', () => {
    it('should handle syntax errors in import statements', async () => {
      const result = await testImport(`
/import { from "./broken.mld"`, {
        expectedError: /Parse error|Syntax error|Expected/
      });
      
      expect(result.success).toBe(true); // Expects error
      expect(result.exitCode).toBe(1);
    });
    
    it('should handle invalid import paths', async () => {
      const result = await testImport(`
/import { something } from "../../../../../../../etc/passwd"`, {
        expectedError: /Failed to resolve|not found|Access denied/
      });
      
      expect(result.success).toBe(true); // Expects error
      expect(result.exitCode).toBe(1);
    });
  });
  
  describe('Special Characters in Names', () => {
    it('should handle variables with underscores and numbers', async () => {
      const result = await testImport(`
/import { var_1, test_2_name } from "./special.mld"
/show @var_1
/show @test_2_name`, {
        files: {
          'special.mld': `
/var @var_1 = "First"
/var @test_2_name = "Second"`
        },
        expectedOutput: `First
Second`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Empty and Minimal Modules', () => {
    it('should handle import from empty module', async () => {
      const result = await testImport(`
/import "./empty.mld" as empty
/exe @hasVars(@obj) = js { return Object.keys(obj).length; }
/var @count = @hasVars(@empty)
/show @count`, {
        files: {
          'empty.mld': '>> This module has no exports'
        },
        expectedOutput: '0'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it('should handle module with only comments', async () => {
      const result = await testImport(`
/import "./comments.mld"
/show "Import succeeded"`, {
        files: {
          'comments.mld': `
>> This is a comment
<< Another comment
>> More comments`
        },
        expectedOutput: 'Import succeeded'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  
  describe('File System Edge Cases', () => {
    it('should handle files with spaces in names', async () => {
      const result = await testImport(`
/import { message } from "./my module.mld"
/show @message`, {
        files: {
          'my module.mld': '/var @message = "From file with spaces"'
        },
        expectedOutput: 'From file with spaces'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it('should handle deeply nested paths', async () => {
      const result = await testImport(`
/import { deep } from "./a/b/c/d/e/module.mld"
/show @deep`, {
        files: {
          'a/b/c/d/e/module.mld': '/var @deep = "From deep path"'
        },
        expectedOutput: 'From deep path'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Type Preservation', () => {
    it.skip('should preserve primitive types through imports', async () => {
      // TODO: Fix primitive type preservation (https://github.com/mlld-lang/modules/issues/5)
      const result = await testImport(`
/import { str, num, bool, nil, arr, obj } from "./types.mld"
/exe @showType(val) = js { return typeof val; }
/show @showType(@str)
/show @showType(@num)
/show @showType(@bool)
/show @showType(@nil)
/show @showType(@arr)
/show @showType(@obj)`, {
        files: {
          'types.mld': `
/var @str = "string"
/var @num = 42
/var @bool = true
/var @nil = null
/var @arr = [1, 2, 3]
/var @obj = { "key": "value" }`
        },
        expectedOutput: `string
number
boolean
object
object
object`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Import with Frontmatter', () => {
    it('should handle modules with frontmatter', async () => {
      const result = await testImport(`
/import { content } from "./with-fm.mld"
/show @content`, {
        files: {
          'with-fm.mld': `---
name: Test Module
version: 1.0.0
---

/var @content = "Module with frontmatter"`
        },
        expectedOutput: 'Module with frontmatter'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
});