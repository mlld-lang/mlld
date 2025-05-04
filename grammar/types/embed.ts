import { 
  DirectiveNode, 
  NodeType, 
  PathNode, 
  PathNodeArray, 
  TextNode, 
  TextNodeArray, 
  TypedDirectiveNode, 
  VariableNode, 
  VariableNodeArray 
} from './base';

// ====================
// Raw Value Interfaces
// ====================

export interface EmbedRaw {
  path?: string;
  section?: string;
  headerLevel?: string;
  underHeader?: string;
  content?: string;
  variable?: string;
  names?: string[];
}

export interface EmbedPathRaw extends EmbedRaw {
  path: string;
  section?: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface EmbedTemplateRaw extends EmbedRaw {
  content: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface EmbedVariableRaw extends EmbedRaw {
  variable: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface EmbedMultilineRaw extends EmbedRaw {
  content: string;
}

// ====================
// Value Interfaces
// ====================

export interface EmbedValues {
  path?: PathNodeArray;
  section?: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
  content?: TextNodeArray;
  variable?: VariableNodeArray;
  names?: VariableNodeArray;
}

export interface EmbedPathValues extends EmbedValues {
  path: PathNodeArray;
  section?: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface EmbedTemplateValues extends EmbedValues {
  content: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface EmbedVariableValues extends EmbedValues {
  variable: VariableNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface EmbedMultilineValues extends EmbedValues {
  content: TextNodeArray;
}

// ====================
// Metadata Interfaces
// ====================

export interface EmbedMeta {
  path?: {
    isAbsolute: boolean;
    hasVariables: boolean;
    hasTextVariables: boolean;
    hasPathVariables: boolean;
    isRelative: boolean;
  };
  isTemplateContent?: boolean;
}

export interface EmbedPathMeta extends EmbedMeta {
  path: {
    isAbsolute: boolean;
    hasVariables: boolean;
    hasTextVariables: boolean;
    hasPathVariables: boolean;
    isRelative: boolean;
  };
}

export interface EmbedTemplateMeta extends EmbedMeta {
  isTemplateContent: boolean;
}

// ====================
// Node Interfaces
// ====================

export interface EmbedDirectiveNode extends TypedDirectiveNode<'embed', 
  'embedPath' | 'embedTemplate' | 'embedVariable' | 'embedMultiline'> {
  values: EmbedValues;
  raw: EmbedRaw;
  meta: EmbedMeta;
}

export interface EmbedPathDirectiveNode extends EmbedDirectiveNode {
  subtype: 'embedPath';
  values: EmbedPathValues;
  raw: EmbedPathRaw;
  meta: EmbedPathMeta;
}

export interface EmbedTemplateDirectiveNode extends EmbedDirectiveNode {
  subtype: 'embedTemplate';
  values: EmbedTemplateValues;
  raw: EmbedTemplateRaw;
  meta: EmbedTemplateMeta;
}

export interface EmbedVariableDirectiveNode extends EmbedDirectiveNode {
  subtype: 'embedVariable';
  values: EmbedVariableValues;
  raw: EmbedVariableRaw;
  meta: EmbedMeta;
}

export interface EmbedMultilineDirectiveNode extends EmbedDirectiveNode {
  subtype: 'embedMultiline';
  values: EmbedMultilineValues;
  raw: EmbedMultilineRaw;
  meta: EmbedMeta;
}

// ====================
// Type Guards
// ====================

export function isEmbedDirectiveNode(node: DirectiveNode): node is EmbedDirectiveNode {
  return node.kind === 'embed';
}

export function isEmbedPathDirectiveNode(node: DirectiveNode): node is EmbedPathDirectiveNode {
  return isEmbedDirectiveNode(node) && node.subtype === 'embedPath';
}

export function isEmbedTemplateDirectiveNode(node: DirectiveNode): node is EmbedTemplateDirectiveNode {
  return isEmbedDirectiveNode(node) && node.subtype === 'embedTemplate';
}

export function isEmbedVariableDirectiveNode(node: DirectiveNode): node is EmbedVariableDirectiveNode {
  return isEmbedDirectiveNode(node) && node.subtype === 'embedVariable';
}

export function isEmbedMultilineDirectiveNode(node: DirectiveNode): node is EmbedMultilineDirectiveNode {
  return isEmbedDirectiveNode(node) && node.subtype === 'embedMultiline';
}