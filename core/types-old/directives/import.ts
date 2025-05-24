/**
 * Import directive type definitions
 */
import { TypedDirectiveNode } from '@core/types/nodes/directive';
import { TextNode, VariableReference, PathSeparatorNode, DotSeparatorNode } from '@core/types/nodes';

// Value definitions
export type PathNodeArray = Array<
  TextNode | 
  PathSeparatorNode | 
  DotSeparatorNode | 
  VariableReference
>;

export interface ImportValues {
  imports: ImportNodeArray;
  path: PathNodeArray;
}

export type ImportNodeArray = Array<ImportReferenceNode | ImportWildcardNode>;

// Type for wildcard imports
export interface ImportWildcardNode extends VariableReference {
  identifier: '*';
  valueType: 'import';
}

// Type for specific imports
export interface ImportReferenceNode extends VariableReference {
  identifier: string; // Any name except '*'
  valueType: 'import';
}

// Raw and meta definitions
export interface ImportRaw {
  imports: string;
  path: string;
}

export interface PathMeta {
  hasVariables: boolean;
  isAbsolute: boolean;
  hasExtension: boolean;
  extension: string | null;
}

export interface ImportMeta {
  path: PathMeta;
}

/**
 * Base Import directive node
 */
export interface ImportDirectiveNode extends TypedDirectiveNode<'import', 'importAll' | 'importSelected'> {
  values: ImportValues;
  raw: ImportRaw;
  meta: ImportMeta;
}

/**
 * Import All directive - wildcard imports
 */
export interface ImportAllDirectiveNode extends ImportDirectiveNode {
  subtype: 'importAll';
  values: {
    imports: [ImportWildcardNode]; // Always a single-item array with '*'
    path: ImportValues['path'];
  };
}

/**
 * Import Selected directive - specific imports
 */
export interface ImportSelectedDirectiveNode extends ImportDirectiveNode {
  subtype: 'importSelected';
  values: {
    imports: ImportReferenceNode[]; // One or more items
    path: ImportValues['path'];
  };
}