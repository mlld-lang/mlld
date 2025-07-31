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
  
  console.log(`Language server command: ${serverCommand} ${serverArgs.join(' ')}`);
  
  // Server options - run the mlld language-server command
  const serverOptions = {
    run: {
      command: serverCommand,
      args: serverArgs,
      transport: TransportKind.stdio
    },
    debug: {
      command: serverCommand,
      args: serverArgs,
      transport: TransportKind.stdio,
      options: {
        execArgv: ['--nolazy', '--inspect=6009']
      }
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
    },
    // Enable semantic tokens
    semanticTokens: {
      augmentsSyntaxTokens: false, // Don't merge with TextMate tokens
      multilineTokenSupport: true,
      overlappingTokenSupport: false,
      tokenTypes: ['directive', 'variable', 'variableRef', 'interpolation', 'template', 'templateContent', 'operator', 'keyword', 'embedded', 'embeddedCode', 'alligator', 'xmlTag', 'section', 'parameter', 'comment', 'string', 'number', 'boolean', 'null', 'property'],
      tokenModifiers: ['declaration', 'reference', 'readonly', 'interpolated', 'literal', 'invalid', 'deprecated']
    },
    middleware: {
      // Ensure semantic tokens are enabled
      provideDocumentSemanticTokens: (document, token, next) => {
        console.log('[EXTENSION] Semantic tokens requested for', document.uri.toString());
        const result = next(document, token);
        result.then(tokens => {
          console.log('[EXTENSION] Semantic tokens received:', tokens ? 'yes' : 'no');
          if (tokens && tokens.data) {
            console.log('[EXTENSION] Token count:', tokens.data.length / 5);
          }
        }).catch(err => {
          console.error('[EXTENSION] Semantic tokens error:', err);
        });
        return result;
      }
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
  console.log('Starting mlld language server client...');
  client.start().then(() => {
    console.log('mlld language server started successfully');
    
    // Check if semantic tokens are supported
    const capabilities = client.initializeResult?.capabilities;
    console.log('[EXTENSION] Server capabilities:', capabilities);
    console.log('[EXTENSION] Semantic tokens provider:', capabilities?.semanticTokensProvider);
    
    // VSCode will automatically request semantic tokens when needed
    // No need to force refresh - this was causing duplicate requests
  }).catch(error => {
    console.error('Failed to start mlld language server:', error);
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