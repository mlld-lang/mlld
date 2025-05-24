/**
 * Path directive type definitions
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

export interface PathValues {
  identifier: [VariableReference];
  path: PathNodeArray;
}

// Raw and meta definitions
export interface PathRaw {
  identifier: string;
  path: string;
}

export interface PathMeta {
  path: {
    hasVariables: boolean;
    isAbsolute: boolean;
    hasExtension: boolean;
    extension: string | null;
  };
}

/**
 * Path directive node - @path var = /some/path
 */
export interface PathDirectiveNode extends TypedDirectiveNode<'path', 'pathVariable'> {
  values: PathValues;
  raw: PathRaw;
  meta: PathMeta;
}