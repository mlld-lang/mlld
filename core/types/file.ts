import type { TypedDirectiveNode } from './base';
import type { BaseMlldNode } from './primitives';

export interface FileProjectionPathTarget {
  type: 'path';
  path: BaseMlldNode[];
  raw: string;
  meta?: Record<string, unknown>;
}

export interface FileProjectionResolverTarget {
  type: 'resolver';
  resolver: string;
  path: string;
  raw: string;
}

export type FileProjectionTarget =
  | FileProjectionPathTarget
  | FileProjectionResolverTarget;

export interface GitFilesSourceNode extends BaseMlldNode {
  type: 'GitFilesSource';
  url: BaseMlldNode[];
  options?: {
    auth?: BaseMlldNode[];
    branch?: BaseMlldNode[];
    path?: BaseMlldNode[];
    depth?: BaseMlldNode[];
    [key: string]: BaseMlldNode[] | undefined;
  };
  raw?: string;
  optionRaw?: Record<string, string>;
}

export interface FileDirectiveNode extends TypedDirectiveNode<'file', 'file'> {
  values: {
    target: FileProjectionTarget;
    content: BaseMlldNode[];
  };
  raw: {
    target: string;
    content: string;
  };
  meta: {
    targetType: FileProjectionTarget['type'];
    hasResolverTarget: boolean;
    comment?: string;
  };
}

export interface FilesDirectiveNode extends TypedDirectiveNode<'files', 'files'> {
  values: {
    target: FileProjectionTarget;
    entries: BaseMlldNode[];
  };
  raw: {
    target: string;
    entries: string;
  };
  meta: {
    targetType: FileProjectionTarget['type'];
    hasResolverTarget: boolean;
    comment?: string;
  };
}

export type FileProjectionDirectiveNode = FileDirectiveNode | FilesDirectiveNode;

export function isFileDirective(node: BaseMlldNode): node is FileDirectiveNode {
  return node.type === 'Directive' && (node as any).kind === 'file';
}

export function isFilesDirective(node: BaseMlldNode): node is FilesDirectiveNode {
  return node.type === 'Directive' && (node as any).kind === 'files';
}

export function isGitFilesSourceNode(node: unknown): node is GitFilesSourceNode {
  return Boolean(node) && typeof node === 'object' && (node as { type?: string }).type === 'GitFilesSource';
}
