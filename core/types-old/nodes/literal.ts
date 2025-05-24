import { BaseMeldNode, SourceLocation } from '@core/types/base';

export interface LiteralNode extends BaseMeldNode {
  type: 'Literal';
  value: string | number | boolean; // Adjust based on expected literal types
  valueType?: string; // Optional context for the literal's role (e.g., 'import', 'variable')
  
  // Parsing phase fields
  location?: SourceLocation;
}