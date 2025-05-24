import * as vscode from 'vscode';
import { DocumentAnalyzer } from './utils/document-analyzer';
import { MeldSemanticTokensProvider } from './providers/semantic-tokens';
import { MeldHoverProvider } from './providers/hover-provider';
import { MeldDefinitionProvider } from './providers/definition-provider';
import { MeldCompletionProvider } from './providers/completion-provider';

let analyzer: DocumentAnalyzer;

export function activate(context: vscode.ExtensionContext) {
  console.log('mlld extension is now active!');

  // Command to manually switch .md files to mlld mode
  const switchToMLLDCommand = vscode.commands.registerCommand('mlld.switchToMLLD', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.fileName.endsWith('.md')) {
      vscode.languages.setTextDocumentLanguage(editor.document, 'mlld');
    }
  });
  context.subscriptions.push(switchToMLLDCommand);

  // Initialize document analyzer
  analyzer = new DocumentAnalyzer();
  context.subscriptions.push(analyzer);

  // Register semantic tokens provider
  const semanticTokensProvider = new MeldSemanticTokensProvider(analyzer);
  const semanticTokensRegistration = vscode.languages.registerDocumentSemanticTokensProvider(
    { language: 'mlld' },
    semanticTokensProvider,
    semanticTokensProvider.getLegend()
  );
  context.subscriptions.push(semanticTokensRegistration);

  // Register hover provider
  const hoverProvider = new MeldHoverProvider(analyzer);
  const hoverRegistration = vscode.languages.registerHoverProvider(
    { language: 'mlld' },
    hoverProvider
  );
  context.subscriptions.push(hoverRegistration);

  // Register definition provider
  const definitionProvider = new MeldDefinitionProvider(analyzer);
  const definitionRegistration = vscode.languages.registerDefinitionProvider(
    { language: 'mlld' },
    definitionProvider
  );
  context.subscriptions.push(definitionRegistration);

  // Register completion provider
  const completionProvider = new MeldCompletionProvider(analyzer);
  const completionRegistration = vscode.languages.registerCompletionItemProvider(
    { language: 'mlld' },
    completionProvider,
    '@', '[', '{', '"', '#' // Trigger characters
  );
  context.subscriptions.push(completionRegistration);

  // Analyze open documents on activation
  vscode.workspace.textDocuments.forEach(doc => {
    if (doc.languageId === 'mlld') {
      analyzer.analyzeDocument(doc);
    } else if (doc.fileName.endsWith('.md') && doc.languageId === 'markdown') {
      detectAndSwitchToMLLD(doc);
    }
  });

  // Analyze documents when opened
  const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
    if (doc.languageId === 'mlld') {
      analyzer.analyzeDocument(doc);
    } else if (doc.fileName.endsWith('.md') && doc.languageId === 'markdown') {
      detectAndSwitchToMLLD(doc);
    }
  });
  context.subscriptions.push(openListener);

  // Re-analyze documents when changed
  const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId === 'mlld') {
      analyzer.analyzeDocument(event.document);
    }
  });
  context.subscriptions.push(changeListener);

  // Clear analysis when documents are closed
  const closeListener = vscode.workspace.onDidCloseTextDocument(doc => {
    if (doc.languageId === 'mlld') {
      analyzer.clearDiagnostics(doc);
    }
  });
  context.subscriptions.push(closeListener);

  // Register configuration change handler
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('mlld')) {
      console.log('MLLD configuration changed');
    }
  });
}

export function deactivate() {
  console.log('mlld extension is now deactivated');
}

/**
 * Detect if a markdown file contains mlld directives and switch to mlld mode
 */
function detectAndSwitchToMLLD(document: vscode.TextDocument) {
  // Only check first 100 lines for performance
  const linesToCheck = Math.min(100, document.lineCount);
  const text = document.getText(new vscode.Range(0, 0, linesToCheck, 0));
  
  // Check for mlld directives - the only patterns that activate mlld processing
  const mlldDirectivePattern = /^@(text|data|path|run|exec|add|import)\s+/m;
  const hasMLLDContent = mlldDirectivePattern.test(text);
  
  if (hasMLLDContent) {
    // Found mlld content, switch to mlld mode
    vscode.languages.setTextDocumentLanguage(document, 'mlld').then(
      () => {
        console.log(`Auto-detected mlld content in ${document.fileName}`);
        // Show notification
        vscode.window.showInformationMessage(
          'Detected mlld syntax. Switched to mlld mode.',
          'Keep as Markdown'
        ).then(selection => {
          if (selection === 'Keep as Markdown') {
            vscode.languages.setTextDocumentLanguage(document, 'markdown');
          }
        });
      },
      (err) => console.error(`Failed to switch to mlld mode: ${err}`)
    );
  }
}