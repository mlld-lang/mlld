/**
 * Type definitions for content loading with metadata support
 *
 * USAGE GUIDE:
 *
 * - Use `isLoadContentResult(value)` when:
 *   - Validating INPUT to factory functions (before wrapping)
 *   - Checking items INSIDE arrays (may still be unwrapped)
 *   - In factory/utility layers that create StructuredValue
 *
 * - Use `isStructuredValue(value)` when:
 *   - Checking values in the evaluation pipeline
 *   - Values from evaluate() or evaluateDirective()
 *   - After Phase 3 migration, most values are StructuredValue
 *
 * - Use `isFileLoadedValue(value)` when:
 *   - Need to handle BOTH old and new formats
 *   - During migration period or backward compatibility
 *   - In code that might receive either format
 *   - Defined in: interpreter/utils/load-content-structured.ts
 *
 * MIGRATION STATUS (Phase 3 complete):
 * - Array handling: Use isStructuredValue && value.type === 'array'
 * - Individual items: Use isFileLoadedValue() for dual-format support
 * - Factory code: Keeps isLoadContentResult for input validation
 * - 33 legitimate isLoadContentResult usages remain in factory/conversion layers
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
  readonly mx?: {
    filename?: string;
    relative?: string;
    absolute?: string;
    dirname?: string;
    relativeDir?: string;
    absoluteDir?: string;
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
