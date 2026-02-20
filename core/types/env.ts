/**
 * Env directive type definitions
 */
import type { TypedDirectiveNode } from './base';
import type { BaseMlldNode } from './primitives';
import type { WithClause } from './run';
import type { ExeBlockNode } from './exe';

export interface EnvDirectiveNode extends TypedDirectiveNode<'env', 'env'> {
  values: {
    config: BaseMlldNode[];
    withClause?: WithClause;
    block: ExeBlockNode;
  };
  raw: {
    config: string;
    withClause?: WithClause;
  };
  meta: {
    statementCount?: number;
    hasReturn?: boolean;
    withClause?: WithClause;
    comment?: string;
  };
}
