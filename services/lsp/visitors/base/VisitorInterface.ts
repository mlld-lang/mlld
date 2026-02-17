import { VisitorContext } from '@services/lsp/context/VisitorContext';

export interface INodeVisitor {
  visitNode(node: any, context: VisitorContext): void;
  canHandle(node: any): boolean;
}

export interface IVisitorRegistry {
  register(nodeType: string, visitor: INodeVisitor): void;
  getVisitor(nodeType: string): INodeVisitor | undefined;
}