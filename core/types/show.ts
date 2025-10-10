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
import type { DataLabel } from './security';

// ====================
// Raw Value Interfaces
// ====================

export interface ShowRaw {
  path?: string;
  section?: string;
  headerLevel?: string;
  underHeader?: string;
  content?: string;
  variable?: string;
  names?: string[];
  sectionTitle?: string;
  newTitle?: string;
  securityLabels?: string;
}

export interface ShowPathRaw extends ShowRaw {
  path: string;
  section?: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface ShowTemplateRaw extends ShowRaw {
  content: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface ShowVariableRaw extends ShowRaw {
  variable: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface ShowPathSectionRaw extends ShowRaw {
  sectionTitle: string;
  path: string;
  newTitle?: string;
}


// ====================
// Value Interfaces
// ====================

export interface ShowValues {
  path?: PathNodeArray;
  section?: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
  content?: TextNodeArray;
  variable?: VariableNodeArray;
  names?: VariableNodeArray;
  sectionTitle?: TextNodeArray;
  newTitle?: TextNodeArray;
  securityLabels?: DataLabel[];
}

export interface ShowPathValues extends ShowValues {
  path: PathNodeArray;
  section?: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface ShowTemplateValues extends ShowValues {
  content: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface ShowVariableValues extends ShowValues {
  variable: VariableNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface ShowPathSectionValues extends ShowValues {
  sectionTitle: TextNodeArray;
  path: PathNodeArray;
  newTitle?: TextNodeArray;
}


// ====================
// Metadata Interfaces
// ====================

export interface ShowMeta {
  path?: {
    hasVariables: boolean;
  };
  isTemplateContent?: boolean;
  securityLabels?: DataLabel[];
}

export interface ShowPathMeta extends ShowMeta {
  path: {
    hasVariables: boolean;
  };
}

export interface ShowTemplateMeta extends ShowMeta {
  isTemplateContent: boolean;
  hasVariables: boolean;
  wrapperType: string;
}

export interface ShowPathSectionMeta extends ShowMeta {
  path: {
    hasVariables: boolean;
  };
}

// ====================
// Node Interfaces
// ====================

export interface ShowDirectiveNode extends TypedDirectiveNode<'show', 
  'showPath' | 'showTemplate' | 'showVariable' | 'showPathSection'> {
  values: ShowValues;
  raw: ShowRaw;
  meta: ShowMeta;
}

export interface ShowPathDirectiveNode extends ShowDirectiveNode {
  subtype: 'showPath';
  values: ShowPathValues;
  raw: ShowPathRaw;
  meta: ShowPathMeta;
}

export interface ShowTemplateDirectiveNode extends ShowDirectiveNode {
  subtype: 'showTemplate';
  values: ShowTemplateValues;
  raw: ShowTemplateRaw;
  meta: ShowTemplateMeta;
}

export interface ShowVariableDirectiveNode extends ShowDirectiveNode {
  subtype: 'showVariable';
  values: ShowVariableValues;
  raw: ShowVariableRaw;
  meta: ShowMeta;
}

export interface ShowPathSectionDirectiveNode extends ShowDirectiveNode {
  subtype: 'showPathSection';
  values: ShowPathSectionValues;
  raw: ShowPathSectionRaw;
  meta: ShowPathSectionMeta;
}


// ====================
// Type Guards
// ====================

export function isShowDirectiveNode(node: DirectiveNode): node is ShowDirectiveNode {
  return node.kind === 'show';
}

export function isShowPathDirectiveNode(node: DirectiveNode): node is ShowPathDirectiveNode {
  return isShowDirectiveNode(node) && node.subtype === 'showPath';
}

export function isShowTemplateDirectiveNode(node: DirectiveNode): node is ShowTemplateDirectiveNode {
  return isShowDirectiveNode(node) && node.subtype === 'showTemplate';
}

export function isShowVariableDirectiveNode(node: DirectiveNode): node is ShowVariableDirectiveNode {
  return isShowDirectiveNode(node) && node.subtype === 'showVariable';
}

export function isShowPathSectionDirectiveNode(node: DirectiveNode): node is ShowPathSectionDirectiveNode {
  return isShowDirectiveNode(node) && node.subtype === 'showPathSection';
}
