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

function applyDefaultSemanticTokenColors() {
  const config = vscode.workspace.getConfiguration();
  const currentCustomizations = config.get('editor.tokenColorCustomizations') || {};
  
  // Default colors for mlld-specific semantic tokens
  const mlldDefaults = {
    // Alligator syntax (file references)
    "alligator": "#4EC9B0",            // Cyan - the file path
    "alligatorOpen": "#808080",        // Gray - < bracket
    "alligatorClose": "#808080",       // Gray - > bracket
    
    // XML-like tags in triple-colon templates
    "xmlTag": "#569CD6",               // Blue - tag names
    
    // Sections in file references
    "section": "#DCDCAA",              // Yellow - section names
    
    // Function/exe parameters
    "parameter": "#9CDCFE",            // Light blue - parameter names
    
    // Other mlld-specific tokens
    "directive": "#C586C0",            // Purple - /var, /show, etc.
    "variableRef": "#9CDCFE",          // Light blue - @variable references
    "interpolation": "#CE9178",        // Orange - interpolated variables
    "templateContent": "#CE9178",      // Orange - template content
    "embedded": "#4EC9B0",             // Cyan - embedded language indicator
    "embeddedCode": "#D4D4D4",         // Light gray - embedded code
    
    // Standard tokens that themes might not color in our context
    "keyword": "#569CD6",              // Blue - as, first, all, any, etc.
    "string": "#CE9178",               // Orange - string literals
    "operator": "#D4D4D4",             // Light gray - =, >, <, etc.
    "template": "#569CD6",             // Blue - template delimiters
    "variable": "#9CDCFE",             // Light blue - variable declarations
    "comment": "#6A9955",              // Green - comments
    "number": "#B5CEA8",               // Light green - numbers
    "boolean": "#569CD6",              // Blue - true/false
    "null": "#569CD6",                 // Blue - null
    "property": "#9CDCFE"              // Light blue - object properties
  };
  
  // Merge with existing customizations
  const semanticTokenColors = {
    ...mlldDefaults,
    ...(currentCustomizations.semanticHighlighting?.['[*]']?.semanticTokenColors || {})
  };
  
  // Apply the colors
  const newCustomizations = {
    ...currentCustomizations,
    "semanticHighlighting": true,
    "[*]": {
      ...currentCustomizations['[*]'],
      "semanticTokenColors": semanticTokenColors
    }
  };
  
  // Update the configuration
  config.update('editor.tokenColorCustomizations', newCustomizations, vscode.ConfigurationTarget.Global);
}

function activate(context) {
  console.log('mlld extension is now active!');

  // Don't apply default colors - let the theme handle it
  // applyDefaultSemanticTokenColors();

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
    // Enable semantic tokens using standard VSCode types
    semanticTokens: {
      augmentsSyntaxTokens: false, // Don't merge with TextMate tokens
      multilineTokenSupport: true,
      overlappingTokenSupport: false,
      tokenTypes: ['keyword', 'variable', 'string', 'operator', 'label', 'type', 'parameter', 'comment', 'number', 'property'],
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