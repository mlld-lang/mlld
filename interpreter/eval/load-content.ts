/**
 * Implementation classes for content loading with metadata support
 *
 * Note: Legacy array types (LoadContentResultArray, RenamedContentArray) have been
 * removed as of Phase 5 cleanup. All values are now wrapped as StructuredValue.
 */

import { JSDOM } from 'jsdom';
import yaml from 'js-yaml';
import type {
  LoadContentResult,
  LoadContentResultURL,
  LoadContentResultHTML
} from '@core/types/load-content';
import {
  buildTokenMetrics,
  type TokenEstimationOptions,
  type TokenMetrics
} from '@core/utils/token-metrics';

/**
 * Internal class implementation of LoadContentResult
 * Uses lazy getters for expensive operations
 */
export class LoadContentResultImpl implements LoadContentResult {
  content: string;
  filename: string;
  relative: string;
  absolute: string;
  
  private _extension: string | null;
  private _metrics?: TokenMetrics;
  private _fm?: any;
  private _fmParsed = false;
  private _json?: any;
  private _jsonParsed = false;
  _rawContent?: string; // For frontmatter parsing when content is a section
  
  constructor(data: {
    content: string;
    filename: string;
    relative: string;
    absolute: string;
    _rawContent?: string; // Optional: full file content for frontmatter when content is just a section
  }) {
    this.content = data.content;
    this.filename = data.filename;
    this.relative = data.relative;
    this.absolute = data.absolute;
    this._rawContent = data._rawContent;
    
    // Extract extension for token estimation
    const match = this.filename.match(/\.([a-zA-Z0-9]+)$/);
    this._extension = match ? match[1].toLowerCase() : null;
  }
  
  get path(): string {
    return this.absolute;
  }
  
  get ext(): string {
    return this._extension || '';
  }
  
  get fm(): any {
    if (!this._fmParsed) {
      this._fmParsed = true;
      try {
        // Use _rawContent if available (when content is a section), otherwise use content
        const contentToParse = this._rawContent || this.content;
        // Simple frontmatter extraction
        const fmMatch = contentToParse.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
        if (fmMatch) {
          // Parse YAML frontmatter
          this._fm = yaml.load(fmMatch[1]);
        }
      } catch (error) {
        // Silently fail - no frontmatter
      }
    }
    return this._fm;
  }
  
  private ensureMetrics(): TokenMetrics {
    if (!this._metrics) {
      const options: TokenEstimationOptions = {
        extension: this._extension,
        format: undefined
      };
      this._metrics = buildTokenMetrics(this.content, options);
    }
    return this._metrics;
  }

  get tokest(): number {
    return this.ensureMetrics().tokest;
  }
  
  get tokens(): number {
    const metrics = this.ensureMetrics();
    return metrics.tokens ?? metrics.tokest;
  }
  
  get json(): any {
    if (!this._jsonParsed) {
      this._jsonParsed = true;
      try {
        this._json = JSON.parse(this.content);
      } catch {
        // Not valid JSON
        this._json = undefined;
      }
    }
    return this._json;
  }
  
  // String conversion returns content
  toString(): string {
    return this.content;
  }
  
  // StructuredValue-like surface
  get type(): 'text' {
    return 'text';
  }
  
  get text(): string {
    return this.content;
  }
  
  get data(): string {
    return this.content;
  }
  
  get absoluteDir(): string {
    const lastSlash = this.absolute.lastIndexOf('/');
    return lastSlash === 0 ? '/' : lastSlash > 0 ? this.absolute.substring(0, lastSlash) : this.absolute;
  }

  get relativeDir(): string {
    const lastSlash = this.relative.lastIndexOf('/');
    return lastSlash === 0 ? '/' : lastSlash > 0 ? this.relative.substring(0, lastSlash) : '.';
  }

  get dirname(): string {
    const absDir = this.absoluteDir;
    if (absDir === '/') return '/';
    const lastSlash = absDir.lastIndexOf('/');
    return lastSlash >= 0 ? absDir.substring(lastSlash + 1) : absDir;
  }

  get mx() {
    const self = this;
    return {
      filename: this.filename,
      relative: this.relative,
      absolute: this.absolute,
      path: this.path,
      dirname: this.dirname,
      relativeDir: this.relativeDir,
      absoluteDir: this.absoluteDir,
      get tokest() { return self.tokest; },
      get tokens() { return self.tokens; },
      get fm() { return self.fm; },
      get json() { return self.json; },
      type: this.type
    };
  }
  
  valueOf(): string {
    return this.content;
  }
  
  [Symbol.toPrimitive](): string {
    return this.content;
  }
  
  // JSON representation includes metadata
  toJSON(): any {
    return {
      content: this.content,
      filename: this.filename,
      relative: this.relative,
      absolute: this.absolute,
      path: this.path,
      ext: this.ext,
      fm: this.fm,
      tokest: this.tokest
    };
  }
}

/**
 * URL-specific LoadContentResult with additional metadata
 */
export class LoadContentResultURLImpl extends LoadContentResultImpl implements LoadContentResultURL {
  url: string;
  domain: string;
  title?: string;
  description?: string;
  status?: number;
  headers?: Record<string, string>;
  rawContent: string;
  
