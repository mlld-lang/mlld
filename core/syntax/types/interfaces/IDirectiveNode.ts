import { INode } from './INode';

/**
 * Directive kinds supported in Meld
 */
export type DirectiveKind = 
  | 'text'
  | 'data'
  | 'path'
  | 'import'
  | 'embed'
  | 'run'
  | 'define';

export type DirectiveKindString = DirectiveKind;

/**
 * Base directive data interface
 */
export interface DirectiveData {
  kind: DirectiveKindString;
  [key: string]: any;
}

/**
 * Interface for directive nodes
 */
export interface IDirectiveNode extends INode {
  type: 'Directive';
  directive: DirectiveData;
}