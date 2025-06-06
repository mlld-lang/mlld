const vscode = require('vscode');

let analyzer;

function activate(context) {
  console.log('mlld extension is now active!');

  // Command to manually switch .md files to mlld mode
  const switchToMLLDCommand = vscode.commands.registerCommand('mlld.switchToMLLD', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.fileName.endsWith('.md')) {
      vscode.languages.setTextDocumentLanguage(editor.document, 'mlld');
    }
  });
  context.subscriptions.push(switchToMLLDCommand);

  // For now, we'll skip the advanced features that require TypeScript
  // These can be added back later as JavaScript modules
  console.log('mlld extension activated with basic syntax highlighting support');
}

function deactivate() {
  // Clean up
}

module.exports = {
  activate,
  deactivate
};