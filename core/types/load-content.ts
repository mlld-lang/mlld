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
  
  constructor(data: {
    content: string;
    filename: string;
    relative: string;
    absolute: string;
  }) {
    this.content = data.content;
    this.filename = data.filename;
    this.relative = data.relative;
    this.absolute = data.absolute;
    
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
    // Check if content starts with frontmatter
    if (!this.content.startsWith('---\n')) {
      return undefined;
    }
    
    // Find the closing frontmatter delimiter
    const endIndex = this.content.indexOf('\n---\n', 4);
    if (endIndex === -1) {
      return undefined;
    }
    
    // Extract frontmatter content
    const frontmatterContent = this.content.substring(4, endIndex);
    
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
 * Type guard to check if a value is an array of LoadContentResult
 */
export function isLoadContentResultArray(value: unknown): value is LoadContentResult[] {
  return Array.isArray(value) && value.every(isLoadContentResult);
}