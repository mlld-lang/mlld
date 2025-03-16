import { StateServiceLike } from '@core/shared-service-types.js';
import { MeldNode } from '@core/syntax/types/index.js';

/**
 * The result of executing a directive
 * Contains the updated state and optionally a replacement node to use in transformation mode
 */
export interface DirectiveResult {
  /**
   * The updated state after processing the directive
   */
  state: StateServiceLike;
  
  /**
   * In transformation mode, this is the replacement node that the directive's node should be transformed into
   */
  replacement?: MeldNode;
  
  /**
   * Optional formatting context that should be propagated to further processing.
   * This helps maintain consistent newline handling and formatting.
   */
  formattingContext?: {
    isOutputLiteral?: boolean;
    contextType?: 'inline' | 'block';
    nodeType?: string;
    [key: string]: any;
  };
} 