import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Content Loader HTML to Markdown Conversion', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    env = new Environment(fileSystem, pathService, process.cwd());
    
    // Mock fetchURLWithMetadata
    env.fetchURLWithMetadata = vi.fn();
  });

  describe('HTML to Markdown conversion', () => {
    it('should convert HTML article to Markdown using Readability', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Article</title>
        </head>
        <body>
          <nav>Navigation menu</nav>
          <div class="sidebar">Ads here</div>
          <article>
            <h1>Main Article Title</h1>
            <p>This is the main content of the article.</p>
            <p>It has <strong>bold</strong> and <em>italic</em> text.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
            <p>And a <a href="https://example.com">link</a>.</p>
          </article>
          <footer>Footer content</footer>
        </body>
        </html>
      `;
      
      const mockResponse = {
        content: mockHtml,
        headers: {
          'content-type': 'text/html; charset=utf-8'
        },
        status: 200
      };
      
      (env.fetchURLWithMetadata as any).mockResolvedValue(mockResponse);
      
      const node = {
        type: 'load-content',
        source: {
          type: 'url',
          raw: 'https://example.com/article'
        }
      };

      const result = await processContentLoader(node, env);
      
      // Check that it's a LoadContentResultURL
      expect(result).toHaveProperty('url', 'https://example.com/article');
      expect(result).toHaveProperty('domain', 'example.com');
      
      // Check that content is markdown
      const content = result.content;
      expect(content).toContain('# Main Article Title');
      expect(content).toContain('This is the main content of the article.');
      expect(content).toContain('**bold**');
      expect(content).toContain('*italic*');
      expect(content).toContain('-   Item 1');
      expect(content).toContain('-   Item 2');
      expect(content).toContain('[link](https://example.com/)');
      
      // Should not contain navigation or footer
      expect(content).not.toContain('Navigation menu');
      expect(content).not.toContain('Footer content');
      expect(content).not.toContain('Ads here');
    });

    it('should fall back to full HTML conversion when Readability cannot extract article', async () => {
      const mockHtml = `
        <div>
          <h2>Simple Page</h2>
          <p>No proper article structure here.</p>
        </div>
      `;
      
      const mockResponse = {
        content: mockHtml,
        headers: {
          'content-type': 'text/html'
        },
        status: 200
      };
      
      (env.fetchURLWithMetadata as any).mockResolvedValue(mockResponse);
      
      const node = {
        type: 'load-content',
        source: {
          type: 'url',
          raw: 'https://example.com/simple'
        }
      };

      const result = await processContentLoader(node, env);
      
      // Should still convert to markdown
      const content = result.content;
      expect(content).toContain('## Simple Page');
      expect(content).toContain('No proper article structure here.');
    });

    it('should not convert non-HTML content', async () => {
      const mockJson = '{"test": "data"}';
      
      const mockResponse = {
        content: mockJson,
        headers: {
          'content-type': 'application/json'
        },
        status: 200
      };
      
      (env.fetchURLWithMetadata as any).mockResolvedValue(mockResponse);
      
      const node = {
        type: 'load-content',
        source: {
          type: 'url',
          raw: 'https://api.example.com/data.json'
        }
      };

      const result = await processContentLoader(node, env);
      
      // Content should be unchanged JSON
      expect(result.content).toBe(mockJson);
    });
  });
});