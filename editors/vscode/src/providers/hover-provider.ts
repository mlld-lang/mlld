import * as vscode from 'vscode';
import { DocumentAnalyzer } from '../utils/document-analyzer';

export class MeldHoverProvider implements vscode.HoverProvider {
  constructor(private analyzer: DocumentAnalyzer) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const wordRange = document.getWordRangeAtPosition(position, /@?\w+/);
    if (!wordRange) return null;

    const word = document.getText(wordRange);
    const varName = word.startsWith('@') ? word.substring(1) : word;

    // Get available variables at this position
    const variables = await this.analyzer.getAvailableVariables(document, position);
    const variable = variables.find(v => v.name === varName);

    if (!variable) return null;

    // Create hover content
    const contents = new vscode.MarkdownString();
    contents.appendMarkdown(`**${variable.kind}** \`${variable.name}\`\n\n`);

    // Add information based on variable type
    switch (variable.kind) {
      case 'text':
        contents.appendMarkdown('Text variable containing string content');
        break;
      case 'data':
        contents.appendMarkdown('Data variable containing structured data (JSON)');
        break;
      case 'path':
        contents.appendMarkdown('Path variable pointing to a file or directory');
        break;
      case 'exec':
        contents.appendMarkdown('Execution result from command or code');
        break;
      case 'run':
        contents.appendMarkdown('Output from running a command');
        break;
    }

    // Add location information
    contents.appendMarkdown(`\n\nDefined at line ${variable.location.line}`);

    // Try to show the value if it's simple enough
    const directive = variable.directive as any;
    if (directive.value && directive.value.type === 'Literal') {
      contents.appendMarkdown(`\n\nValue: \`${directive.value.value}\``);
    }

    return new vscode.Hover(contents, wordRange);
  }
}