import * as vscode from 'vscode';
import * as path from 'path';
import { parseDocument, extractVariables, extractImports, findVariableReferences } from '../parser-bridge';
import type { VariableInfo, ImportInfo, ParseError } from '../parser-bridge';

export class DocumentAnalyzer {
  private documentCache = new Map<string, DocumentAnalysis>();
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('meld');
  }

  /**
   * Analyze a document and cache the results
   */
  async analyzeDocument(document: vscode.TextDocument): Promise<DocumentAnalysis> {
    const uri = document.uri.toString();
    const text = document.getText();
    
    // Parse the document
    const { ast, errors } = await parseDocument(text);
    
    // Extract information
    const variables = extractVariables(ast);
    const imports = extractImports(ast);
    
    // Create analysis result
    const analysis: DocumentAnalysis = {
      uri,
      ast,
      variables,
      imports,
      errors,
      lastAnalyzed: Date.now()
    };
    
    // Cache the result
    this.documentCache.set(uri, analysis);
    
    // Update diagnostics
    this.updateDiagnostics(document, errors);
    
    return analysis;
  }

  /**
   * Get cached analysis for a document
   */
  getCachedAnalysis(uri: string): DocumentAnalysis | undefined {
    return this.documentCache.get(uri);
  }

  /**
   * Find all variables available at a position (including imports)
   */
  async getAvailableVariables(document: vscode.TextDocument, position: vscode.Position): Promise<VariableInfo[]> {
    const analysis = await this.analyzeDocument(document);
    const availableVars = [...analysis.variables];
    
    // Add variables from imports
    for (const imp of analysis.imports) {
      const importedVars = await this.getImportedVariables(document, imp);
      availableVars.push(...importedVars);
    }
    
    // Filter variables defined before the position
    const offset = document.offsetAt(position);
    return availableVars.filter(v => v.location.offset < offset);
  }

  /**
   * Get variables from an imported file
   */
  private async getImportedVariables(document: vscode.TextDocument, imp: ImportInfo): Promise<VariableInfo[]> {
    const importPath = this.resolveImportPath(document, imp.path);
    if (!importPath) return [];
    
    try {
      const importDoc = await vscode.workspace.openTextDocument(importPath);
      const analysis = await this.analyzeDocument(importDoc);
      
      if (imp.type === 'all') {
        return analysis.variables;
      } else {
        // Filter to only selected variables
        return analysis.variables.filter(v => imp.variables.includes(v.name));
      }
    } catch (error) {
      console.error(`Failed to analyze import: ${imp.path}`, error);
      return [];
    }
  }

  /**
   * Resolve an import path relative to the document
   */
  private resolveImportPath(document: vscode.TextDocument, importPath: string): string | undefined {
    // Handle special variables
    if (importPath.startsWith('@PROJECTPATH')) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (workspaceFolder) {
        importPath = importPath.replace('@PROJECTPATH', workspaceFolder.uri.fsPath);
      }
    }
    
    // Resolve relative paths
    if (!path.isAbsolute(importPath)) {
      const docDir = path.dirname(document.uri.fsPath);
      importPath = path.join(docDir, importPath);
    }
    
    return importPath;
  }

  /**
   * Update diagnostics for a document
   */
  private updateDiagnostics(document: vscode.TextDocument, errors: ParseError[]) {
    const diagnostics: vscode.Diagnostic[] = errors.map(error => {
      const position = new vscode.Position(error.line - 1, error.column - 1);
      const range = new vscode.Range(position, position);
      
      return new vscode.Diagnostic(
        range,
        error.message,
        vscode.DiagnosticSeverity.Error
      );
    });
    
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Clear diagnostics for a document
   */
  clearDiagnostics(document: vscode.TextDocument) {
    this.diagnosticCollection.delete(document.uri);
    this.documentCache.delete(document.uri.toString());
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.diagnosticCollection.dispose();
    this.documentCache.clear();
  }
}

export interface DocumentAnalysis {
  uri: string;
  ast: any[];
  variables: VariableInfo[];
  imports: ImportInfo[];
  errors: ParseError[];
  lastAnalyzed: number;
}