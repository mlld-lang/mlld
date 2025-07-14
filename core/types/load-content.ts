/**
 * Types for content loading with metadata support
 */

/**
 * Result of loading content with rich metadata
 */
export interface LoadContentResult {
  // Always available properties
  content: string;              // File contents (or section if extracted)
  filename: string;             // "README.md"
  relative: string;             // "./docs/README.md"
  absolute: string;             // "/Users/adam/project/docs/README.md"
  
  // Lazy-evaluated properties (implemented as getters)
  tokest: number;               // Estimated tokens (KB-based)
  tokens: number;               // Exact tokens (tiktoken)
  fm: any | undefined;          // Frontmatter (markdown only)
  json: any | undefined;        // Parsed JSON (JSON files only)
}

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
  private _tokest?: number;
  private _tokens?: number;
  private _fm?: any;
  private _fmParsed = false;
  private _json?: any;
  private _jsonParsed = false;
  private _rawContent?: string; // For frontmatter parsing when content is a section
  
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
  
  /**
   * Estimated tokens based on file size and type
   */
  get tokest(): number {
    if (this._tokest === undefined) {
      const kb = this.content.length / 1024;
      
      // Token estimation rates by file type
      if (this._extension) {
        if (['md', 'txt', 'markdown', 'rst'].includes(this._extension)) {
          this._tokest = Math.round(kb * 750); // Text files: 750 tokens/KB
        } else if (['js', 'ts', 'py', 'java', 'cpp', 'c', 'go', 'rs'].includes(this._extension)) {
          this._tokest = Math.round(kb * 500); // Code files: 500 tokens/KB
        } else if (['json', 'xml', 'yaml', 'yml', 'toml'].includes(this._extension)) {
          this._tokest = Math.round(kb * 400); // Data files: 400 tokens/KB
        } else {
          this._tokest = Math.round(kb * 600); // Default: 600 tokens/KB
        }
      } else {
        this._tokest = Math.round(kb * 600); // No extension: default rate
      }
    }
    return this._tokest;
  }
  
  /**
   * Exact token count using tiktoken
   */
  get tokens(): number {
    if (this._tokens === undefined) {
      // Lazy import tiktoken to avoid loading it unnecessarily
      this._tokens = this._calculateExactTokens();
    }
    return this._tokens;
  }
  
  /**
   * Parsed frontmatter (markdown files only)
   */
  get fm(): any | undefined {
    if (!this._fmParsed) {
      this._fmParsed = true;
      
      // Only parse frontmatter for markdown files
      if (this._extension && ['md', 'markdown'].includes(this._extension)) {
        this._fm = this._parseFrontmatter();
      }
    }
    return this._fm;
  }
  
  /**
   * Parsed JSON (JSON files only)
   */
  get json(): any | undefined {
    if (!this._jsonParsed) {
      this._jsonParsed = true;
      
      // Only parse JSON for JSON files
      if (this._extension === 'json') {
        try {
          this._json = JSON.parse(this.content);
        } catch {
          // Invalid JSON returns undefined
          this._json = undefined;
        }
      }
    }
    return this._json;
  }
  
  /**
   * Calculate exact tokens using tiktoken
   */
  private _calculateExactTokens(): number {
    try {
      // Dynamic import to avoid loading tiktoken until needed
      const { encoding_for_model } = require('tiktoken');
      const encoding = encoding_for_model('gpt-4');
      const tokens = encoding.encode(this.content);
      encoding.free();
      return tokens.length;
    } catch {
      // If tiktoken fails, fall back to estimation
      return this.tokest;
    }
  }
  
  /**
   * Parse frontmatter from markdown content
   */
  private _parseFrontmatter(): any | undefined {
    // Use raw content if available (for section extraction), otherwise use content
    const contentToParse = this._rawContent || this.content;
    
    // Check if content starts with frontmatter
    if (!contentToParse.startsWith('---\n')) {
      return undefined;
    }
    
    // Find the closing frontmatter delimiter
    const endIndex = contentToParse.indexOf('\n---\n', 4);
    if (endIndex === -1) {
      return undefined;
    }
    
    // Extract frontmatter content
    const frontmatterContent = contentToParse.substring(4, endIndex);
    
    try {
      // Try to parse as YAML
      const yaml = require('yaml');
      return yaml.parse(frontmatterContent);
    } catch {
      // If YAML parsing fails, return undefined
      return undefined;
    }
  }
}

/**
 * Type guard to check if a value is a LoadContentResult
 */
export function isLoadContentResult(value: unknown): value is LoadContentResult {
  return value !== null &&
    typeof value === 'object' &&
    'content' in value &&
    'filename' in value &&
    'relative' in value &&
    'absolute' in value;
}

/**
 * Array of LoadContentResult with smart toString behavior
 */
export class LoadContentResultArrayImpl extends Array<LoadContentResult> {
  /**
   * Override toString to concatenate content
   */
  toString(): string {
    return this.map(item => item.content).join('\n\n');
  }
  
  /**
   * Access .content property to get concatenated content
   */
  get content(): string {
    return this.toString();
  }
}

/**
 * Type for LoadContentResultArray
 */
export type LoadContentResultArray = LoadContentResultArrayImpl;

/**
 * Create a LoadContentResultArray from regular array
 */
export function createLoadContentResultArray(items: LoadContentResult[]): LoadContentResultArray {
  const array = new LoadContentResultArrayImpl();
  array.push(...items);
  return array;
}

/**
 * Type guard to check if a value is an array of LoadContentResult
 */