  constructor(data: {
    content: string;        // The processed/converted content (markdown for HTML)
    rawContent: string;     // The raw response content
    url: string;
    headers: Record<string, string>;
    status: number;
  }) {
    // Extract filename from URL
    const urlPath = new URL(data.url).pathname;
    const filename = urlPath.split('/').pop() || 'index.html';
    
    super({
      content: data.content,
      filename: filename,
      relative: data.url,  // URLs use full URL as relative
      absolute: data.url
    });
    
    this.url = data.url;
    this.domain = new URL(data.url).hostname;
    this.headers = data.headers;
    this.status = data.status;
    this.rawContent = data.rawContent;
    
    // Extract metadata from HTML if it's HTML content
    const contentType = data.headers['content-type'] || data.headers['Content-Type'] || '';
    if (contentType.includes('text/html')) {
      this._extractHtmlMetadata();
    }
  }
  
  // Getters for common content type properties
  get contentType(): string | undefined {
    return this.headers?.['content-type'] || this.headers?.['Content-Type'];
  }
  
  get html(): string | undefined {
    const contentType = this.contentType;
    return contentType?.includes('text/html') ? this.rawContent : undefined;
  }
  
  get text(): string | undefined {
    // For HTML, extract plain text; for others, return raw content
    const contentType = this.contentType;
    if (contentType?.includes('text/html')) {
      try {
        const dom = new JSDOM(this.rawContent);
        return dom.window.document.body?.textContent?.trim() || '';
      } catch {
        return this.rawContent;
      }
    }
    return this.rawContent;
  }
  
  get md(): string | undefined {
    // Return markdown content (the processed content for HTML)
    const contentType = this.contentType;
    return contentType?.includes('text/html') ? this.content : undefined;
  }
  
  get type(): 'text' | 'object' | 'array' | 'html' {
    const contentType = this.contentType;
    if (contentType?.includes('application/json')) {
      const parsed = this.json;
      if (Array.isArray(parsed)) return 'array';
      if (parsed && typeof parsed === 'object') return 'object';
    }
    if (contentType?.includes('text/html')) {
      return 'html';
    }
    return 'text';
  }
  
  get mx() {
    const base = super.mx;
    return {
      ...base,
      url: this.url,
      domain: this.domain,
      title: this.title,
      description: this.description,
      status: this.status,
      headers: this.headers,
      html: this.html
    };
  }
  
  // JSON representation includes URL metadata
  toJSON(): any {
    return {
      ...super.toJSON(),
      url: this.url,
      domain: this.domain,
      title: this.title,
      description: this.description,
      status: this.status,
      headers: this.headers
    };
  }
  
  private _extractHtmlMetadata(): void {
    try {
      const dom = new JSDOM(this.rawContent);
      const doc = dom.window.document;
      
      // Extract title from various sources
      const titleElement = doc.querySelector('title');
      if (titleElement) {
        this.title = titleElement.textContent?.trim() || undefined;
      }
      
      // If no title tag, try og:title or twitter:title
      if (!this.title) {
        const ogTitle = doc.querySelector('meta[property="og:title"]');
        const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
        this.title = ogTitle?.getAttribute('content')?.trim() ||
                    twitterTitle?.getAttribute('content')?.trim() ||
                    undefined;
      }
      
      // Extract description from various sources
      const descElement = doc.querySelector('meta[name="description"]') ||
                         doc.querySelector('meta[property="og:description"]') ||
                         doc.querySelector('meta[property="twitter:description"]') ||
                         doc.querySelector('meta[name="twitter:description"]');
      
      if (descElement) {
        this.description = descElement.getAttribute('content')?.trim() || undefined;
      }
    } catch (error) {
      console.warn('DOM parsing failed, falling back to regex:', error);
      this._extractHtmlMetadataFallback();
    }
  }
  
  private _extractHtmlMetadataFallback(): void {
    // Fallback regex extraction
    const titleMatch = this.rawContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      this.title = titleMatch[1].trim();
    }
    
    const descMatch = this.rawContent.match(/<meta\s+(?:name|property)=["'](?:description|og:description|twitter:description)["']\s+content=["']([^"']+)["']/i) ||
                     this.rawContent.match(/<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["'](?:description|og:description|twitter:description)["']/i);
    if (descMatch) {
      this.description = descMatch[1].trim();
    }
  }
}

/**
 * HTML-specific LoadContentResult for local HTML files
 */
export class LoadContentResultHTMLImpl extends LoadContentResultImpl implements LoadContentResultHTML {
  title?: string;
  description?: string;
  private _rawHtml: string;
  
  constructor(data: {
    content: string;      // Markdown version
    rawHtml: string;      // Original HTML
    filename: string;
    relative: string;
    absolute: string;
    title?: string;
    description?: string;
  }) {
    super({
      content: data.content,
      filename: data.filename,
      relative: data.relative,
      absolute: data.absolute
    });
    
    this._rawHtml = data.rawHtml;
    this.title = data.title;
    this.description = data.description;
  }
  
  get html(): string {
    return this._rawHtml;
  }
  
  get text(): string {
    try {
      const dom = new JSDOM(this._rawHtml);
      return dom.window.document.body?.textContent?.trim() || '';
    } catch {
      return this._rawHtml;
    }
  }
  
  get type(): 'html' {
    return 'html';
  }
  
  get mx() {
    const base = super.mx;
    return {
      ...base,
      html: this.html
    };
  }
  
  // JSON representation includes HTML metadata
  toJSON(): any {
    return {
      ...super.toJSON(),
      title: this.title,
      description: this.description,
      html: this._rawHtml
    };
  }
}

// Factory functions removed in Phase 5 of type refactor
// Use Variable-based alternatives from variable-migration.ts instead
