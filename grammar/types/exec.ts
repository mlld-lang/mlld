import { 
  DirectiveNode, 
  NodeType, 
  TextNode, 
  TextNodeArray, 
  TypedDirectiveNode, 
  VariableNode, 
  VariableNodeArray 
} from './base';

// ====================
// Raw Value Interfaces
// ====================

export interface ExecRaw {
  name: string;
  field?: string;
  parameters?: string[];
  command?: string;
  value?: string;
}

export interface ExecCommandRaw extends ExecRaw {
  name: string;
  command: string;
  field?: string;
  parameters?: string[];
}

// ExecValueRaw removed - this was a hallucinated subtype

// ====================
// Value Interfaces
// ====================

export interface ExecValues {
  name: TextNodeArray;
  field?: TextNodeArray;
  parameters?: VariableNodeArray[];
  command?: TextNodeArray;
  value?: TextNodeArray;
}

export interface ExecCommandValues extends ExecValues {
  name: TextNodeArray;
  command: TextNodeArray;
  field?: TextNodeArray;
  parameters?: VariableNodeArray[];
}

// ExecValueValues removed - this was a hallucinated subtype

// ====================
// Metadata Interfaces
// ====================

export interface ExecMeta {
  field?: {
    type: 'risk.high' | 'risk.med' | 'risk.low' | 'risk' | 'about' | 'meta';
  };
  isCommand?: boolean;
}

export interface ExecCommandMeta extends ExecMeta {
  isCommand: true;
  field?: {
    type: 'risk.high' | 'risk.med' | 'risk.low' | 'risk' | 'about' | 'meta';
  };
}

// ExecValueMeta removed - this was a hallucinated subtype

// ====================
// Node Interfaces
// ====================

export interface ExecDirectiveNode extends TypedDirectiveNode<'exec', 
  'execCommand'> {
  values: ExecValues;
  raw: ExecRaw;
  meta: ExecMeta;
}

export interface ExecCommandDirectiveNode extends ExecDirectiveNode {
  subtype: 'execCommand';
  values: ExecCommandValues;
  raw: ExecCommandRaw;
  meta: ExecCommandMeta;
}

// ExecValueDirectiveNode removed - this was a hallucinated subtype

// ====================
// Type Guards
// ====================

export function isExecDirectiveNode(node: DirectiveNode): node is ExecDirectiveNode {
  return node.kind === 'exec';
}

export function isExecCommandDirectiveNode(node: DirectiveNode): node is ExecCommandDirectiveNode {
  return isExecDirectiveNode(node) && node.subtype === 'execCommand';
}

// isExecValueDirectiveNode removed - this was a hallucinated function