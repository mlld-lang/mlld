import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseMeld, interpretMeld, runMeld, InterpreterState, MeldParseError } from '../../src/sdk/index.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SDK Integration Tests', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), 'meld-test-'));
    testFilePath = join(tempDir, 'test.meld');
  });

  afterEach(async () => {
    // Clean up temporary files
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Format Conversion', () => {
    it('should convert to llm format by default', async () => {
      // Create a test file with markdown content
      const content = `# Test Heading
Some paragraph text.

\`\`\`typescript
const x = 1;
\`\`\``;
      await fs.writeFile(testFilePath, content);

      const { output } = await runMeld(testFilePath);
      
      // Verify LLM structure
      expect(output).toMatch(/<content>/);
      expect(output).toMatch(/<heading level="1">Test Heading<\/heading>/);
      expect(output).toMatch(/<paragraph>Some paragraph text\.<\/paragraph>/);
      expect(output).toMatch(/<code language="typescript">/);
    });

    it('should preserve markdown when format is md', async () => {
      const content = `# Test Heading
Some paragraph text.

\`\`\`typescript
const x = 1;
\`\`\``;
      await fs.writeFile(testFilePath, content);

      const { output } = await runMeld(testFilePath, { format: 'md' });
      
      // Verify markdown structure is preserved
      expect(output).toMatch(/^# Test Heading/);
      expect(output).toMatch(/Some paragraph text\./);
      expect(output).toMatch(/\`\`\`typescript/);
      expect(output).toMatch(/const x = 1;/);
    });

    it('should handle complex meld content with directives', async () => {
      const content = `@text greeting = "Hello"
@text name = "World"

# {greeting}, {name}!

\`\`\`typescript
console.log("{greeting}, {name}!");
\`\`\``;
      await fs.writeFile(testFilePath, content);

      const { output, state } = await runMeld(testFilePath);
      
      // Verify state
      expect(state.getText('greeting')).toBe('Hello');
      expect(state.getText('name')).toBe('World');
      
      // Verify LLM output
      expect(output).toMatch(/<heading level="1">Hello, World!<\/heading>/);
      expect(output).toMatch(/<code language="typescript">/);
      expect(output).toMatch(/console\.log\("Hello, World!"\);/);
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const content = `@text greeting = "Hello"
{greeting}, World!`;
      
      // Test each step individually
      const nodes = parseMeld(content);
      expect(nodes).toHaveLength(2); // @text directive and text node
      
      const state = interpretMeld(nodes);
      expect(state.getText('greeting')).toBe('Hello');
      
      // Test the full pipeline
      await fs.writeFile(testFilePath, content);
      const { output } = await runMeld(testFilePath);
      expect(output).toMatch(/<content>.*Hello, World!.*<\/content>/s);
    });

    it('should preserve state across the pipeline', async () => {
      const content = `@text greeting = "Hello"
@text name = "World"
{greeting}, {name}!`;
      
      // Create initial state
      const initialState = new InterpreterState();
      initialState.setText('prefix', '>> ');
      
      await fs.writeFile(testFilePath, content);
      const { state } = await runMeld(testFilePath, { initialState });
      
      // Verify both initial and new state is preserved
      expect(state.getText('prefix')).toBe('>> ');
      expect(state.getText('greeting')).toBe('Hello');
      expect(state.getText('name')).toBe('World');
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      const invalidContent = '@invalid_directive';
      await fs.writeFile(testFilePath, invalidContent);
      
      await expect(runMeld(testFilePath)).rejects.toThrow(MeldParseError);
    });

    it('should handle missing files correctly', async () => {
      const nonexistentPath = join(tempDir, 'nonexistent.meld');
      await expect(runMeld(nonexistentPath)).rejects.toThrow(/ENOENT/);
    });

    it('should handle empty files', async () => {
      await fs.writeFile(testFilePath, '');
      const { output } = await runMeld(testFilePath);
      expect(output).toMatch(/<content>\s*<\/content>/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle mixed content types correctly', async () => {
      const content = `# Heading
@text var = "value"
Normal text
\`\`\`code\`\`\`
{var}`;
      await fs.writeFile(testFilePath, content);
      
      const { output } = await runMeld(testFilePath);
      expect(output).toMatch(/<heading/);
      expect(output).toMatch(/<paragraph>Normal text<\/paragraph>/);
      expect(output).toMatch(/<code>/);
      expect(output).toMatch(/value/); // Interpolated variable
    });

    it('should preserve whitespace appropriately', async () => {
      const content = `# Heading

Paragraph with
multiple lines.

  Indented text.`;
      await fs.writeFile(testFilePath, content);
      
      const { output: llmOutput } = await runMeld(testFilePath);
      expect(llmOutput).toMatch(/<paragraph>Paragraph with\s+multiple lines\.<\/paragraph>/);
      
      const { output: mdOutput } = await runMeld(testFilePath, { format: 'md' });
      expect(mdOutput).toMatch(/Paragraph with\s+multiple lines\./);
      expect(mdOutput).toMatch(/  Indented text\./);
    });
  });
}); 