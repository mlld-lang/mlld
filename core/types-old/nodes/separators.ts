import { BaseMeldNode, SourceLocation } from '@core/types/base';

/**
 * AST node for dot separators in paths/imports
 */
export interface DotSeparatorNode extends BaseMeldNode {
  type: 'DotSeparator';
  value: '.';
  
  // Parsing phase fields
  location?: SourceLocation;
}

/**
 * AST node for path separators (/)
 */
export interface PathSeparatorNode extends BaseMeldNode {
  type: 'PathSeparator';
  value: '/';
  
  // Parsing phase fields
  location?: SourceLocation;
}