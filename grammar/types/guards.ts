/**
 * Type guards for Meld directive nodes
 */
import { DirectiveNode } from './base';
import { ImportDirectiveNode, ImportAllDirectiveNode, ImportSelectedDirectiveNode } from './import';
import { TextDirectiveNode, TextAssignmentDirectiveNode, TextBracketedDirectiveNode, TextEmbedDirectiveNode, TextRunDirectiveNode, TextCallDirectiveNode } from './text';
import { VariableReferenceNode } from '@core/syntax/types/nodes';
import { ImportWildcardNode } from './values';

/**
 * Import directive type guards
 */

export function isImportDirective(node: DirectiveNode): node is ImportDirectiveNode {
  return node.kind === 'import';
}

export function isImportAllDirective(node: DirectiveNode): node is ImportAllDirectiveNode {
  return node.kind === 'import' && node.subtype === 'importAll';
}

export function isImportSelectedDirective(node: DirectiveNode): node is ImportSelectedDirectiveNode {
  return node.kind === 'import' && node.subtype === 'importSelected';
}

export function isWildcardImport(node: VariableReferenceNode): node is ImportWildcardNode {
  return node.valueType === 'import' && node.identifier === '*';
}

/**
 * Text directive type guards
 */

export function isTextDirective(node: DirectiveNode): node is TextDirectiveNode {
  return node.kind === 'text';
}

export function isTextAssignmentDirective(node: DirectiveNode): node is TextAssignmentDirectiveNode {
  return node.kind === 'text' && node.subtype === 'textAssignment';
}

export function isTextBracketedDirective(node: DirectiveNode): node is TextBracketedDirectiveNode {
  return node.kind === 'text' && node.subtype === 'textBracketed';
}

export function isTextEmbedDirective(node: DirectiveNode): node is TextEmbedDirectiveNode {
  return isTextAssignmentDirective(node) && 'source' in node.values && node.values.source === 'embed';
}

export function isTextRunDirective(node: DirectiveNode): node is TextRunDirectiveNode {
  return isTextAssignmentDirective(node) && 'source' in node.values && node.values.source === 'run';
}

export function isTextCallDirective(node: DirectiveNode): node is TextCallDirectiveNode {
  return isTextAssignmentDirective(node) && 'source' in node.values && node.values.source === 'call';
}

/**
 * Other directive type guards will be added as those directives are implemented
 */