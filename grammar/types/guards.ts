/**
 * Type guards for Meld directive nodes
 */
import { DirectiveNode } from './base';
import { ImportDirectiveNode, ImportAllDirectiveNode, ImportSelectedDirectiveNode } from './import';
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
 * Other directive type guards will be added as those directives are implemented
 */