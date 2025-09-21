/**
 * Export directive node definitions
 */
import { TypedDirectiveNode } from './base';
import { ExportValues, ExportReferenceNode } from './values';
import { ExportRaw } from './raw';
import { ExportMeta } from './meta';

/**
 * Base `/export` directive node
 */
export interface ExportDirectiveNode extends TypedDirectiveNode<'export', 'exportSelected'> {
  values: ExportValues;
  raw: ExportRaw;
  meta: ExportMeta;
}

/**
 * `/export` directive with explicit members
 */
export interface ExportSelectedDirectiveNode extends ExportDirectiveNode {
  subtype: 'exportSelected';
  values: {
    exports: ExportReferenceNode[];
  };
}
