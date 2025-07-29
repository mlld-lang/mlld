const vscode = require('vscode');
const {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} = require('vscode-languageclient/node');
const { spawn } = require('child_process');
const path = require('path');

let client;

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

  // Start the language server
  startLanguageServer(context);
  
  console.log('mlld extension activated with LSP support');
}

function startLanguageServer(context) {
  // Try to find mlld command in PATH first
  const serverCommand = 'mlld';
  const serverArgs = ['language-server'];
  
  // Server options - run the mlld language-server command
  const serverOptions = {
    run: {
      command: serverCommand,
      args: serverArgs,
      options: { shell: true }
    },
    debug: {
      command: serverCommand,
      args: serverArgs,
      options: { shell: true }
    }
  };

  // Options to control the language client
  const clientOptions = {
    // Register the server for mlld documents
    documentSelector: [{ scheme: 'file', language: 'mlld' }],
    synchronize: {
      // Notify the server about file changes to .mld and .mlld files in the workspace
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{mld,mlld}')
    },
    // Pass configuration to the language server
    initializationOptions: {
      // Can add custom initialization options here
    }
  };

  // Create the language client and start the client
  client = new LanguageClient(
    'mlldLanguageServer',
    'mlld Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start().catch(error => {
    vscode.window.showErrorMessage(
      `Failed to start mlld language server: ${error.message}\n\n` +
      `Make sure mlld is installed:\n` +
      `npm install -g mlld\n\n` +
      `If the error persists, the language server dependency may be missing.\n` +
      `Try reinstalling mlld or check the Output panel for details.`
    );
  });
}

function deactivate() {
  // Stop the language server
  if (client) {
    return client.stop();
  }
}

module.exports = {
  activate,
  deactivate
};