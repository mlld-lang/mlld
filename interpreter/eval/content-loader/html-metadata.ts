import { JSDOM } from 'jsdom';

export interface HtmlMetadata {
  title?: string;
  description?: string;
}

export function extractHtmlMetadata(rawContent: string): HtmlMetadata {
  const dom = new JSDOM(rawContent);
  const doc = dom.window.document;
  const title = doc.querySelector('title')?.textContent || '';
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

  return {
    title: title || undefined,
    description: description || undefined
  };
}
