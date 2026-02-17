import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { INodeVisitor } from '@services/lsp/visitors/base/VisitorInterface';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';
import {
  BaseMlldNode,
  ConditionalTemplateSnippetNode,
  ConditionalStringFragmentNode,
  ConditionalVarOmissionNode,
  ConditionalArrayElementNode,
  NullCoalescingTightNode
} from '@core/types/primitives';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';

export class ConditionalVisitor extends BaseVisitor {
  private mainVisitor: INodeVisitor | undefined;
  private operatorHelper: OperatorTokenHelper;

  constructor(document: TextDocument, tokenBuilder: TokenBuilder) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
  }

  setMainVisitor(visitor: INodeVisitor): void {
    this.mainVisitor = visitor;
  }

  canHandle(node: BaseMlldNode): boolean {
    return node.type === 'ConditionalTemplateSnippet' ||
      node.type === 'ConditionalStringFragment' ||
      node.type === 'ConditionalVarOmission' ||
      node.type === 'ConditionalArrayElement' ||
      node.type === 'NullCoalescingTight';
  }

  visitNode(node: BaseMlldNode, context: VisitorContext): void {
    if (!node.location) return;

    switch (node.type) {
      case 'ConditionalTemplateSnippet':
        this.visitConditionalTemplateSnippet(node as ConditionalTemplateSnippetNode, context);
        break;
      case 'ConditionalStringFragment':
        this.visitConditionalStringFragment(node as ConditionalStringFragmentNode, context);
        break;
      case 'ConditionalVarOmission':
        this.visitConditionalVarOmission(node as ConditionalVarOmissionNode, context);
        break;
      case 'ConditionalArrayElement':
        this.visitConditionalArrayElement(node as ConditionalArrayElementNode, context);
        break;
      case 'NullCoalescingTight':
        this.visitNullCoalescingTight(node as NullCoalescingTightNode, context);
        break;
    }
  }

  private visitConditionalTemplateSnippet(node: ConditionalTemplateSnippetNode, context: VisitorContext): void {
    this.visitChildNode(node.condition, context);
    this.tokenizeConditionalMarker(node, node.condition);
    this.tokenizeBacktickDelimiters(node);
  }

  private visitConditionalStringFragment(node: ConditionalStringFragmentNode, context: VisitorContext): void {
    this.visitChildNode(node.condition, context);
    this.tokenizeConditionalMarker(node, node.condition);
  }

  private visitConditionalVarOmission(node: ConditionalVarOmissionNode, context: VisitorContext): void {
    this.visitChildNode(node.variable, context);
    this.tokenizeTrailingOperator(node, '?');
  }

  private visitConditionalArrayElement(node: ConditionalArrayElementNode, context: VisitorContext): void {
    this.visitChildNode(node.condition, context);
    this.visitChildNode(node.value, context);
    this.tokenizeTrailingOperator(node, '?');
  }

  private visitNullCoalescingTight(node: NullCoalescingTightNode, context: VisitorContext): void {
    this.visitChildNode(node.variable, context);
    const operatorOffset = this.findOperatorOffset(node, '??');
    if (operatorOffset !== null) {
      this.operatorHelper.addOperatorToken(operatorOffset, 2);
      this.tokenizeDefaultString(node, operatorOffset + 2);
    }
  }

  private visitChildNode(node: BaseMlldNode, context: VisitorContext): void {
    if (!node || !node.type || !this.mainVisitor) return;
    this.mainVisitor.visitNode(node, context);
  }

  private tokenizeConditionalMarker(node: BaseMlldNode, condition: BaseMlldNode): void {
    const sourceText = this.document.getText();
    const startOffset = condition?.location?.end?.offset ?? node.location!.start.offset;
    const endOffset = node.location!.end.offset;
    const segment = sourceText.substring(startOffset, endOffset);
    const markerIndex = segment.indexOf('?');

    if (markerIndex !== -1) {
      this.operatorHelper.addOperatorToken(startOffset + markerIndex, 1);
    }
  }

  private tokenizeTrailingOperator(node: BaseMlldNode, operator: string): void {
    const sourceText = this.document.getText();
    const operatorOffset = node.location!.end.offset - operator.length;

    if (operatorOffset >= node.location!.start.offset &&
      sourceText.substring(operatorOffset, operatorOffset + operator.length) === operator) {
      this.operatorHelper.addOperatorToken(operatorOffset, operator.length);
      return;
    }

    const fallbackOffset = this.findOperatorOffset(node, operator);
    if (fallbackOffset !== null) {
      this.operatorHelper.addOperatorToken(fallbackOffset, operator.length);
    }
  }

  private findOperatorOffset(node: BaseMlldNode, operator: string): number | null {
    const sourceText = this.document.getText();
    const segment = sourceText.substring(node.location!.start.offset, node.location!.end.offset);
    const index = segment.indexOf(operator);
    if (index === -1) return null;
    return node.location!.start.offset + index;
  }

  private tokenizeBacktickDelimiters(node: BaseMlldNode): void {
    const sourceText = this.document.getText();
    const segment = sourceText.substring(node.location!.start.offset, node.location!.end.offset);
    const openIndex = segment.indexOf('`');
    const closeIndex = segment.lastIndexOf('`');

    if (openIndex === -1 || closeIndex === -1 || openIndex === closeIndex) return;

    const openPos = this.document.positionAt(node.location!.start.offset + openIndex);
    const closePos = this.document.positionAt(node.location!.start.offset + closeIndex);

    this.tokenBuilder.addToken({
      line: openPos.line,
      char: openPos.character,
      length: 1,
      tokenType: 'template',
      modifiers: []
    });

    this.tokenBuilder.addToken({
      line: closePos.line,
      char: closePos.character,
      length: 1,
      tokenType: 'template',
      modifiers: []
    });
  }

  private tokenizeDefaultString(node: NullCoalescingTightNode, searchStartOffset: number): void {
    const quote = node.default?.quote === 'single' ? '\'' : '"';
    const sourceText = this.document.getText();
    const segment = sourceText.substring(searchStartOffset, node.location.end.offset);
    const openIndex = segment.indexOf(quote);
    if (openIndex === -1) return;
    const closeIndex = segment.lastIndexOf(quote);
    if (closeIndex === openIndex) return;

    const startOffset = searchStartOffset + openIndex;
    const endOffset = searchStartOffset + closeIndex;
    const length = endOffset - startOffset + 1;
    const position = this.document.positionAt(startOffset);

    this.tokenBuilder.addToken({
      line: position.line,
      char: position.character,
      length,
      tokenType: 'string',
      modifiers: quote === '\'' ? ['literal'] : []
    });
  }
}
