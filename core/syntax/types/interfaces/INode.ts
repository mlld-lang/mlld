import { BaseNode } from '../shared-types.js';
import { SourceLocation } from './common.js';

/**
 * Base interface for all AST nodes
 * Extends the minimal BaseNode from shared-types
 */
export interface INode extends BaseNode {
  location?: SourceLocation;
}