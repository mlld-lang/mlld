/**
 * Type definitions for directive values arrays
 */
import {
  ImportType,
  DataLabel
} from './security';

import type { PathMeta } from './meta';

import {
  TextNode,
  VariableReferenceNode,
  DotSeparatorNode,
  PathSeparatorNode,
  BaseMlldNode,
  TimeDurationNode,
  ExecInvocation
} from './primitives';
import { WithClause } from './run';

/**
 * Common node array types that may be shared across directives
 */

// Array of nodes representing a path
export type PathNodeArray = Array<
  TextNode | 
  PathSeparatorNode | 
  DotSeparatorNode | 
  VariableReferenceNode
>;

// Array of variable reference nodes
export type VariableNodeArray = Array<VariableReferenceNode>;

// Array of content nodes (text, variables, and exec invocations)
export type ContentNodeArray = Array<TextNode | VariableReferenceNode | ExecInvocation>;

/**
 * Import directive values
 */
export interface ImportValues {
  imports: ImportNodeArray;
  path: PathNodeArray;
  importType?: ImportType;
  cachedDuration?: TimeDurationNode;
  withClause?: WithClause;
  securityLabels?: DataLabel[];
  namespace?: TextNode[];
  templateParams?: any[];
}

export type ImportNodeArray = Array<ImportReferenceNode | ImportWildcardNode>;

// Type for wildcard imports
export interface ImportWildcardNode extends VariableReferenceNode {
  identifier: '*';
  valueType: 'import';
  alias?: string; // For namespace imports: @import { * as @namespace } from "path"
}

// Type for specific imports
export interface ImportReferenceNode extends VariableReferenceNode {
  identifier: string; // Any name except '*'
  valueType: 'import';
  alias?: string; // For aliased imports: @import { name as alias } from "path"
}

/**
 * Export directive values
 */
export interface ExportValues {
  exports: ExportReferenceNode[];
}

// Member exported from the current module
export interface ExportReferenceNode extends VariableReferenceNode {
  identifier: string;
  valueType: 'export';
  alias?: string;
}

/**
 * Text directive values
 */
export interface TextValues {
  variable: VariableNodeArray;
  format?: ContentNodeArray;
}

/**
 * Embed directive values
 */
export interface EmbedValues {
  path?: PathNodeArray;
  variable?: VariableNodeArray;
  content?: ContentNodeArray;
  section?: TextNode[];
  options?: BaseMlldNode[];
}

/**
 * Path directive values
 */
export interface PathValues {
  identifier: VariableNodeArray;
  path: PathNodeArray;
}

/**
 * Run directive values
 */
export interface RunValues {
  command: ContentNodeArray;
  parameters?: ContentNodeArray;
  options?: BaseMlldNode[];
  securityLabels?: DataLabel[];
  workingDir?: ContentNodeArray;
  workingDirMeta?: PathMeta;
}

/**
 * Define directive values
 */
export interface DefineValues {
  name: TextNode[];
  command?: ContentNodeArray;
  parameters?: VariableNodeArray;
}

/**
 * Data directive values
 */
export interface DataValues {
  identifier: VariableNodeArray;
  value: ContentNodeArray;
}
