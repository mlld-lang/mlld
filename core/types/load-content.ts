/**
 * Type definitions for content loading with metadata support
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
  // StructuredValue surface (content-first)
  readonly type?: 'text' | 'object' | 'array' | 'html' | (string & {});
  readonly text?: string;
  readonly data?: unknown;
  readonly ctx?: {
    filename?: string;
    relative?: string;
    absolute?: string;
    url?: string;
    domain?: string;
    title?: string;
    description?: string;
    status?: number;
    headers?: Record<string, unknown>;
    html?: string;
    tokest?: number;
    tokens?: number;
    fm?: unknown;
    json?: unknown;
    type?: 'text' | 'object' | 'array' | 'html' | (string & {});
  };
  
  // Lazy-evaluated properties (implemented as getters)
  tokest: number;               // Estimated tokens (KB-based)
  tokens: number;               // Exact tokens (tiktoken)
  fm: any | undefined;          // Frontmatter (markdown only)
  json: any | undefined;        // Parsed JSON (JSON files only)
}

/**
 * Type guard for LoadContentResult
 */
export function isLoadContentResult(value: unknown): value is LoadContentResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    'filename' in value &&
    'relative' in value &&
    'absolute' in value
  );
}

/**
 * Array of LoadContentResult with special toString behavior
 */
export interface LoadContentResultArray extends Array<LoadContentResult> {
  toString(): string;
}

/**
 * Type guard for LoadContentResultArray
 */
export function isLoadContentResultArray(value: unknown): value is LoadContentResultArray {
  // Check for tagged Variable first
  const variable = (value as any)?.__variable;
  if (variable && variable.type === 'array' && variable.internal?.arrayType === 'load-content-result') {
    return true;
  }
  
  // Original check for actual LoadContentResult arrays
  // Do not treat empty arrays as LoadContentResult arrays to avoid
  // misclassifying generic empty arrays (e.g., for-expression results).
  return Array.isArray(value) && value.length > 0 && value.every(isLoadContentResult);
}

/**
 * Array of renamed content strings
 */
export interface RenamedContentArray extends Array<string> {
  toString(): string;
}

/**
 * Type guard for RenamedContentArray
 */
export function isRenamedContentArray(value: unknown): value is RenamedContentArray {
  // Check for tagged Variable first
  const variable = (value as any)?.__variable;
  if (variable && variable.type === 'array' && variable.internal?.arrayType === 'renamed-content') {
    return true;
  }
  
  // Check if it's a string array with custom toString
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    // Check if it has the custom toString behavior
    const hasCustomToString = value.toString !== Array.prototype.toString;
    if (hasCustomToString && value.toString() === value.join('\n\n')) {
      return true;
    }
  }
  
  // REMOVED: The broken content-based check that was too generic
  // DO NOT use: Array.isArray(value) && value.every(item => typeof item === 'string')
  // This would match ANY string array, not just RenamedContentArray
  
  return false;
}

/**
 * Extended metadata for URL content
 */
export interface LoadContentResultURL extends LoadContentResult {
  // URL-specific properties
  url: string;                  // The source URL
  domain: string;               // Just the domain part
  title?: string;               // Page title from HTML
  description?: string;         // Meta description from HTML
  
  // Response metadata
  status?: number;              // HTTP status code
  headers?: Record<string, string>; // Response headers
  rawContent: string;           // Raw response (before conversion)
  
  // Content type properties
  contentType?: string;         // MIME type from headers
  html?: string;                // Raw HTML (same as rawContent for HTML)
  text?: string;                // Plain text extraction (HTML stripped)
  json?: any;                   // Parsed JSON (for JSON responses)
  md?: string;                  // Markdown (deprecated, use content)
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
 * Type guard for HTML content results
 */
export function isLoadContentResultHTML(value: unknown): value is LoadContentResultHTML {
  return isLoadContentResult(value) && 
    'html' in value;
}
