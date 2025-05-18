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

export interface AddRaw {
  path?: string;
  section?: string;
  headerLevel?: string;
  underHeader?: string;
  content?: string;
  variable?: string;
  names?: string[];
  sectionTitle?: string;
  newTitle?: string;
}

export interface AddPathRaw extends AddRaw {
  path: string;
  section?: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface AddTemplateRaw extends AddRaw {
  content: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface AddVariableRaw extends AddRaw {
  variable: string;
  headerLevel?: string;
  underHeader?: string;
}

export interface AddSectionRaw extends AddRaw {
  sectionTitle: string;
  path: string;
  newTitle?: string;
}


// ====================
// Value Interfaces
// ====================

export interface AddValues {
  path?: PathNodeArray;
  section?: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
  content?: TextNodeArray;
  variable?: VariableNodeArray;
  names?: VariableNodeArray;
  sectionTitle?: TextNodeArray;
  newTitle?: TextNodeArray;
}

export interface AddPathValues extends AddValues {
  path: PathNodeArray;
  section?: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface AddTemplateValues extends AddValues {
  content: TextNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface AddVariableValues extends AddValues {
  variable: VariableNodeArray;
  headerLevel?: number;
  underHeader?: TextNodeArray;
}

export interface AddSectionValues extends AddValues {
  sectionTitle: TextNodeArray;
  path: PathNodeArray;
  newTitle?: TextNodeArray;
}


// ====================
// Metadata Interfaces
// ====================

export interface AddMeta {
  path?: {
    hasVariables: boolean;
  };
  isTemplateContent?: boolean;
}

export interface AddPathMeta extends AddMeta {
  path: {
    hasVariables: boolean;
  };
}

export interface AddTemplateMeta extends AddMeta {
  isTemplateContent: boolean;
  hasVariables: boolean;
  wrapperType: string;
}

export interface AddSectionMeta extends AddMeta {
  path: {
    hasVariables: boolean;
  };
}

// ====================
// Node Interfaces
// ====================

export interface AddDirectiveNode extends TypedDirectiveNode<'add', 
  'addPath' | 'addTemplate' | 'addVariable' | 'addSection'> {
  values: AddValues;
  raw: AddRaw;
  meta: AddMeta;
}

export interface AddPathDirectiveNode extends AddDirectiveNode {
  subtype: 'addPath';
  values: AddPathValues;
  raw: AddPathRaw;
  meta: AddPathMeta;
}

export interface AddTemplateDirectiveNode extends AddDirectiveNode {
  subtype: 'addTemplate';
  values: AddTemplateValues;
  raw: AddTemplateRaw;
  meta: AddTemplateMeta;
}

export interface AddVariableDirectiveNode extends AddDirectiveNode {
  subtype: 'addVariable';
  values: AddVariableValues;
  raw: AddVariableRaw;
  meta: AddMeta;
}

export interface AddSectionDirectiveNode extends AddDirectiveNode {
  subtype: 'addSection';
  values: AddSectionValues;
  raw: AddSectionRaw;
  meta: AddSectionMeta;
}


// ====================
// Type Guards
// ====================

export function isAddDirectiveNode(node: DirectiveNode): node is AddDirectiveNode {
  return node.kind === 'add';
}

export function isAddPathDirectiveNode(node: DirectiveNode): node is AddPathDirectiveNode {
  return isAddDirectiveNode(node) && node.subtype === 'addPath';
}

export function isAddTemplateDirectiveNode(node: DirectiveNode): node is AddTemplateDirectiveNode {
  return isAddDirectiveNode(node) && node.subtype === 'addTemplate';
}

export function isAddVariableDirectiveNode(node: DirectiveNode): node is AddVariableDirectiveNode {
  return isAddDirectiveNode(node) && node.subtype === 'addVariable';
}

export function isAddSectionDirectiveNode(node: DirectiveNode): node is AddSectionDirectiveNode {
  return isAddDirectiveNode(node) && node.subtype === 'addSection';
}

