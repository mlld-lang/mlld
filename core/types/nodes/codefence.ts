import { BaseMeldNode, SourceLocation } from '@core/types/base';

export interface CodeFenceNode extends BaseMeldNode {
  type: 'CodeFence';
  language?: string;
  content: string;
  
  // Parsing phase fields
  location?: SourceLocation;
}