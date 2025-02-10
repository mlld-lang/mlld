import { describe, it, expect, vi } from 'vitest';
import { toLLMXml, toMarkdown, extractSection, MeldLLMXMLError } from '../llmxml-utils';
import { loadFixture, Fixtures } from '../../__fixtures__/utils';
import { normalizeContent, XMLPatterns } from '../../__tests__/utils';

describe('llmxml utilities', () => {
  describe('core functionality', () => {
    describe('basic conversion', () => {
      it('converts basic markdown to XML', async () => {
        const markdown = loadFixture(Fixtures.Markdown.Basic);
        const result = await toLLMXml(markdown);
        
        // Verify basic structure
        expect(result).toContain('<BasicDocument title="Basic Document">');
        expect(result).toContain('<SectionOne title="Section One" hlevel="2">');
        expect(result).toContain('Some content in section one');
        expect(result).toContain('<SectionTwo title="Section Two" hlevel="2">');
        expect(result).toContain('Some content in section two');
        expect(result).toContain('<NestedSection title="Nested Section" hlevel="3">');
      });

      it('converts XML back to markdown', async () => {
        const markdown = loadFixture(Fixtures.Markdown.Basic);
        const xml = await toLLMXml(markdown);
        const result = await toMarkdown(xml);
        
        expect(normalizeContent(result))
          .toBe(normalizeContent(markdown));
      });
    });

    describe('complex documents', () => {
      it('handles complex markdown features', async () => {
        const markdown = loadFixture(Fixtures.Markdown.Complex);
        const result = await toLLMXml(markdown);

        // Verify complex features
        expect(result).toContain('<ComplexDocument title="Complex Document">');
        expect(result).toContain('title="你好，世界" hlevel="2"');
        expect(result).toContain('title="🎉 Emoji Title 🚀" hlevel="2"');
        expect(result).toContain('title="Code Blocks" hlevel="2"');
        expect(result).toContain('```typescript');
        expect(result).toContain('```python');
      });

      it('handles unicode and special characters', async () => {
        const markdown = `# Complex Document
## Section & Title
Content with < and > symbols`;
        const result = await toLLMXml(markdown);
        
        // Verify special characters in content
        expect(result).toContain('title="Section &amp; Title"');
        expect(result).toContain('Content with < and > symbols');
      });
    });

    describe('section extraction', () => {
      it('extracts exact section matches', async () => {
        const content = loadFixture(Fixtures.Markdown.Basic);
        const result = await extractSection(content, 'Section One');
        
        // Should include section header
        expect(result).toContain('## Section One');
        // Should include section content
        expect(result).toContain('Some content in section one');
        // Should not include other sections
        expect(result).not.toContain('Section Two');
      });

      it('extracts sections with fuzzy matching', async () => {
        const content = loadFixture(Fixtures.Markdown.Complex);
        const result = await extractSection(content, 'Getting Started Guide', {
          fuzzyThreshold: 0.7
        });
        
        // Should match "Getting Started (Quick Guide)"
        expect(result).toContain('## Getting Started (Quick Guide)');
        expect(result).toContain('This section has a title with parentheses');
      });

      it('includes nested sections by default', async () => {
        const content = loadFixture(Fixtures.Markdown.Basic);
        const result = await extractSection(content, 'Section Two');
        
        // Should include main section
        expect(result).toContain('## Section Two');
        expect(result).toContain('Some content in section two');
        
        // Should include nested section
        expect(result).toContain('### Nested Section');
        expect(result).toContain('This is a nested section');
        expect(result).toContain('```typescript');
      });
    });
  });

  describe('error handling', () => {
    describe('parsing errors', () => {
      it('handles malformed markdown', async () => {
        const markdown = '# Test\n```\nUnclosed code block';
        // Note: llmxml auto-closes code blocks
        const result = await toLLMXml(markdown);
        expect(result).toContain('<Test>');
        expect(result).toContain('```\nUnclosed code block\n```');
      });

      it('handles incomplete code blocks', async () => {
        const markdown = '# Test\n```typescript\nconst x = 1;\n';
        // Note: llmxml auto-closes code blocks
        const result = await toLLMXml(markdown);
        expect(result).toContain('<Test>');
        expect(result).toContain('```typescript\nconst x = 1;\n```');
      });
    });

    describe('section extraction errors', () => {
      it('handles non-existent sections', async () => {
        const content = '# Test\n## Section One\nContent';
        // Note: llmxml returns closest match instead of throwing
        const result = await extractSection(content, 'Nonexistent Section');
        expect(result).toContain('## Section One');
        expect(result).toContain('Content');
      });

      it('handles ambiguous section matches', async () => {
        const content = `# Test
## About the Project
Content
## About Development
More content`;
        // Note: llmxml returns first match instead of throwing
        const result = await extractSection(content, 'About', {
          fuzzyThreshold: 0.8
        });
        expect(result).toContain('## About the Project');
        expect(result).toContain('Content');
      });
    });

    describe('validation errors', () => {
      it('validates fuzzy threshold', async () => {
        const content = '# Test\n## Section One\nContent';
        await expect(
          extractSection(content, 'Section One', {
            fuzzyThreshold: 2.0 // Invalid threshold
          })
        ).rejects.toThrow(MeldLLMXMLError);
      });

      it('handles empty sections', async () => {
        const content = '# Test\n## Empty Section\n';
        const result = await extractSection(content, 'Empty Section');
        expect(result.trim()).toBe('## Empty Section');
      });
    });
  });

  describe('integration', () => {
    describe('document processing', () => {
      it('handles full document processing flow', async () => {
        const markdown = `# Test Document
## Section One
Content one
## Section Two
Content two`;
        
        // Convert to XML
        const xml = await toLLMXml(markdown);
        expect(xml).toContain('<TestDocument title="Test Document">');
        expect(xml).toContain('<SectionOne title="Section One" hlevel="2">');
        expect(xml).toContain('Content one');
        
        // Extract a section
        const section = await extractSection(markdown, 'Section One');
        expect(section).toContain('## Section One');
        expect(section).toContain('Content one');
        expect(section).not.toContain('Section Two');
        
        // Convert back to markdown
        const result = await toMarkdown(xml);
        expect(result).toContain('# Test Document');
        expect(result).toContain('## Section One');
        expect(result).toContain('Content one');
      });

      it('preserves document structure through conversions', async () => {
        const markdown = loadFixture(Fixtures.Markdown.Basic);
        const xml = await toLLMXml(markdown);
        const backToMarkdown = await toMarkdown(xml);
        
        expect(normalizeContent(backToMarkdown))
          .toBe(normalizeContent(markdown));
      });
    });

    describe('real-world examples', () => {
      it('processes architecture documentation', async () => {
        const markdown = loadFixture('real-world/architecture.md');
        const result = await toLLMXml(markdown);

        // Verify structure
        expect(result).toContain('<ArchitectureDocumentation title="Architecture Documentation">');
        expect(result).toContain('<SystemOverview title="System Overview" hlevel="2">');
        expect(result).toContain('<ComponentDetails title="Component Details" hlevel="2">');
        expect(result).toContain('<Frontend hlevel="3">');
        expect(result).toContain('<Backend hlevel="3">');
        expect(result).toContain('<Database hlevel="3">');
        expect(result).toContain('<Deployment hlevel="2">');
      });

      it('extracts sections from real documentation', async () => {
        const markdown = loadFixture('real-world/architecture.md');
        
        // Extract component details section
        const details = await extractSection(markdown, 'Component Details');
        expect(details).toContain('## Component Details');
        expect(details).toContain('### Frontend');
        expect(details).toContain('### Backend');
        expect(details).toContain('### Database');
        expect(details).toContain('Built with React & TypeScript');
        expect(details).toContain('Node.js with Express');
        expect(details).toContain('PostgreSQL for persistence');
      });
    });
  });
}); 