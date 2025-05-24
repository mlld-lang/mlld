import * as vscode from 'vscode';
import { DocumentAnalyzer } from '../utils/document-analyzer';

export class MeldDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private analyzer: DocumentAnalyzer) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | null> {
    const wordRange = document.getWordRangeAtPosition(position, /@?\w+/);
    if (!wordRange) return null;

    const word = document.getText(wordRange);
    const varName = word.startsWith('@') ? word.substring(1) : word;

    // Get document analysis
    const analysis = await this.analyzer.analyzeDocument(document);
    
    // Find variable definition
    const variable = analysis.variables.find(v => v.name === varName);
    if (variable) {
      const defPosition = new vscode.Position(
        variable.location.line - 1,
        variable.location.column - 1
      );
      return new vscode.Location(document.uri, defPosition);
    }

    // Check imports for the variable
    for (const imp of analysis.imports) {
      if (imp.type === 'all' || imp.variables.includes(varName)) {
        // Try to find definition in imported file
        const importedDef = await this.findInImport(document, imp, varName);
        if (importedDef) return importedDef;
      }
    }

    return null;
  }

  private async findInImport(
    document: vscode.TextDocument,
    imp: any,
    varName: string
  ): Promise<vscode.Location | null> {
    try {
      // Resolve import path
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) return null;

      let importPath = imp.path;
      if (importPath.startsWith('@PROJECTPATH')) {
        importPath = importPath.replace('@PROJECTPATH', workspaceFolder.uri.fsPath);
      }

      const importUri = vscode.Uri.file(importPath);
      const importDoc = await vscode.workspace.openTextDocument(importUri);
      const importAnalysis = await this.analyzer.analyzeDocument(importDoc);

      const variable = importAnalysis.variables.find(v => v.name === varName);
      if (variable) {
        const defPosition = new vscode.Position(
          variable.location.line - 1,
          variable.location.column - 1
        );
        return new vscode.Location(importUri, defPosition);
      }
    } catch (error) {
      console.error('Failed to find definition in import:', error);
    }

    return null;
  }
}