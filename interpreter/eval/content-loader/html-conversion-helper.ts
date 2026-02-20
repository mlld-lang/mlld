import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';

export class HtmlConversionHelper {
  async convertToMarkdown(html: string, url: string): Promise<string> {
    try {
      // Create DOM from HTML
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        // If Readability can't extract an article, fall back to full HTML conversion
        const turndownService = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
          emDelimiter: '*',
          strongDelimiter: '**'
        });
        return turndownService.turndown(html);
      }

      // Convert the extracted article content to Markdown
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*',
        strongDelimiter: '**'
      });

      // Build markdown with article metadata
      let markdown = '';
      if (article.title) {
        markdown += `# ${article.title}\n\n`;
      }
      if (article.byline) {
        markdown += `*By ${article.byline}*\n\n`;
      }

      // Convert main content
      markdown += turndownService.turndown(article.content);

      return markdown;
    } catch (error) {
      // If conversion fails, return the original HTML
      console.warn('Failed to convert HTML to Markdown:', error);
      return html;
    }
  }
}
