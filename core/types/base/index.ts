export * from './positions';
export * from './common';

export interface BaseMeldNode {
  type: string;
  nodeId: string;
  location?: SourceLocation;
}

export interface ProcessedNode extends BaseMeldNode {
  raw?: string;
  metadata?: NodeMetadata;
  resolvedValue?: unknown;
}
