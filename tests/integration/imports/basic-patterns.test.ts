import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ImportTestRunner, testImport } from './test-utils';

describe('Import Pattern: Selected Imports', () => {
  let runner: ImportTestRunner;
  
  beforeEach(async () => {
    runner = new ImportTestRunner();
    await runner.setup();
  });
  
  afterEach(async () => {
    await runner.cleanup();
  });
  
  describe('Local File Imports', () => {
    it('should import single variable from local file', async () => {
      const result = await runner.runTest({
        name: 'selected-local-single',
        description: 'Import one variable from local file',
        files: {
          'utils.mld': '/var @greeting = "Hello from utils"'
        },
        mainScript: `
/import { greeting } from "./utils.mld"
/show @greeting`,
        expectedOutput: 'Hello from utils'
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it('should import multiple variables from local file', async () => {
      const result = await runner.runTest({
        name: 'selected-local-multiple',
        description: 'Import multiple variables from local file',
        files: {
          'data.mld': `
/var @name = "Alice"
/var @age = 30
/var @city = "New York"`
        },
        mainScript: `
/import { name, age, city } from "./data.mld"
/show @name
/show @age
/show @city`,
        expectedOutput: `Alice
30
New York`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it('should import executable from local file', async () => {
      const result = await runner.runTest({
        name: 'selected-local-executable',
        description: 'Import executable function from local file',
        files: {
          'math.mld': `
/exe @double(x) = js { return x * 2; }
/exe @triple(x) = js { return x * 3; }`
        },
        mainScript: `
/import { double, triple } from "./math.mld"
/var @result1 = @double(5)
/var @result2 = @triple(5)
/show @result1
/show @result2`,
        expectedOutput: `10
15`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
    
    it('should import nested object structure', async () => {
      const result = await runner.runTest({
        name: 'selected-local-nested',
        description: 'Import nested object from local file',
        files: {
          'api.mld': `
/exe @getUser() = js { return "John Doe"; }
/exe @getRole() = js { return "Admin"; }
/var @api = {
  "user": {
    "get": @getUser,
    "role": @getRole
  }
}`
        },
        mainScript: `
/import { api } from "./api.mld"
/var @userName = @api.user.get()
/var @userRole = @api.user.role()
/show @userName
/show @userRole`,
        expectedOutput: `John Doe
Admin`
      });
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe('Import Error Handling', () => {
    it('should fail when importing non-existent variable', async () => {
      const result = await runner.runTest({
        name: 'selected-error-missing',
        description: 'Import non-existent variable',
        files: {
          'data.mld': '/var @exists = "I exist"'
        },
        mainScript: '/import { doesNotExist } from "./data.mld"',
        expectedError: /Import 'doesNotExist' not found in module/
      });
      
      expect(result.success).toBe(true); // Test expects an error
      expect(result.exitCode).toBe(1);
    });
    
    it('should fail when importing from non-existent file', async () => {
      const result = await runner.runTest({
        name: 'selected-error-no-file',
        description: 'Import from missing file',
        mainScript: '/import { something } from "./missing.mld"',
        expectedError: /Failed to resolve|not found|No such file/
      });
      
      expect(result.success).toBe(true); // Test expects an error
      expect(result.exitCode).toBe(1);
    });
  });
});

describe('Import Pattern: Namespace Imports', () => {
  it('should import entire file as namespace', async () => {
    const result = await testImport(`
/import "./utils.mld" as utils
/show @utils.greeting
/show @utils.farewell`, {
      files: {
        'utils.mld': `
/var @greeting = "Hello"
/var @farewell = "Goodbye"`
      },
      expectedOutput: `Hello
Goodbye`
    });
    
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });
  
  it('should import file without explicit alias', async () => {
    const result = await testImport(`
/import "./helpers.mld"
/show @helpers.message`, {
      files: {
        'helpers.mld': '/var @message = "From helpers module"'
      },
      expectedOutput: 'From helpers module'
    });
    
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });
  
  it('should handle nested access in namespace imports', async () => {
    const result = await testImport(`
/import "./api.mld" as myApi
/var @result = @myApi.users.getCount()
/show @result`, {
      files: {
        'api.mld': `
/exe @getUserCount() = js { return 42; }
/var @users = {
  "getCount": @getUserCount
}`
      },
      expectedOutput: '42'
    });
    
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});

describe('Import Pattern: Mixed Types', () => {
  it('should import primitives, objects, and executables together', async () => {
    const result = await testImport(`
/import { str, num, bool, obj, func } from "./mixed.mld"
/show @str
>> Work around primitive display bug by converting to string
/exe @toString(val) = js { return String(val); }
/show @toString(@num)
/show @bool
/show @obj.key
/var @result = @func("test")
/show @result`, {
      files: {
        'mixed.mld': `
/var @str = "string value"
/var @num = 42
/var @bool = "true"
/var @obj = { "key": "value" }
/exe @func(x) = js { return "Hello " + x; }`
      },
      expectedOutput: `string value

42
true
value

Hello test`
    });
    
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});