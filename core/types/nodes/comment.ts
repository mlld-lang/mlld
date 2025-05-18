import { BaseMeldNode, SourceLocation } from '@core/types/base';

export interface CommentNode extends BaseMeldNode {
  type: 'Comment';
  content: string;  // The comment text after '>> '
  
  // Parsing phase fields
  location?: SourceLocation;
}