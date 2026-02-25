import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BUILTIN_TOOL_SCHEMAS,
  executeBuiltinTool,
  isBuiltinTool
} from './BuiltinTools';

describe('BuiltinTools', () => {
  describe('isBuiltinTool', () => {
    it('returns true for built-in tool names', () => {
      expect(isBuiltinTool('mlld_validate')).toBe(true);
      expect(isBuiltinTool('mlld_analyze')).toBe(true);
      expect(isBuiltinTool('mlld_ast')).toBe(true);
    });

    it('returns false for non-built-in tools', () => {
      expect(isBuiltinTool('some_other_tool')).toBe(false);
      expect(isBuiltinTool('validate')).toBe(false);
      expect(isBuiltinTool('')).toBe(false);
    });
  });

  describe('BUILTIN_TOOL_SCHEMAS', () => {
    it('has schemas for all three tools', () => {
      expect(BUILTIN_TOOL_SCHEMAS).toHaveLength(3);
      const names = BUILTIN_TOOL_SCHEMAS.map(s => s.name);
      expect(names).toContain('mlld_validate');
      expect(names).toContain('mlld_analyze');
      expect(names).toContain('mlld_ast');
    });

    it('schemas have valid structure', () => {
      for (const schema of BUILTIN_TOOL_SCHEMAS) {
        expect(schema.name).toBeTruthy();
        expect(schema.description).toBeTruthy();
        expect(schema.inputSchema.type).toBe('object');
        expect(schema.inputSchema.properties).toBeDefined();
        expect(schema.inputSchema.properties.file).toBeDefined();
        expect(schema.inputSchema.properties.code).toBeDefined();
      }
    });
  });

  describe('mlld_validate', () => {
    it('validates valid inline code', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        code: 'var @x = "hello"'
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();

      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.errors).toEqual([]);
    });

    it('reports errors for invalid code', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        code: 'var @x ='  // incomplete
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);

      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.errors.length).toBeGreaterThan(0);
    });

    it('uses strict mode by default for inline code', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        code: 'var @x = "test"'
      });

      expect(result).not.toBeNull();
      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
    });

    it('accepts explicit mode parameter', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        code: '/var @x = "test"',
        mode: 'markdown'
      });

      expect(result).not.toBeNull();
      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
    });

    it('validates strict-mode hook directive without slash prefix', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        code: 'hook @audit after op:exe = [ show "x" ]'
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();

      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.errors).toEqual([]);
    });

    it('validates strict-mode checkpoint directive without slash prefix', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        code: 'checkpoint "phase-1"'
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();

      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.errors).toEqual([]);
    });

    it('errors when neither file nor code provided', async () => {
      const result = await executeBuiltinTool('mlld_validate', {});

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);

      const response = JSON.parse(result!.content[0].text);
      expect(response.error).toContain('required');
    });

    it('errors when both file and code provided', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        file: 'test.mld',
        code: 'var @x = 1'
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);

      const response = JSON.parse(result!.content[0].text);
      expect(response.error).toContain('not both');
    });

    it('errors for invalid mode', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        code: 'var @x = 1',
        mode: 'invalid'
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);

      const response = JSON.parse(result!.content[0].text);
      expect(response.error).toContain('Invalid mode');
    });
  });

  describe('mlld_analyze', () => {
    it('analyzes code with executables', async () => {
      const result = await executeBuiltinTool('mlld_analyze', {
        code: `
exe @greet(name) = cmd { echo "Hello" }
export { @greet }
        `.trim()
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();

      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.executables).toHaveLength(1);
      expect(response.executables[0].name).toBe('greet');
      expect(response.executables[0].params).toEqual(['name']);
      expect(response.exports.length).toBeGreaterThan(0);
    });

    it('analyzes code with imports', async () => {
      const result = await executeBuiltinTool('mlld_analyze', {
        code: 'import { @utils } from <./utils.mld>'
      });

      expect(result).not.toBeNull();
      const response = JSON.parse(result!.content[0].text);
      expect(response.imports.length).toBeGreaterThan(0);
    });

    it('analyzes code with guards', async () => {
      const result = await executeBuiltinTool('mlld_analyze', {
        code: 'guard @check before secret = when [ * => allow ]'
      });

      expect(result).not.toBeNull();
      const response = JSON.parse(result!.content[0].text);
      expect(response.guards.length).toBeGreaterThan(0);
    });

    it('includes stats', async () => {
      const result = await executeBuiltinTool('mlld_analyze', {
        code: `
var @a = 1
var @b = 2
exe @test() = cmd { echo "test" }
        `.trim()
      });

      expect(result).not.toBeNull();
      const response = JSON.parse(result!.content[0].text);
      expect(response.stats).toBeDefined();
      expect(response.stats.directives).toBeGreaterThan(0);
    });

    it('optionally includes AST', async () => {
      const resultWithoutAst = await executeBuiltinTool('mlld_analyze', {
        code: 'var @x = 1'
      });
      const responseWithoutAst = JSON.parse(resultWithoutAst!.content[0].text);
      expect(responseWithoutAst.ast).toBeUndefined();

      const resultWithAst = await executeBuiltinTool('mlld_analyze', {
        code: 'var @x = 1',
        includeAst: true
      });
      const responseWithAst = JSON.parse(resultWithAst!.content[0].text);
      expect(responseWithAst.ast).toBeDefined();
      expect(Array.isArray(responseWithAst.ast)).toBe(true);
    });

    it('reports parse errors', async () => {
      const result = await executeBuiltinTool('mlld_analyze', {
        code: 'var @x ='
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);

      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.errors.length).toBeGreaterThan(0);
    });
  });

  describe('mlld_ast', () => {
    it('returns AST for valid code', async () => {
      const result = await executeBuiltinTool('mlld_ast', {
        code: 'var @x = "hello"'
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();

      const response = JSON.parse(result!.content[0].text);
      expect(response.success).toBe(true);
      expect(response.ast).toBeDefined();
      expect(Array.isArray(response.ast)).toBe(true);
    });

    it('returns error for invalid code', async () => {
      const result = await executeBuiltinTool('mlld_ast', {
        code: 'var @x ='
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);

      const response = JSON.parse(result!.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('AST contains directive nodes', async () => {
      const result = await executeBuiltinTool('mlld_ast', {
        code: 'var @name = "world"'
      });

      const response = JSON.parse(result!.content[0].text);
      expect(response.ast.some((node: any) => node.type === 'Directive')).toBe(true);
    });
  });

  describe('file-based operations', () => {
    let tempDir: string;
    let testFile: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(join(tmpdir(), 'mlld-builtin-test-'));
      testFile = join(tempDir, 'test.mld');
      await fs.writeFile(testFile, `
var @greeting = "Hello"
exe @sayHello(name) = cmd { echo "@greeting" }
export { @sayHello }
      `.trim());
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('validates file', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        file: testFile
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();

      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.filepath).toBe(testFile);
    });

    it('analyzes file', async () => {
      const result = await executeBuiltinTool('mlld_analyze', {
        file: testFile
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();

      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.executables).toHaveLength(1);
      expect(response.exports.length).toBeGreaterThan(0);
    });

    it('parses file AST', async () => {
      const result = await executeBuiltinTool('mlld_ast', {
        file: testFile
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();

      const response = JSON.parse(result!.content[0].text);
      expect(response.success).toBe(true);
      expect(response.filepath).toBe(testFile);
    });

    it('errors for non-existent file', async () => {
      const result = await executeBuiltinTool('mlld_validate', {
        file: '/nonexistent/path/file.mld'
      });

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);
    });

    it('infers markdown mode from .mld.md extension', async () => {
      const mdFile = join(tempDir, 'test.mld.md');
      await fs.writeFile(mdFile, '/var @x = "markdown mode"');

      const result = await executeBuiltinTool('mlld_validate', {
        file: mdFile
      });

      expect(result).not.toBeNull();
      const response = JSON.parse(result!.content[0].text);
      expect(response.valid).toBe(true);
    });
  });

  describe('executeBuiltinTool routing', () => {
    it('returns null for unknown tools', async () => {
      const result = await executeBuiltinTool('unknown_tool', {});
      expect(result).toBeNull();
    });
  });
});
