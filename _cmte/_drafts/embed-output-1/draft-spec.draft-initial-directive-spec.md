```typescript
/**
 * Represents the source for an embed directive.
 * @remarks Implemented as a discriminated union to provide clear compile-time
 * type checking and eliminate complex conditional logic for source detection.
 */
export type EmbedSource = 
  | { 
      /** Indicates the source is a file */
      type: 'file'; 
      /** Path to the file to embed */
      path: string; 
      /** Optional encoding for the file content */
      encoding?: 'utf8' | 'base64';
      // TODO: Runtime validation for file path existence
    }
  | { 
      /** Indicates the source is a variable */
      type: 'variable'; 
      /** Name of the variable to embed */
      name: string;
      // TODO: Runtime validation for variable existence
    };

/**
 * Configuration options for the embed directive.
 * @remarks Simplified from more complex proposals to focus on essential functionality
 * while maintaining flexibility.
 */
export interface EmbedOptions {
  /** Specifies how the embedded content should be formatted */
  format?: 'text' | 'markdown' | 'code' | 'json';
  
  /** Programming language for syntax highlighting when format is 'code' */
  language?: string;
  
  /** Whether to trim whitespace from the beginning and end of the content */
  trim?: boolean;
  
  /** Line numbers to highlight in the embedded content */
  highlight?: number[];
  
  /** Fallback content to use if the source cannot be embedded */
  fallback?: string;
  
  // TODO: Runtime validation for format and language compatibility
}

/**
 * Range specification for partial content embedding.
 * @remarks Implemented as a simple object rather than a discriminated union
 * to cover essential use cases while being more intuitive and requiring less code.
 */
export interface EmbedRange {
  /** Starting line number (1-based) */
  startLine?: number;
  
  /** Ending line number (1-based, inclusive) */
  endLine?: number;
  
  /** Starting character position (0-based) */
  start?: number;
  
  /** Ending character position (0-based, exclusive) */
  end?: number;
  
  // TODO: Runtime validation to ensure valid ranges
}

/**
 * Comprehensive interface for the embed directive.
 * @remarks Consolidates various parameter proposals into a single, structured interface
 * that covers core functionality needed across services.
 */
export interface EmbedDirective {
  /** Source specification for the content to embed */
  source: EmbedSource;
  
  /** Optional range to select a portion of the content */
  range?: EmbedRange;
  
  /** Formatting and display options */
  options?: EmbedOptions;
  
  // TODO: Runtime validation for the entire directive structure
}

/**
 * Specific error types for the embed directive.
 * @remarks Provides detailed error information to enable better error messages
 * and handling across services.
 */
export type EmbedError =
  | { kind: 'file_not_found'; path: string }
  | { kind: 'variable_not_found'; name: string }
  | { kind: 'permission_denied'; path: string }
  | { kind: 'invalid_format'; details: string };

/**
 * Result of processing an embed directive.
 * @remarks Includes both success and error cases to provide a consistent pattern
 * for error propagation without excessive complexity.
 */
export type EmbedResult = 
  | { 
      success: true; 
      content: string; 
      metadata?: { 
        source: string; 
        contentType: string 
      } 
    }
  | { 
      success: false; 
      error: string; 
      errorCode: string;
      details?: EmbedError;
    };

/**
 * Function signature for processing an embed directive.
 */
export interface EmbedProcessor {
  /**
   * Process an embed directive and return the result.
   * @param directive The embed directive to process
   * @returns The result of processing the directive
   */
  process(directive: EmbedDirective): Promise<EmbedResult>;
}
```