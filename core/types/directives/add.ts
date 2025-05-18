/**
 * Add directive type definitions
 */
import { TypedDirectiveNode } from '@core/types/nodes/directive';
import { TextNode, VariableReference, DirectiveNode } from '@core/types/nodes';
import { PathNodeArray } from './import';

// Value definitions
export type VariableNodeArray = Array<VariableReference>;
export type ContentNodeArray = Array<TextNode | VariableReference>;

export interface AddValues {
  identifier?: VariableNodeArray;
  path?: PathNodeArray;
  variable?: VariableNodeArray;
  template?: ContentNodeArray;
}

// Raw and meta definitions
export interface AddRaw {
  identifier?: string;
  path?: string;
  variable?: string;
  template?: string;
}

export interface AddMeta {
  pathMeta?: {
    hasVariables: boolean;
    isAbsolute: boolean;
    hasExtension: boolean;
    extension: string | null;
  };
}

/**
 * Base Add directive node
 */
export interface AddDirectiveNode extends TypedDirectiveNode<'embed', 'addPath' | 'addVariable' | 'addTemplate'> {
  values: AddValues;
  raw: AddRaw;
  meta: AddMeta;
}

/**
 * Add Path directive
 */
export interface AddPathDirectiveNode extends AddDirectiveNode {
  subtype: 'addPath';
  values: {
    identifier: VariableNodeArray;
    path: PathNodeArray;
  };
}

/**
 * Add Variable directive
 */
export interface AddVariableDirectiveNode extends AddDirectiveNode {
  subtype: 'addVariable';
  values: {
    identifier: VariableNodeArray;
    variable: VariableNodeArray;
  };
}

/**
 * Add Template directive
 */
export interface AddTemplateDirectiveNode extends AddDirectiveNode {
  subtype: 'addTemplate';
  values: {
    identifier: VariableNodeArray;
    template: ContentNodeArray;
  };
}