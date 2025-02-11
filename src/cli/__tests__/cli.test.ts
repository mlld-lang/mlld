import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMeld } from '../cmd';
import { TestContext } from '../../interpreter/__tests__/test-utils';

describe('CLI', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();

    // Set up test files
    await context.writeFile('project/test.meld', '@text greeting = "Hello"');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('runMeld', () => {
    it('should process meld file to llm format', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const outputPath = context.fs.getPath('project/test.llm');

      await runMeld(inputPath, {
        format: 'llm',
        output: outputPath
      });

      const output = await context.readFile('project/test.llm');
      expect(output).toContain('<text name="greeting">Hello</text>');
    });

    it('should allow custom output path', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const outputPath = context.fs.getPath('project/custom.llm');

      await runMeld(inputPath, {
        format: 'llm',
        output: outputPath
      });

      const output = await context.readFile('project/custom.llm');
      expect(output).toContain('<text name="greeting">Hello</text>');
    });

    it('should process meld file to markdown format', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const outputPath = context.fs.getPath('project/test.md');

      await runMeld(inputPath, {
        format: 'md',
        output: outputPath
      });

      const output = await context.readFile('project/test.md');
      expect(output).toContain('Hello');
    });

    it('should output to stdout when no output file specified', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const consoleLog = vi.spyOn(console, 'log');

      await runMeld(inputPath, {
        format: 'md'
      });

      expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Hello'));
      consoleLog.mockRestore();
    });

    it('should handle missing input file', async () => {
      const inputPath = context.fs.getPath('project/nonexistent.meld');
      const outputPath = context.fs.getPath('project/test.md');

      await expect(runMeld(inputPath, {
        format: 'md',
        output: outputPath
      })).rejects.toThrow('ENOENT: no such file or directory');
    });

    it('should handle invalid format', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const outputPath = context.fs.getPath('project/test.md');

      await expect(runMeld(inputPath, {
        format: 'invalid' as any,
        output: outputPath
      })).rejects.toThrow('Invalid format: invalid');
    });

    it('should handle write errors', async () => {
      const inputPath = context.fs.getPath('project/test.meld');
      const outputPath = '/invalid/path/test.md'; // Invalid path that can't be written to

      await expect(runMeld(inputPath, {
        format: 'md',
        output: outputPath
      })).rejects.toThrow('ENOENT: no such file or directory');
    });
  });
}); 