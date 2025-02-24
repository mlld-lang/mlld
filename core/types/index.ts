import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import type { OutputFormat } from '@services/pipeline/OutputService/IOutputService.js';

/**
 * Represents a position in a file
 */
export interface Position {
  /** The line number (1-based) */
  line: number;
  /** The column number (1-based) */
  column: number;
}

/**
 * Represents a location in a file
 */
export interface Location {
  /** Start position */
  start: Position;
  /** End position */
  end: Position;
  /** Optional file path */
  filePath?: string;
}

/**
 * Represents a range in a file with start and end positions
 * @deprecated Use Location instead as it already includes start/end positions
 */
export interface Range {
  start: Position;
  end: Position;
  filePath?: string;
}

export interface ProcessOptions {
  fs?: NodeFileSystem;
  format?: OutputFormat;
  services?: any;
} 