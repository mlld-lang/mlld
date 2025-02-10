import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMeld } from '../index';
import { MeldLLMXMLError } from '../../converter/llmxml-utils';
import { loadFixture, Fixtures } from '../../__fixtures__/utils';
import { normalizeContent, XMLPatterns } from '../../__tests__/utils';
import { addMockFile, clearMocks } from '../../__mocks__/fs';

vi.mock('fs');

describe('SDK Format Conversion', () => {
  beforeEach(() => {
    clearMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('core functionality', () => {
    it('converts to llm format by default', async () => {
      const markdown = loadFixture(Fixtures.Markdown.Basic);
      const expectedXml = loadFixture(Fixtures.XML.Expected.Basic);
      addMockFile('test.meld', markdown);

      const output = await runMeld('test.meld');
      expect(normalizeContent(output)).toBe(normalizeContent(expectedXml));
    });

    it('converts to markdown format when specified', async () => {
      const markdown = loadFixture(Fixtures.Markdown.Basic);
      addMockFile('test.meld', markdown);

      const output = await runMeld('test.meld', { format: 'md' });
      expect(normalizeContent(output)).toBe(normalizeContent(markdown));
    });

    it('handles complex documents', async () => {
      const markdown = loadFixture(Fixtures.Markdown.Complex);
      const expectedXml = loadFixture(Fixtures.XML.Expected.Complex);
      addMockFile('test.meld', markdown);

      const output = await runMeld('test.meld');
      expect(normalizeContent(output)).toBe(normalizeContent(expectedXml));
    });

    it('preserves unicode and special characters', async () => {
      const markdown = loadFixture(Fixtures.Markdown.Special);
      const expectedXml = loadFixture(Fixtures.XML.Expected.Special);
      addMockFile('test.meld', markdown);

      const output = await runMeld('test.meld');
      expect(normalizeContent(output)).toBe(normalizeContent(expectedXml));
    });
  });

  describe('error handling', () => {
    describe('file system errors', () => {
      it('handles read errors', async () => {
        const error = new Error('Permission denied');
        error.name = 'FileSystemError';
        (error as any).code = 'EACCES';
        addMockFile('test.meld', 'test content');
        
        await expect(runMeld('test.meld'))
          .rejects.toThrow('Permission denied');
      });
    });

    describe('conversion errors', () => {
      it('handles malformed markdown', async () => {
        const markdown = '# Invalid\n```meld\nInvalid directive\n```';
        addMockFile('test.meld', markdown);

        await expect(runMeld('test.meld'))
          .rejects.toThrow(MeldLLMXMLError);
      });

      it('propagates llmxml errors with details', async () => {
        const markdown = '# Test\n```meld\nInvalid directive\n```';
        addMockFile('test.meld', markdown);

        try {
          await runMeld('test.meld');
          fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(MeldLLMXMLError);
          if (error instanceof MeldLLMXMLError) {
            expect(error.code).toBeDefined();
            expect(error.message).toContain('Invalid directive');
          }
        }
      });
    });
  });

  describe('integration', () => {
    describe('document processing', () => {
      it('processes real documentation', async () => {
        const markdown = loadFixture(Fixtures.Markdown.Documentation);
        const expectedXml = loadFixture(Fixtures.XML.Expected.Documentation);
        addMockFile('test.meld', markdown);

        const output = await runMeld('test.meld');
        expect(normalizeContent(output)).toBe(normalizeContent(expectedXml));
      });

      it('preserves document structure', async () => {
        const markdown = loadFixture(Fixtures.Markdown.Structure);
        const expectedXml = loadFixture(Fixtures.XML.Expected.Structure);
        addMockFile('test.meld', markdown);

        const output = await runMeld('test.meld');
        expect(normalizeContent(output)).toBe(normalizeContent(expectedXml));
      });
    });

    describe('real-world examples', () => {
      it('processes architecture documentation', async () => {
        const markdown = loadFixture(Fixtures.Markdown.Architecture);
        const expectedXml = loadFixture(Fixtures.XML.Expected.Architecture);
        addMockFile('test.meld', markdown);

        const output = await runMeld('test.meld');
        expect(normalizeContent(output)).toBe(normalizeContent(expectedXml));
      });

      it('handles mixed content types', async () => {
        const markdown = loadFixture(Fixtures.Markdown.Mixed);
        const expectedXml = loadFixture(Fixtures.XML.Expected.Mixed);
        addMockFile('test.meld', markdown);

        const output = await runMeld('test.meld');
        expect(normalizeContent(output)).toBe(normalizeContent(expectedXml));
      });
    });
  });
}); 