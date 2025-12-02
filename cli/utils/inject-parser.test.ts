import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseInjectOptions } from './inject-parser';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('parseInjectOptions', () => {
  let tempDir: string;
  let fileSystem: NodeFileSystem;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-inject-test-'));
    fileSystem = new NodeFileSystem();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('inline JSON objects', () => {
    it('should parse inline JSON object', async () => {
      const result = await parseInjectOptions(
        ['@config={"debug":true,"timeout":5000}'],
        fileSystem,
        tempDir
      );

      expect(result['@config']).toEqual({ debug: true, timeout: 5000 });
    });

    it('should parse inline JSON array', async () => {
      const result = await parseInjectOptions(
        ['@items=[1,2,3,"four"]'],
        fileSystem,
        tempDir
      );

      expect(result['@items']).toEqual([1, 2, 3, 'four']);
    });

    it('should parse nested objects', async () => {
      const result = await parseInjectOptions(
        ['@config={"nested":{"key":"value"},"array":[1,2]}'],
        fileSystem,
        tempDir
      );

      expect(result['@config']).toEqual({
        nested: { key: 'value' },
        array: [1, 2]
      });
    });

    it('should throw on invalid JSON', async () => {
      await expect(
        parseInjectOptions(['@bad={invalid json}'], fileSystem, tempDir)
      ).rejects.toThrow('Invalid JSON in --inject "@bad"');
    });
  });

  describe('file references', () => {
    it('should load JSON from file', async () => {
      const dataPath = path.join(tempDir, 'data.json');
      await fs.writeFile(dataPath, JSON.stringify({ message: 'from file', count: 42 }));

      const result = await parseInjectOptions(
        ['@data=@data.json'],
        fileSystem,
        tempDir
      );

      expect(result['@data']).toEqual({ message: 'from file', count: 42 });
    });

    it('should load mlld source from non-JSON file', async () => {
      const mldPath = path.join(tempDir, 'module.mld');
      await fs.writeFile(mldPath, '/var @x = 123\n/export { @x }');

      const result = await parseInjectOptions(
        ['@module=@module.mld'],
        fileSystem,
        tempDir
      );

      expect(result['@module']).toBe('/var @x = 123\n/export { @x }');
    });

    it('should resolve file paths relative to basePath', async () => {
      const subDir = path.join(tempDir, 'subdir');
      await fs.mkdir(subDir);
      const dataPath = path.join(subDir, 'config.json');
      await fs.writeFile(dataPath, '{"key":"val"}');

      const result = await parseInjectOptions(
        ['@cfg=@subdir/config.json'],
        fileSystem,
        tempDir
      );

      expect(result['@cfg']).toEqual({ key: 'val' });
    });

    it('should throw if file not found', async () => {
      await expect(
        parseInjectOptions(['@data=@missing.json'], fileSystem, tempDir)
      ).rejects.toThrow();
    });
  });

  describe('plain strings', () => {
    it('should handle plain string values', async () => {
      const result = await parseInjectOptions(
        ['@message=hello world'],
        fileSystem,
        tempDir
      );

      expect(result['@message']).toBe('hello world');
    });

    it('should handle quoted strings', async () => {
      const result = await parseInjectOptions(
        ['@text="quoted value"'],
        fileSystem,
        tempDir
      );

      expect(result['@text']).toBe('"quoted value"');
    });

    it('should handle mlld source strings', async () => {
      const result = await parseInjectOptions(
        ['@mod=/var @x = 1'],
        fileSystem,
        tempDir
      );

      expect(result['@mod']).toBe('/var @x = 1');
    });
  });

  describe('multiple injections', () => {
    it('should handle multiple --inject flags', async () => {
      const result = await parseInjectOptions(
        [
          '@config={"debug":true}',
          '@user={"name":"Alice"}',
          '@count=42'
        ],
        fileSystem,
        tempDir
      );

      expect(result['@config']).toEqual({ debug: true });
      expect(result['@user']).toEqual({ name: 'Alice' });
      expect(result['@count']).toBe('42');
    });

    it('should handle mix of JSON, files, and strings', async () => {
      const dataPath = path.join(tempDir, 'data.json');
      await fs.writeFile(dataPath, '{"fromFile":true}');

      const result = await parseInjectOptions(
        [
          '@inline={"inline":true}',
          '@file=@data.json',
          '@string=plain text'
        ],
        fileSystem,
        tempDir
      );

      expect(result['@inline']).toEqual({ inline: true });
      expect(result['@file']).toEqual({ fromFile: true });
      expect(result['@string']).toBe('plain text');
    });
  });

  describe('validation', () => {
    it('should reject keys without @ prefix', async () => {
      await expect(
        parseInjectOptions(['config={"x":1}'], fileSystem, tempDir)
      ).rejects.toThrow('Invalid --inject key: "config". Must start with @');
    });

    it('should reject invalid format (no =)', async () => {
      await expect(
        parseInjectOptions(['@config'], fileSystem, tempDir)
      ).rejects.toThrow('Invalid --inject format');
    });

    it('should handle = in values', async () => {
      const result = await parseInjectOptions(
        ['@eq=a=b=c'],
        fileSystem,
        tempDir
      );

      expect(result['@eq']).toBe('a=b=c');
    });
  });

  describe('edge cases', () => {
    it('should handle empty object', async () => {
      const result = await parseInjectOptions(
        ['@empty={}'],
        fileSystem,
        tempDir
      );

      expect(result['@empty']).toEqual({});
    });

    it('should handle empty array', async () => {
      const result = await parseInjectOptions(
        ['@empty=[]'],
        fileSystem,
        tempDir
      );

      expect(result['@empty']).toEqual([]);
    });

    it('should handle special characters in JSON strings', async () => {
      const result = await parseInjectOptions(
        ['@special={"msg":"Hello\\nWorld\\t!"}'],
        fileSystem,
        tempDir
      );

      expect(result['@special']).toEqual({ msg: 'Hello\nWorld\t!' });
    });

    it('should handle scoped module names', async () => {
      const result = await parseInjectOptions(
        ['@test/data={"x":1}', '@user/context={"y":2}'],
        fileSystem,
        tempDir
      );

      expect(result['@test/data']).toEqual({ x: 1 });
      expect(result['@user/context']).toEqual({ y: 2 });
    });
  });
});
