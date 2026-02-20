import { VisitorContext } from '@services/lsp/context/VisitorContext';

export interface INodeVisitor {
  visitNode(node: unknown, context: VisitorContext): void;
  canHandle(node: unknown): boolean;
}

export interface IVisitorRegistry {
  register(nodeType: string, visitor: INodeVisitor): void;
  getVisitor(nodeType: string): INodeVisitor | undefined;
}