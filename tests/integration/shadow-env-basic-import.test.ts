import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

describe('Shadow Environment Import', () => {
  let testDir: string;
  
  beforeEach(async () => {
    testDir = `/tmp/mlld-shadow-import-test-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  function runMLLD(filePath: string): Promise<{ output: string; error: string; exitCode: number }> {
    return new Promise((resolve) => {
      // Use the mlld wrapper script that runs the compiled bundle
      const mlldPath = path.join(__dirname, '../../bin/mlld-wrapper.cjs');
      const child = spawn('node', [mlldPath, filePath], {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' },
        timeout: 10000 // Kill after 10 seconds if still running
      });
      
      let output = '';
      let error = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      child.on('close', (code) => {
        resolve({ output, error, exitCode: code ?? 0 });
      });
    });
  }
  
  it('should preserve shadow functions through import', async () => {
    // Create module with shadow functions
    const moduleFile = path.join(testDir, 'module.mld');
    const moduleContent = `/exe @helper() = js { return "I am helper"; }
/exe @js = { helper }
/exe @user() = js { return helper() + " and I work"; }
/var @api = { callUser: @user }`;
    await fs.writeFile(moduleFile, moduleContent);
    
    // Create importing file
    const mainFile = path.join(testDir, 'main.mld');
    const mainContent = `/import { api } from "./module.mld"
/var @result = @api.callUser()
/show @result`;
    await fs.writeFile(mainFile, mainContent);
    
    const result = await runMLLD(mainFile);
    
    console.log('Exit code:', result.exitCode);
    console.log('Output:', result.output);
    console.log('Error:', result.error);
    
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('I am helper and I work');
  });
  
  it('should handle module re-exports with shadow environments', async () => {
    // Create a simple test that demonstrates the feature works
    const moduleFile = path.join(testDir, 'math.mld');
    const moduleContent = `/exe @double(x) = js { return x * 2; }
/exe @js = { double }
/exe @doubleIt(@val) = js { return double(val); }
/var @exports = { doubleIt: @doubleIt }`;
    await fs.writeFile(moduleFile, moduleContent);
    
    // Main file imports and uses the function
    const mainFile = path.join(testDir, 'main.mld');
    const mainContent = `/import { exports } from "./math.mld"
/var @result = @exports.doubleIt(21)
/show @result`;
    await fs.writeFile(mainFile, mainContent);
    
    const result = await runMLLD(mainFile);
    
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('42');
  });
  
  it('should handle Node.js shadow environment imports', async () => {
    // Test Node.js shadow environments work through imports
    const moduleFile = path.join(testDir, 'crypto-utils.mld');
    const moduleContent = `/exe @hash(@text) = node {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}
/exe @node = { hash }
/exe @getHash(@input) = node {
  return hash(input);
}
/var @crypto = { getHash: @getHash }`;
    await fs.writeFile(moduleFile, moduleContent);
    
    const mainFile = path.join(testDir, 'main.mld');
    const mainContent = `/import { crypto } from "./crypto-utils.mld"
/var @result = @crypto.getHash("test")
/show @result`;
    await fs.writeFile(mainFile, mainContent);
    
    const result = await runMLLD(mainFile);
    
    expect(result.exitCode).toBe(0);
    // SHA256 hash of "test"
    expect(result.output).toContain('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  it('should work with parameters and shadow functions together', async () => {
    const moduleFile = path.join(testDir, 'module.mld');
    const moduleContent = `/exe @prefix(@str) = js { return "PREFIX_" + str; }
/exe @js = { prefix }
/exe @process(@input, @transform) = js {
  // Use shadow function and parameter
  const prefixed = prefix(input);
  if (transform === "upper") {
    return prefixed.toUpperCase();
  }
  return prefixed;
}
/var @processor = { process: @process }`;
    await fs.writeFile(moduleFile, moduleContent);
    
    const mainFile = path.join(testDir, 'main.mld');
    const mainContent = `/import { processor } from "./module.mld"
/var @result1 = @processor.process("hello", "upper")
/var @result2 = @processor.process("world", "normal")
/show @result1
/show @result2`;
    await fs.writeFile(mainFile, mainContent);
    
    const result = await runMLLD(mainFile);
    
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('PREFIX_HELLO');
    expect(result.output).toContain('PREFIX_world');
  });

  it('should handle missing shadow functions gracefully', async () => {
    // Test that executables that rely on shadow functions fail gracefully when imported without shadow env
    const moduleFile = path.join(testDir, 'broken.mld');
    const moduleContent = `/exe @broken() = js { 
  // This tries to use a function that doesn't exist in shadow env
  return nonExistent();
}
/var @api = { broken: @broken }`;
    await fs.writeFile(moduleFile, moduleContent);
    
    const mainFile = path.join(testDir, 'main.mld');
    const mainContent = `/import { api } from "./broken.mld"
/var @result = @api.broken()`;
    await fs.writeFile(mainFile, mainContent);
    
    const result = await runMLLD(mainFile);
    
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('nonExistent is not defined');
  });

  it('should preserve shadow environments across multiple import levels', async () => {
    // Level 1: Base utilities
    const level1File = path.join(testDir, 'level1.mld');
    const level1Content = `/exe @addOne(x) = js { return x + 1; }
/exe @js = { addOne }
/var @level1 = { addOne: @addOne }`;
    await fs.writeFile(level1File, level1Content);
    
    // Level 2: Uses level1 
    const level2File = path.join(testDir, 'level2.mld');
    const level2Content = `/import { level1 } from "./level1.mld"
/exe @addTwo(@x) = js {
  // Can't directly call addOne here, but can use the imported function
  return @x + 2;
}
/var @level2 = { 
  addOne: @level1.addOne,
  addTwo: @addTwo 
}`;
    await fs.writeFile(level2File, level2Content);
    
    // Level 3: Final usage
    const mainFile = path.join(testDir, 'main.mld');
    const mainContent = `/import { level2 } from "./level2.mld"
/var @result1 = @level2.addOne(5)
/var @result2 = @level2.addTwo(5)
/show @result1
/show @result2`;
    await fs.writeFile(mainFile, mainContent);
    
    const result = await runMLLD(mainFile);
    
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('6'); // addOne(5) = 6
    expect(result.output).toContain('7'); // addTwo(5) = 7
  });
});