export function isLoadContentResultArray(value: unknown): value is LoadContentResultArray {
  return value instanceof LoadContentResultArrayImpl || 
    (Array.isArray(value) && value.every(isLoadContentResult));
}

/**
 * Extended metadata for URL content
 */
export interface LoadContentResultURL extends LoadContentResult {
  // URL-specific properties
  url: string;                  // Full URL
  domain: string;               // Just the domain (e.g., "example.com")
  title?: string;               // Page title (from readability or <title>)
  description?: string;         // Meta description or excerpt
  html?: string;                // Raw HTML content (lazy)
  text?: string;                // Plain text extraction (lazy)
  md?: string;                  // Markdown conversion (lazy, same as content for HTML)
  headers?: Record<string, string>;  // Response headers
  status?: number;              // HTTP status code
  contentType?: string;         // Content-Type header
}

/**
 * URL content result implementation with lazy loading
 */
export class LoadContentResultURLImpl extends LoadContentResultImpl implements LoadContentResultURL {
  url: string;
  domain: string;
  title?: string;
  description?: string;
  status?: number;
  contentType?: string;
  
  private _html?: string;
  private _text?: string;
  private _md?: string;
  private _mdParsed = false;
  private _headers?: Record<string, string>;
  private _rawContent: string;
  private _isHtml: boolean;
  
  constructor(data: {
    content: string;          // The processed content (markdown for HTML, raw for others)
    rawContent: string;       // The raw response content
    url: string;
    headers?: Record<string, string>;
    status?: number;
  }) {
    // Extract filename from URL
    const urlObj = new URL(data.url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'index.html';
    
    super({
      content: data.content,
      filename: filename,
      relative: data.url,     // For URLs, relative is the URL itself
      absolute: data.url      // For URLs, absolute is the URL itself
    });
    
    this.url = data.url;
    this.domain = urlObj.hostname;
    this._rawContent = data.rawContent;
    this._headers = data.headers;
    this.status = data.status;
    this.contentType = data.headers?.['content-type'] || data.headers?.['Content-Type'];
    this._isHtml = this.contentType?.includes('text/html') || false;
    
    // For HTML content, extract title and description
    if (this._isHtml) {
      this._extractHtmlMetadata();
    }
  }
  
  /**
   * Raw HTML content (only for HTML pages)
   */
  get html(): string | undefined {
    if (!this._isHtml) return undefined;
    return this._rawContent;
  }
  
  /**
   * Plain text extraction
   */
  get text(): string | undefined {
    if (this._text === undefined) {
      if (this._isHtml) {
        // Strip HTML tags for plain text
        this._text = this._stripHtml(this._rawContent);
      } else {
        // For non-HTML, text is same as raw content
        this._text = this._rawContent;
      }
    }
    return this._text;
  }
  
  /**
   * Markdown version (same as content for HTML, undefined for others)
   */
  get md(): string | undefined {
    if (!this._mdParsed) {
      this._mdParsed = true;
      if (this._isHtml) {
        // For HTML, markdown is the processed content
        this._md = this.content;
      }
      // For non-HTML, md is undefined
    }
    return this._md;
  }
  
  /**
   * Response headers
   */
  get headers(): Record<string, string> | undefined {
    return this._headers;
  }
  
  /**
   * Extract title and description from HTML
   */
  private _extractHtmlMetadata(): void {
    // Extract title
    const titleMatch = this._rawContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      this.title = titleMatch[1].trim();
    }
    
    // Extract meta description
    const descMatch = this._rawContent.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    if (descMatch) {
      this.description = descMatch[1].trim();
    } else {
      // Try og:description
      const ogDescMatch = this._rawContent.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
      if (ogDescMatch) {
        this.description = ogDescMatch[1].trim();
      }
    }
  }
  
  /**
   * Strip HTML tags for plain text
   */
  private _stripHtml(html: string): string {
    // Remove script and style elements
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#039;/g, "'");
    
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }
}

/**
 * Type guard for URL content results
 */
export function isLoadContentResultURL(value: unknown): value is LoadContentResultURL {
  return isLoadContentResult(value) && 
    'url' in value && 
    'domain' in value;
}

/**
 * Extended metadata for HTML file content
 */
export interface LoadContentResultHTML extends LoadContentResult {
  // HTML-specific properties
  title?: string;               // Page title from <title> tag
  description?: string;         // Meta description
  html: string;                 // Raw HTML content
  text?: string;                // Plain text extraction (lazy)
}

/**
 * HTML file content result implementation
 */
export class LoadContentResultHTMLImpl extends LoadContentResultImpl implements LoadContentResultHTML {
  title?: string;
  description?: string;
  
  private _html: string;
  private _text?: string;
  
  constructor(data: {
    content: string;          // The processed content (markdown)
    rawHtml: string;         // The raw HTML content
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
    
    this._html = data.rawHtml;
    this.title = data.title;
    this.description = data.description;
  }
  
  /**
   * Raw HTML content
   */
  get html(): string {
    return this._html;
  }
  
  /**
   * Plain text extraction
   */
  get text(): string | undefined {
    if (this._text === undefined) {
      // Strip HTML tags for plain text
      this._text = this._stripHtml(this._html);
    }
    return this._text;
  }
  
  /**
   * Strip HTML tags for plain text
   */
  private _stripHtml(html: string): string {
    // Remove script and style elements
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#039;/g, "'");
    
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }
}

/**
 * Type guard for HTML content results
 */
export function isLoadContentResultHTML(value: unknown): value is LoadContentResultHTML {
  return isLoadContentResult(value) && 
    'html' in value &&
    !('url' in value); // Distinguish from URL results
}