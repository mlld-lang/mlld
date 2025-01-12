import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cli } from '../../src/cli/cli.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('CLI Integration Tests', () => {
  let tempDir: string;
  let testFilePath: string;
  let outputPath: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), 'meld-cli-test-'));
    testFilePath = join(tempDir, 'test.meld');
    outputPath = join(tempDir, 'output');
  });

  afterEach(async () => {
    // Clean up temporary files
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const content = `# Test Heading
Some content.`;
      await fs.writeFile(testFilePath, content);

      const args = ['node', 'meld', testFilePath, '--output', `${outputPath}.llm`];
      await cli(args);

      const output = await fs.readFile(`${outputPath}.llm`, 'utf8');
      expect(output).toMatch(/<content>/);
      expect(output).toMatch(/<heading level="1">Test Heading<\/heading>/);
      expect(output).toMatch(/<paragraph>Some content\.<\/paragraph>/);
    });

    it('should handle format aliases correctly', async () => {
      const content = '# Test';
      await fs.writeFile(testFilePath, content);

      // Test xml alias
      const xmlArgs = ['node', 'meld', testFilePath, '--format', 'xml', '--output', `${outputPath}.xml`];
      await cli(xmlArgs);
      const xmlOutput = await fs.readFile(`${outputPath}.xml`, 'utf8');
      expect(xmlOutput).toMatch(/<content>/);

      // Test markdown alias
      const mdArgs = ['node', 'meld', testFilePath, '--format', 'markdown', '--output', `${outputPath}.md`];
      await cli(mdArgs);
      const mdOutput = await fs.readFile(`${outputPath}.md`, 'utf8');
      expect(mdOutput).toMatch(/^# Test/);
    });

    it('should preserve markdown with md format', async () => {
      const content = `# Heading

1. List item 1
2. List item 2

\`\`\`typescript
const x = 1;
\`\`\``;
      await fs.writeFile(testFilePath, content);

      const args = ['node', 'meld', testFilePath, '--format', 'md', '--output', `${outputPath}.md`];
      await cli(args);

      const output = await fs.readFile(`${outputPath}.md`, 'utf8');
      expect(output).toMatch(/^# Heading/);
      expect(output).toMatch(/1\. List item 1/);
      expect(output).toMatch(/\`\`\`typescript/);
    });
  });

  describe('Command Line Options', () => {
    it('should respect --stdout option', async () => {
      const content = '# Test';
      await fs.writeFile(testFilePath, content);

      const consoleSpy = vi.spyOn(console, 'log');
      const args = ['node', 'meld', testFilePath, '--stdout'];
      await cli(args);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toMatch(/<content>/);
    });

    it('should use default output path when not specified', async () => {
      const content = '# Test';
      await fs.writeFile(join(tempDir, 'input.meld'), content);

      const args = ['node', 'meld', join(tempDir, 'input.meld')];
      await cli(args);

      const output = await fs.readFile(join(tempDir, 'input.llm'), 'utf8');
      expect(output).toMatch(/<content>/);
    });

    it('should handle multiple format options correctly', async () => {
      const content = '# Test';
      await fs.writeFile(testFilePath, content);

      // Test all format variations
      const formats = [
        ['llm', /<content>/],
        ['md', /^# Test/],
        ['xml', /<content>/],
        ['markdown', /^# Test/],
        ['llmxml', /<content>/]
      ];

      for (const [format, pattern] of formats) {
        const outputFile = `${outputPath}.${format}`;
        const args = ['node', 'meld', testFilePath, '--format', format, '--output', outputFile];
        await cli(args);

        const output = await fs.readFile(outputFile, 'utf8');
        expect(output).toMatch(pattern);
      }
    });
  });

  describe('File Handling', () => {
    it('should handle all supported file extensions', async () => {
      const content = '# Test';
      const extensions = ['.meld', '.meld.md', '.mll', '.mll.md'];

      for (const ext of extensions) {
        const inputFile = join(tempDir, `test${ext}`);
        await fs.writeFile(inputFile, content);

        const args = ['node', 'meld', inputFile, '--stdout'];
        await expect(cli(args)).resolves.not.toThrow();
      }
    });

    it('should reject unsupported file extensions', async () => {
      const content = '# Test';
      await fs.writeFile(join(tempDir, 'test.txt'), content);

      const args = ['node', 'meld', join(tempDir, 'test.txt')];
      await expect(cli(args)).rejects.toThrow(/Invalid file extension/);
    });

    it('should handle missing input files', async () => {
      const args = ['node', 'meld', join(tempDir, 'nonexistent.meld')];
      await expect(cli(args)).rejects.toThrow(/Failed to read file/);
    });
  });

  describe('Complex Content', () => {
    it('should handle meld directives with format conversion', async () => {
      const content = `@text greeting = "Hello"
@text name = "World"

# {greeting}, {name}!

\`\`\`typescript
console.log("{greeting}, {name}!");
\`\`\``;
      await fs.writeFile(testFilePath, content);

      // Test LLM output
      const llmArgs = ['node', 'meld', testFilePath, '--output', `${outputPath}.llm`];
      await cli(llmArgs);
      const llmOutput = await fs.readFile(`${outputPath}.llm`, 'utf8');
      expect(llmOutput).toMatch(/<heading level="1">Hello, World!<\/heading>/);
      expect(llmOutput).toMatch(/console\.log\("Hello, World!"\)/);

      // Test Markdown output
      const mdArgs = ['node', 'meld', testFilePath, '--format', 'md', '--output', `${outputPath}.md`];
      await cli(mdArgs);
      const mdOutput = await fs.readFile(`${outputPath}.md`, 'utf8');
      expect(mdOutput).toMatch(/^# Hello, World!/);
      expect(mdOutput).toMatch(/\`\`\`typescript/);
    });
  });
}); 