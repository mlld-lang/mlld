/**
 * Processing context types for directive execution
 */
import { SourceLocation } from '@core/types/base';
import { MeldNode } from '@core/types/nodes';
import { IStateService } from './state';

/**
 * Context passed to handlers during processing
 */
export interface ProcessingContext {
  /** Current state service instance */
  state: IStateService;
  
  /** Current file being processed */
  currentFile: string;
  
  /** Project root directory */
  projectRoot: string;
  
  /** Processing options */
  options: ProcessingOptions;
  
  /** Parent nodes in the AST hierarchy */
  parentNodes: MeldNode[];
  
  /** Current location in source */
  location?: SourceLocation;
}

/**
 * Options that control processing behavior
 */
export interface ProcessingOptions {
  /** Whether to enable transformation mode */
  transformationMode: boolean;
  
  /** Whether to preserve comments */
  preserveComments: boolean;
  
  /** Whether to preserve formatting */
  preserveFormatting: boolean;
  
  /** Output format */
  outputFormat: 'markdown' | 'json' | 'yaml';
  
  /** Debug mode */
  debug: boolean;
}