import { TextDirectiveNode } from './text.js';
import { AddDirectiveNode } from './add.js';


/**
 * Union type for all directive nodes
 */
export type DirectiveNodeUnion = 
  | TextDirectiveNode
  | AddDirectiveNode
