import * as vscode from 'vscode';
import { DocumentAnalyzer } from './utils/document-analyzer';
import { MeldSemanticTokensProvider } from './providers/semantic-tokens';
import { MeldHoverProvider } from './providers/hover-provider';
import { MeldDefinitionProvider } from './providers/definition-provider';
import { MeldCompletionProvider } from './providers/completion-provider';

let analyzer: DocumentAnalyzer;

export function activate(context: vscode.ExtensionContext) {
  console.log('Meld extension is now active!');

  // Command to set Meld mode for .md files
  const setMeldModeCommand = vscode.commands.registerCommand('meld.setMeldMode', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.fileName.endsWith('.md')) {
      vscode.languages.setTextDocumentLanguage(editor.document, 'meld');
    }
  });
  context.subscriptions.push(setMeldModeCommand);

  // Initialize document analyzer
  analyzer = new DocumentAnalyzer();
  context.subscriptions.push(analyzer);

  // Register semantic tokens provider
  const semanticTokensProvider = new MeldSemanticTokensProvider(analyzer);
  const semanticTokensRegistration = vscode.languages.registerDocumentSemanticTokensProvider(
    { language: 'meld' },
    semanticTokensProvider,
    semanticTokensProvider.getLegend()
  );
  context.subscriptions.push(semanticTokensRegistration);

  // Register hover provider
  const hoverProvider = new MeldHoverProvider(analyzer);
  const hoverRegistration = vscode.languages.registerHoverProvider(
    { language: 'meld' },
    hoverProvider
  );
  context.subscriptions.push(hoverRegistration);

  // Register definition provider
  const definitionProvider = new MeldDefinitionProvider(analyzer);
  const definitionRegistration = vscode.languages.registerDefinitionProvider(
    { language: 'meld' },
    definitionProvider
  );
  context.subscriptions.push(definitionRegistration);

  // Register completion provider
  const completionProvider = new MeldCompletionProvider(analyzer);
  const completionRegistration = vscode.languages.registerCompletionItemProvider(
    { language: 'meld' },
    completionProvider,
    '@', '[', '{', '"', '#' // Trigger characters
  );
  context.subscriptions.push(completionRegistration);

  // Analyze open documents on activation
  vscode.workspace.textDocuments.forEach(doc => {
    if (doc.languageId === 'meld') {
      analyzer.analyzeDocument(doc);
    } else if (doc.fileName.endsWith('.md')) {
      detectAndSetMeldMode(doc);
    }
  });

  // Analyze documents when opened
  const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
    if (doc.languageId === 'meld') {
      analyzer.analyzeDocument(doc);
    } else if (doc.fileName.endsWith('.md')) {
      detectAndSetMeldMode(doc);
    }
  });
  context.subscriptions.push(openListener);

  // Re-analyze documents when changed
  const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId === 'meld') {
      analyzer.analyzeDocument(event.document);
    }
  });
  context.subscriptions.push(changeListener);

  // Clear analysis when documents are closed
  const closeListener = vscode.workspace.onDidCloseTextDocument(doc => {
    if (doc.languageId === 'meld') {
      analyzer.clearDiagnostics(doc);
    }
  });
  context.subscriptions.push(closeListener);

  // Register configuration change handler
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('meld')) {
      console.log('Meld configuration changed');
    }
  });
}

export function deactivate() {
  console.log('Meld extension is now deactivated');
}

/**
 * Detect if a markdown file contains Meld directives and switch to Meld mode
 */
function detectAndSetMeldMode(document: vscode.TextDocument) {
  // Only check first 50 lines for performance
  const linesToCheck = Math.min(50, document.lineCount);
  const text = document.getText(new vscode.Range(0, 0, linesToCheck, 0));
  
  // Check for Meld directives
  const meldDirectivePattern = /^@(text|data|path|run|exec|add|import)\s+/m;
  const meldCommentPattern = /^>>/m;
  
  if (meldDirectivePattern.test(text) || meldCommentPattern.test(text)) {
    // Found Meld content, switch to Meld mode
    vscode.languages.setTextDocumentLanguage(document, 'meld').then(
      () => console.log(`Switched ${document.fileName} to Meld mode`),
      (err) => console.error(`Failed to switch to Meld mode: ${err}`)
    );
  }
}