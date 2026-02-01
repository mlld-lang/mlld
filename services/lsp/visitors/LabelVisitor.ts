import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';

export class LabelVisitor extends BaseVisitor {
  private operatorHelper: OperatorTokenHelper;

  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
  }

  canHandle(node: any): boolean {
    return node.type === 'LabelModification';
  }

  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;

    const sourceText = this.document.getText();
    const segment = sourceText.substring(node.location.start.offset, node.location.end.offset);
    const tokenMatch = segment.match(/^\s*([^\s]+)/);
    if (!tokenMatch) return;

    const labelToken = tokenMatch[1];
    if (!labelToken) return;

    const matchIndex = tokenMatch.index ?? 0;
    const tokenOffset = node.location.start.offset + matchIndex + tokenMatch[0].indexOf(labelToken);

    let labelWord = labelToken;
    let labelOffset = tokenOffset;

    if (labelToken.startsWith('!')) {
      this.operatorHelper.addOperatorToken(tokenOffset, 1);
      labelWord = labelToken.slice(1);
      labelOffset = tokenOffset + 1;
    }

    if (labelWord.endsWith('!')) {
      const bangOffset = labelOffset + labelWord.length - 1;
      this.operatorHelper.addOperatorToken(bangOffset, 1);
      labelWord = labelWord.slice(0, -1);
    }

    if (!labelWord) return;

    const labelPos = this.document.positionAt(labelOffset);
    this.tokenBuilder.addToken({
      line: labelPos.line,
      char: labelPos.character,
      length: labelWord.length,
      tokenType: 'keyword',
      modifiers: []
    });
  }
}
