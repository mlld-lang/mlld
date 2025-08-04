/**
 * mlld Language Server Implementation
 * 
 * This file contains the actual language server implementation.
 * It is dynamically imported only when vscode-languageserver is installed.
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  TextDocumentPositionParams,
  DefinitionParams,
  Definition,
  Location,
  Hover,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensParams,
  SemanticTokensRangeParams
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from '@grammar/parser';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from '@core/utils/logger';
import type { MlldLanguageServerConfig, VariableInfo, DocumentAnalysis, DocumentState } from './language-server';
import { ASTSemanticVisitor } from '@services/lsp/ASTSemanticVisitor';
import { initializePatterns, enhanceParseError } from '@core/errors/patterns/init';

// Semantic token types for mlld syntax
// Standard VSCode semantic token types we use
const TOKEN_TYPES = [
  'keyword',          // Keywords and directives
  'variable',         // Variables (declarations and references)
  'string',           // Strings, templates, file paths
  'operator',         // Operators and brackets
  'label',            // Labels for sections and languages
  'type',             // Types (used for XML tags)
  'parameter',        // Function parameters
  'comment',          // Comments
  'number',           // Numbers
  'property',         // Object properties
  'interface',        // Interfaces (file references)
  'typeParameter',    // Type parameters (file paths in sections)
  'namespace'         // Namespaces (section names)
];

// Map mlld-specific token names to standard types
// This allows visitors to use descriptive names while outputting standard types
const TOKEN_TYPE_MAP: Record<string, string> = {
  // mlld-specific mappings
  'directive': 'keyword',          // /var, /show, etc.
  'variableRef': 'variable',       // @variable references
  'interpolation': 'variable',     // @var in templates
  'template': 'operator',          // Template delimiters
  'templateContent': 'string',     // Template content
  'embedded': 'label',             // Language labels (js, python)
  'embeddedCode': 'string',        // Embedded code content
  'alligator': 'interface',        // File paths in <>
  'alligatorOpen': 'interface',    // < bracket
  'alligatorClose': 'interface',   // > bracket
  'xmlTag': 'type',                // XML tags
  'section': 'namespace',          // Section names
  'boolean': 'keyword',            // true/false
  'null': 'keyword',               // null
  // Standard types (pass through)
  'keyword': 'keyword',
  'variable': 'variable',
  'string': 'string',
  'operator': 'operator',
  'parameter': 'parameter',
  'comment': 'comment',
  'number': 'number',
  'property': 'property'
};

const TOKEN_MODIFIERS = [
  'declaration',      // variable declarations
  'reference',        // variable references
  'readonly',         // imported variables
  'interpolated',     // interpolated content
  'literal',          // literal strings (single quotes)
  'invalid',          // invalid syntax
  'deprecated'        // deprecated syntax
];

// Debounced processor for delayed validation and token generation
class DebouncedProcessor {
  private validationTimers = new Map<string, NodeJS.Timeout>();
  private tokenTimers = new Map<string, NodeJS.Timeout>();
  
  constructor(
    private validateFn: (document: TextDocument) => Promise<void>,
    private tokenFn: (document: TextDocument) => Promise<void>
  ) {}
  
  scheduleValidation(document: TextDocument, delay: number): void {
    const uri = document.uri;
    
    // Clear existing timer
    const existingTimer = this.validationTimers.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new timer
    const timer = setTimeout(async () => {
      this.validationTimers.delete(uri);
      await this.validateFn(document);
    }, delay);
    
    this.validationTimers.set(uri, timer);
  }
  
  scheduleTokenGeneration(document: TextDocument, delay: number): void {
    const uri = document.uri;
    
    // Clear existing timer
    const existingTimer = this.tokenTimers.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new timer
    const timer = setTimeout(async () => {
      this.tokenTimers.delete(uri);
      await this.tokenFn(document);
    }, delay);
    
    this.tokenTimers.set(uri, timer);
  }
  
  // Immediately process validation (for document open, etc.)
  async validateNow(document: TextDocument): Promise<void> {
    const uri = document.uri;
    
    // Clear any pending timer
    const existingTimer = this.validationTimers.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.validationTimers.delete(uri);
    }
    
    await this.validateFn(document);
  }
  
  // Clean up timers for closed documents
  clearTimers(uri: string): void {
    const validationTimer = this.validationTimers.get(uri);
    if (validationTimer) {
      clearTimeout(validationTimer);
      this.validationTimers.delete(uri);
    }
    
    const tokenTimer = this.tokenTimers.get(uri);
    if (tokenTimer) {
      clearTimeout(tokenTimer);
      this.tokenTimers.delete(uri);
    }
  }
}

export async function startLanguageServer(): Promise<void> {
  // Initialize error patterns for enhanced error messages
  await initializePatterns();
  
  // Create a connection for the server
  const connection = createConnection(ProposedFeatures.all);

  // Create a simple text document manager
  const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

  // Document analysis cache
  const documentCache = new Map<string, DocumentAnalysis>();
  
  // Document state tracking for graceful incomplete line handling
  const documentStates = new Map<string, DocumentState>();
  
  // File system services
  const fileSystem = new NodeFileSystem();
  const pathService = new PathService();

  let hasConfigurationCapability = false;
  let hasWorkspaceFolderCapability = false;
  let hasDiagnosticRelatedInformationCapability = false;

  const defaultSettings: MlldLanguageServerConfig = {
    maxNumberOfProblems: 100,
    enableAutocomplete: true,
    validationDelay: 1000,
    semanticTokenDelay: 250,
    showIncompleteLineErrors: false
  };
  let globalSettings: MlldLanguageServerConfig = defaultSettings;

  // Cache the settings of all open documents
  const documentSettings: Map<string, Thenable<MlldLanguageServerConfig>> = new Map();
  
  // Helper functions for document state management
  function getOrCreateDocumentState(uri: string): DocumentState {
    let state = documentStates.get(uri);
    if (!state) {
      state = {
        uri,
        version: 0,
        content: '',
        lastEditTime: Date.now()
      };
      documentStates.set(uri, state);
    }
    return state;
  }
  
  // Patterns that indicate incomplete typing
  const INCOMPLETE_ERROR_PATTERNS = [
    /Expected ".*" but found end of input/,
    /Expected .* but found newline/,
    /Unexpected end of input/,
    /Expected expression/,
    /Expected value/,
    /Unterminated string/,
    /Expected closing/,
    /Expected "="/,
    /Expected identifier/,
    /Expected ":" but found/,
    /Expected ">" but found/
  ];
  
  function isIncompleteLineError(error: any): boolean {
    if (!error?.message) return false;
    return INCOMPLETE_ERROR_PATTERNS.some(pattern => pattern.test(error.message));
  }
  
  function filterIncompleteLineErrors(
    errors: Diagnostic[],
    currentEditLine: number | undefined,
    timeSinceEdit: number,
    showIncompleteLineErrors: boolean
  ): Diagnostic[] {
    if (showIncompleteLineErrors || currentEditLine === undefined) {
      return errors;
    }
    
    return errors.filter(error => {
      // Always show errors on other lines
      if (error.range.start.line !== currentEditLine) {
        return true;
      }
      
      // If recently edited (within 2 seconds), check if it's an incomplete error
      if (timeSinceEdit < 2000) {
        // Check if the error message indicates incomplete typing
        const errorMessage = (error as any).message || error.message || '';
        return !INCOMPLETE_ERROR_PATTERNS.some(pattern => pattern.test(errorMessage));
      }
      
      return true;
    });
  }

  connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
      capabilities.textDocument &&
      capabilities.textDocument.publishDiagnostics &&
      capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
          triggerCharacters: ['@', '{', '[', ' ', '"']
        },
        hoverProvider: true,
        definitionProvider: true,
        semanticTokensProvider: {
          legend: {
            tokenTypes: TOKEN_TYPES,
            tokenModifiers: TOKEN_MODIFIERS
          },
          full: true,
          range: false // Start with full document only
        }
      }
    };

    if (hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true
        }
      };
    }

    return result;
  });

  connection.onInitialized(() => {
    connection.console.log('[LSP] Server initialized');
    connection.console.log('[LSP] Semantic tokens provider available: ' + (!!connection.languages.semanticTokens));
    
    if (hasConfigurationCapability) {
      // Register for all configuration changes
      connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
  });

  connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
      // Reset all cached document settings
      documentSettings.clear();
    } else {
      globalSettings = <MlldLanguageServerConfig>(
        (change.settings.mlldLanguageServer || defaultSettings)
      );
    }

    // Revalidate all open text documents
    documents.all().forEach(doc => debouncedProcessor.validateNow(doc));
  });

  function getDocumentSettings(resource: string): Thenable<MlldLanguageServerConfig> {
    if (!hasConfigurationCapability) {
      return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
      result = connection.workspace.getConfiguration({
        scopeUri: resource,
        section: 'mlldLanguageServer'
      }).then((config) => {
        // Ensure we always have valid settings
        return config || defaultSettings;
      });
      documentSettings.set(resource, result);
    }
    return result;
  }

  // Only keep settings for open documents
  documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
    documentCache.delete(e.document.uri);
    documentStates.delete(e.document.uri);
    debouncedProcessor.clearTimers(e.document.uri);
  });

  // The content of a text document has changed
  documents.onDidChangeContent(async (change) => {
    const document = change.document;
    const settings = await getDocumentSettings(document.uri) || defaultSettings;
    
    // Update document state with change info
    const state = getOrCreateDocumentState(document.uri);
    state.version = document.version;
    state.content = document.getText();
    
    // Track which line is being edited
    const changeEvent = (change as any);
    if (changeEvent.contentChanges && changeEvent.contentChanges.length > 0) {
      const firstChange = changeEvent.contentChanges[0];
      if (firstChange.range) {
        state.currentEditLine = firstChange.range.start.line;
        state.lastEditTime = Date.now();
      }
    }
    
    // Schedule debounced validation
    debouncedProcessor.scheduleValidation(
      document,
      settings.validationDelay ?? defaultSettings.validationDelay!
    );
    
    // Schedule debounced semantic token generation
    debouncedProcessor.scheduleTokenGeneration(
      document,
      settings.semanticTokenDelay ?? defaultSettings.semanticTokenDelay!
    );
  });

  async function validateDocument(textDocument: TextDocument): Promise<void> {
    const settings = await getDocumentSettings(textDocument.uri) || defaultSettings;
    const analysis = await analyzeDocument(textDocument);
    const state = getOrCreateDocumentState(textDocument.uri);
    
    // Filter errors based on incomplete line settings
    const timeSinceEdit = Date.now() - state.lastEditTime;
    const filteredErrors = filterIncompleteLineErrors(
      analysis.errors,
      state.currentEditLine,
      timeSinceEdit,
      settings.showIncompleteLineErrors ?? false
    );
    
    // Send diagnostics
    connection.sendDiagnostics({
      uri: textDocument.uri,
      diagnostics: filteredErrors.slice(0, settings.maxNumberOfProblems)
    });
  }
  
  // Wrapper function for semantic token generation
  async function generateSemanticTokensForDocument(document: TextDocument): Promise<void> {
    // This will be called by the debounced processor
    // We'll update the semantic token handler to use cached tokens on failure
    const state = getOrCreateDocumentState(document.uri);
    state.lastEditTime = Date.now(); // Mark that we're processing
  }
  
  // Create the debounced processor
  const debouncedProcessor = new DebouncedProcessor(
    validateDocument,
    generateSemanticTokensForDocument
  );

  async function analyzeDocument(document: TextDocument): Promise<DocumentAnalysis> {
    const cached = documentCache.get(document.uri);
    if (cached && cached.lastAnalyzed === document.version) {
      return cached;
    }

    const text = document.getText();
    const errors: Diagnostic[] = [];
    const variables = new Map<string, VariableInfo>();
    const imports: string[] = [];
    const exports: string[] = [];
    let ast: any[] = [];

    try {
      // Debug log to understand what we're parsing
      if (text.length === 0) {
        logger.warn('Attempting to parse empty document', { uri: document.uri });
        // Return empty analysis for empty documents
        const analysis: DocumentAnalysis = {
          ast: [],
          errors: [],
          variables,
          imports,
          exports,
          lastAnalyzed: document.version
        };
        documentCache.set(document.uri, analysis);
        return analysis;
      }
      
      const result = await parse(text);
      
      if (!result.success) {
        // Convert parse error to diagnostic
        const error = result.error;
        
        // Log the error for debugging
        logger.debug('Parse error, attempting fault-tolerant parsing', { 
          message: error.message, 
          line: error.line, 
          column: error.column,
          mlldErrorLocation: (error as any).mlldErrorLocation,
          textLength: text.length
        });
        
        // Enhance the parse error to get user-friendly message
        const enhancedError = await enhanceParseError(error as any, text, document.uri);
        
        // Check if error has detailed mlldErrorLocation
        const mlldError = error as any;
        let range: Range;
        
        if (mlldError.mlldErrorLocation) {
          // Use precise location from mlldErrorLocation
          const loc = mlldError.mlldErrorLocation;
          const startLine = (loc.start.line || 1) - 1;
          const startChar = (loc.start.column || 1) - 1;
          const endLine = (loc.end.line || 1) - 1;
          let endChar = (loc.end.column || 1) - 1;
          
          // If error starts at beginning of line (column 0), 
          // extend to end of line for better visibility
          if (startChar === 0 && startLine === endLine) {
            const lines = text.split('\n');
            if (lines[startLine]) {
              endChar = lines[startLine].length;
            }
          }
          
          range = {
            start: { line: startLine, character: startChar },
            end: { line: endLine, character: endChar }
          };
        } else if (enhancedError && enhancedError.location) {
          // Use location from enhanced error
          const loc = enhancedError.location;
          range = {
            start: { line: loc.line - 1, character: loc.column - 1 },
            end: { line: loc.line - 1, character: loc.column }
          };
        } else {
          // Fallback to basic line/column
          range = {
            start: { line: (error.line || 1) - 1, character: (error.column || 1) - 1 },
            end: { line: (error.line || 1) - 1, character: (error.column || 1) }
          };
        }
        
        // Use enhanced error message if available, otherwise fall back to original
        let formattedMessage = enhancedError ? enhancedError.message : (error.message || 'Parse error');
        
        // Replace escaped newlines with actual newlines for better formatting
        formattedMessage = formattedMessage.replace(/\\n/g, '\n');
        
        const diagnostic: Diagnostic = {
          severity: DiagnosticSeverity.Error,
          range,
          message: formattedMessage,
          source: 'mlld'
        };
        errors.push(diagnostic);
        
        // Attempt fault-tolerant parsing
        const partialAst = await attemptPartialParsing(text, error);
        ast = partialAst.nodes;
        errors.push(...partialAst.errors);
        
        // Analyze whatever we could parse
        if (ast.length > 0) {
          analyzeAST(ast, document, variables, imports, exports);
        }
      } else {
        // Full parse succeeded
        ast = result.ast;
        analyzeAST(ast, document, variables, imports, exports);
      }

      const analysis: DocumentAnalysis = {
        ast,
        errors,
        variables,
        imports,
        exports,
        lastAnalyzed: document.version
      };

      documentCache.set(document.uri, analysis);
      return analysis;
    } catch (error) {
      logger.error('Error analyzing document', { error, uri: document.uri });
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        message: `Failed to analyze document: ${error instanceof Error ? error.message : String(error)}`,
        source: 'mlld'
      };
      errors.push(diagnostic);
      
      const analysis: DocumentAnalysis = {
        ast: [],
        errors,
        variables,
        imports,
        exports,
        lastAnalyzed: document.version
      };
      
      documentCache.set(document.uri, analysis);
      return analysis;
    }
  }

  function analyzeAST(
    ast: any[], 
    document: TextDocument, 
    variables: Map<string, VariableInfo>, 
    imports: string[],
    exports: string[]
  ) {
    // Walk the AST to extract variables and imports
    for (const node of ast) {
      if (node.type === 'Directive') {
        const directive = node as any;
        
        if (directive.kind) {
          const line = directive.location?.start?.line || 1;
          const column = directive.location?.start?.column || 1;
          
          switch (directive.kind) {
            case 'var':
            case 'path':
            case 'exe':
              // Extract variable name
              const identifierNodes = directive.values?.identifier;
              if (identifierNodes && Array.isArray(identifierNodes)) {
                const varName = extractText(identifierNodes);
                if (varName) {
                  const varInfo: VariableInfo = {
                    name: varName,
                    kind: directive.kind as any,
                    location: {
                      uri: document.uri,
                      line: line - 1,
                      column: column - 1
                    },
                    source: 'local'
                  };
                  
                  // For exe directives, check if it has parameters (for foreach support)
                  if (directive.kind === 'exe' && directive.values?.params) {
                    (varInfo as any).hasParameters = true;
                    (varInfo as any).paramCount = Array.isArray(directive.values.params) ? directive.values.params.length : 1;
                  }
                  
                  // Check for shadow environment syntax: /exe name = { ... }
                  if (directive.kind === 'exe' && directive.values?.shadowEnv) {
                    (varInfo as any).isShadowEnvironment = true;
                  }
                  
                  variables.set(varName, varInfo);
                }
              }
              break;
              
            case 'import':
              // Extract import path
              const fromNodes = directive.values?.from;
              if (fromNodes) {
                const importPath = extractText(fromNodes);
                if (importPath) {
                  imports.push(importPath);
                }
              }
              break;
          }
        }
      }
    }
  }

  function extractText(nodes: any[]): string {
    // Simple text extraction from AST nodes
    let text = '';
    for (const node of nodes) {
      if (node.type === 'Text' && node.content) {
        text += node.content;
      } else if (node.values && Array.isArray(node.values)) {
        text += extractText(node.values);
      }
    }
    return text.trim();
  }

  // Completion
  connection.onCompletion(async (params: CompletionParams): Promise<CompletionItem[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const settings = await getDocumentSettings(params.textDocument.uri);
    if (!settings.enableAutocomplete) return [];

    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const beforeCursor = text.substring(0, offset);
    const line = text.substring(text.lastIndexOf('\n', offset - 1) + 1, offset);

    const completions: CompletionItem[] = [];

    // Check context for appropriate completions
    if (line.match(/\/$/)) {
      // After / - suggest directives
      completions.push(...getDirectiveCompletions());
    } else if (line.match(/@$/)) {
      // After @ - suggest variables and resolvers
      completions.push(...await getVariableCompletions(document));
      completions.push(...await getResolverCompletions(document));
    } else if (line.match(/\{\{[^}]*$/)) {
      // Inside template interpolation
      completions.push(...await getVariableCompletions(document, false));
    } else if (line.match(/\/var\s+$/)) {
      // After '/var ' - suggest @ prefix for variable creation
      completions.push({
        label: '@',
        kind: CompletionItemKind.Operator,
        detail: 'Variable name prefix',
        insertText: '@'
      });
    } else if (line.match(/\/run\s+$/)) {
      // After '/run ' - suggest language keywords or quote/brace
      completions.push(...getLanguageCompletions());
      completions.push({
        label: '"',
        kind: CompletionItemKind.Operator,
        detail: 'Quote for simple shell command',
        insertText: '"$1"',
        insertTextFormat: 2 // Snippet
      });
      completions.push({
        label: '{',
        kind: CompletionItemKind.Operator,
        detail: 'Braces for shell command',
        insertText: '{$1}',
        insertTextFormat: 2 // Snippet
      });
    } else if (line.match(/\/(\w*)$/)) {
      // Partial directive
      const partial = line.match(/\/(\w*)$/)?.[1] || '';
      completions.push(...getDirectiveCompletions().filter(c => c.label.startsWith(`/${partial}`)));
    } else if (line.match(/@\w*$/)) {
      // Partial variable or resolver
      const partial = line.match(/@(\w*)$/)?.[1] || '';
      completions.push(...(await getVariableCompletions(document)).filter(c => c.label.startsWith(`@${partial}`)));
      completions.push(...(await getResolverCompletions(document)).filter(c => c.label.startsWith(`@${partial}`)));
    } else if (line.match(/\[\s*$/)) {
      // After opening bracket - suggest files
      completions.push(...await getFileCompletions(document));
    } else if (line.match(/@[a-z]+\/$/)) {
      // After @author/ - suggest modules from that author
      const author = line.match(/@([a-z]+)\//)?.[1];
      if (author) {
        completions.push(...await getModulesForAuthor(document, author));
      }
    } else if (line.match(/from\s+@[A-Z]+$/)) {
      // After 'from @RESOLVER' - provide resolver-specific completions
      const resolver = line.match(/from\s+@([A-Z]+)$/)?.[1];
      if (resolver) {
        completions.push(...await getResolverImportCompletions(document, resolver));
      }
    } else if (line.match(/with\s*\{\s*$/)) {
      // After 'with {' - suggest with clause options
      completions.push(...getWithClauseCompletions());
    } else if (line.match(/foreach\s+@\w*$/)) {
      // After 'foreach @' - suggest parameterized exec/text commands
      completions.push(...await getParameterizedDefinitions(document));
    } else if (line.match(/foreach\s+@\w+\s*\($/)) {
      // After 'foreach @command(' - suggest array variables
      completions.push(...await getArrayVariableCompletions(document));
    } else if (line.match(/\/var\s+@\w+\s*=\s*$/)) {
      // After '/var @name = ' - suggest language keywords and value types
      completions.push(...getLanguageCompletions());
      completions.push({
        label: 'run',
        kind: CompletionItemKind.Keyword,
        detail: 'Execute command and capture output',
        insertText: 'run {$1}'
      });
      completions.push({
        label: '"',
        kind: CompletionItemKind.Operator,
        detail: 'String literal',
        insertText: '"$1"',
        insertTextFormat: 2
      });
      completions.push({
        label: '`',
        kind: CompletionItemKind.Operator,
        detail: 'Backtick template with @variable interpolation',
        insertText: '`$1`',
        insertTextFormat: 2
      });
      completions.push({
        label: '::',
        kind: CompletionItemKind.Operator,
        detail: 'Double-colon template with {{variable}} interpolation',
        insertText: '::$1::',
        insertTextFormat: 2
      });
    } else if (line.match(/\/var\s+@\w+\s*=\s*foreach/)) {
      // In a data foreach context - suggest parameterized definitions
      completions.push(...await getParameterizedDefinitions(document));
    }

    return completions;
  });

  function getDirectiveCompletions(): CompletionItem[] {
    const directives = [
      { name: '/var', desc: 'Define a variable (replaces @text/@data)' },
      { name: '/show', desc: 'Display content (replaces @add)' },
      { name: '/path', desc: 'Define a file path' },
      { name: '/run', desc: 'Execute a command' },
      { name: '/exe', desc: 'Define a reusable command (replaces @exec)' },
      { name: '/import', desc: 'Import from files or modules' },
      { name: '/when', desc: 'Conditional execution' },
      { name: '/output', desc: 'Define output target' }
    ];

    return directives.map(d => ({
      label: d.name,
      kind: CompletionItemKind.Keyword,
      detail: d.desc,
      insertText: d.name
    }));
  }

  function getLanguageCompletions(): CompletionItem[] {
    const languages = [
      { name: 'js', desc: 'JavaScript code execution' },
      { name: 'sh', desc: 'Shell script with full bash features' },
      { name: 'node', desc: 'Node.js execution' },
      { name: 'python', desc: 'Python code execution' }
    ];

    return languages.map(lang => ({
      label: lang.name,
      kind: CompletionItemKind.Keyword,
      detail: lang.desc,
      insertText: `${lang.name} {$1}`,
      insertTextFormat: 2 // Snippet
    }));
  }

  async function getVariableCompletions(document: TextDocument, includeAt = true): Promise<CompletionItem[]> {
    const analysis = await analyzeDocument(document);
    const completions: CompletionItem[] = [];

    // Add user-defined variables
    for (const [name, variable] of analysis.variables) {
      completions.push({
        label: includeAt ? `@${name}` : name,
        kind: CompletionItemKind.Variable,
        detail: `${variable.kind} variable`,
        insertText: includeAt ? `@${name}` : name
      });
    }

    // Add reserved variables that work as direct references (not resolvers)
    const reservedVars = [
      { name: 'PROJECTPATH', desc: 'Project root directory path' },
      { name: '.', desc: 'Shorthand for @PROJECTPATH' },
      // Lowercase variants
      { name: 'projectpath', desc: 'Project root (lowercase variant)' }
    ];

    if (includeAt) {
      reservedVars.forEach(v => {
        completions.push({
          label: `@${v.name}`,
          kind: CompletionItemKind.Constant,
          detail: `Reserved: ${v.desc}`,
          insertText: `@${v.name}`
        });
      });
    }

    return completions;
  }

  async function getFileCompletions(document: TextDocument): Promise<CompletionItem[]> {
    const completions: CompletionItem[] = [];
    const docPath = document.uri.replace('file://', '');
    const docDir = path.dirname(docPath);

    try {
      const files = await fs.readdir(docDir);
      
      for (const file of files) {
        if (file.endsWith('.mld') || file.endsWith('.md')) {
          completions.push({
            label: file,
            kind: CompletionItemKind.File,
            detail: 'mlld/markdown file',
            insertText: file
          });
        }
      }
    } catch (error) {
      logger.error('Error reading directory for file completions', { error, dir: docDir });
    }

    return completions;
  }

  async function getResolverCompletions(document: TextDocument): Promise<CompletionItem[]> {
    const completions: CompletionItem[] = [];
    
    // Built-in resolvers
    const builtinResolvers = [
      { name: 'TIME', desc: 'Import formatted timestamps' },
      { name: 'INPUT', desc: 'Import from stdin or environment variables' },
      { name: 'DEBUG', desc: 'Import debug information' },
      { name: 'PROJECTPATH', desc: 'Access project files' }
    ];
    
    builtinResolvers.forEach(r => {
      completions.push({
        label: `@${r.name}`,
        kind: CompletionItemKind.Module,
        detail: `Resolver: ${r.desc}`,
        insertText: `@${r.name}`
      });
    });
    
    // Custom resolvers from mlld.lock.json
    const lockFile = await getLockFile(document);
    if (lockFile?.resolvers) {
      Object.keys(lockFile.resolvers).forEach(resolver => {
        completions.push({
          label: resolver,
          kind: CompletionItemKind.Module,
          detail: `Custom resolver: ${lockFile.resolvers[resolver].description || resolver}`,
          insertText: resolver
        });
      });
    }
    
    return completions;
  }
  
  async function getModulesForAuthor(document: TextDocument, author: string): Promise<CompletionItem[]> {
    const completions: CompletionItem[] = [];
    
    // Check local cache first
    const cacheDir = path.join(path.dirname(document.uri.replace('file://', '')), '.mlld-cache');
    const registryPath = path.join(cacheDir, 'registries', author, 'registry.json');
    
    try {
      if (await fileSystem.exists(registryPath)) {
        const registryContent = await fileSystem.readFile(registryPath);
        const registry = JSON.parse(registryContent);
        
        if (registry.modules) {
          Object.keys(registry.modules).forEach(name => {
            const module = registry.modules[name];
            completions.push({
              label: name,
              kind: CompletionItemKind.Module,
              detail: module.description || `Module from @${author}`,
              insertText: name,
              documentation: module.source?.url
            });
          });
        }
      }
    } catch (error) {
      logger.error('Error reading module registry', { error, author });
    }
    
    // Also check mlld.lock.json for installed modules
    const lockFile = await getLockFile(document);
    if (lockFile?.modules) {
      Object.keys(lockFile.modules).forEach(moduleKey => {
        if (moduleKey.startsWith(`@${author}/`)) {
          const moduleName = moduleKey.substring(author.length + 2);
          completions.push({
            label: moduleName,
            kind: CompletionItemKind.Module,
            detail: `Installed module from @${author}`,
            insertText: moduleName
          });
        }
      });
    }
    
    return completions;
  }
  
  async function getResolverImportCompletions(document: TextDocument, resolver: string): Promise<CompletionItem[]> {
    const completions: CompletionItem[] = [];
    
    switch (resolver) {
      case 'TIME':
        // Common time format imports
        completions.push(
          { label: 'iso', kind: CompletionItemKind.Field, detail: 'ISO 8601 timestamp' },
          { label: 'unix', kind: CompletionItemKind.Field, detail: 'Unix timestamp' },
          { label: '"YYYY-MM-DD"', kind: CompletionItemKind.Field, detail: 'Date format', insertText: '"YYYY-MM-DD"' },
          { label: '"HH:mm:ss"', kind: CompletionItemKind.Field, detail: 'Time format', insertText: '"HH:mm:ss"' },
          { label: '"YYYY-MM-DD HH:mm:ss"', kind: CompletionItemKind.Field, detail: 'DateTime format', insertText: '"YYYY-MM-DD HH:mm:ss"' }
        );
        break;
        
      case 'INPUT':
        // Suggest environment variables from mlld.lock.json
        const lockFile = await getLockFile(document);
        if (lockFile?.security?.allowedEnv) {
          lockFile.security.allowedEnv.forEach((envVar: string) => {
            completions.push({
              label: envVar,
              kind: CompletionItemKind.EnumMember,
              detail: `Environment variable: ${envVar}`,
              insertText: envVar
            });
          });
        }
        
        // Also add common JSON fields
        completions.push(
          { label: 'content', kind: CompletionItemKind.Field, detail: 'Raw stdin content' },
          { label: 'config', kind: CompletionItemKind.Field, detail: 'Config from JSON stdin' },
          { label: 'data', kind: CompletionItemKind.Field, detail: 'Data from JSON stdin' }
        );
        break;
        
      case 'DEBUG':
        completions.push(
          { label: 'environment', kind: CompletionItemKind.Field, detail: 'Full environment info' },
          { label: 'variables', kind: CompletionItemKind.Field, detail: 'Current variables' },
          { label: 'imports', kind: CompletionItemKind.Field, detail: 'Import history' }
        );
        break;
    }
    
    return completions;
  }
  
  function getWithClauseCompletions(): CompletionItem[] {
    return [
      {
        label: 'pipeline',
        kind: CompletionItemKind.Property,
        detail: 'Transform output through commands',
        insertText: 'pipeline: [@$1]'
      },
      {
        label: 'needs',
        kind: CompletionItemKind.Property,
        detail: 'Validate dependencies',
        insertText: 'needs: { $1 }'
      }
    ];
  }
  
  async function getArrayVariableCompletions(document: TextDocument): Promise<CompletionItem[]> {
    const analysis = await analyzeDocument(document);
    const completions: CompletionItem[] = [];
    
    // Find variables that are arrays (data directives)
    for (const [name, variable] of analysis.variables) {
      if (variable.kind === 'var') {
        completions.push({
          label: `@${name}`,
          kind: CompletionItemKind.Variable,
          detail: 'Variable (may be array)',
          insertText: `@${name}`
        });
      }
    }
    
    return completions;
  }
  
  async function getParameterizedDefinitions(document: TextDocument): Promise<CompletionItem[]> {
    const analysis = await analyzeDocument(document);
    const completions: CompletionItem[] = [];
    
    // Find exec and text variables that have parameters
    for (const [name, variable] of analysis.variables) {
      if (variable.kind === 'exe' && (variable as any).hasParameters) {
        const paramCount = (variable as any).paramCount || 0;
        completions.push({
          label: `@${name}`,
          kind: CompletionItemKind.Function,
          detail: `Exec command with ${paramCount} parameter${paramCount !== 1 ? 's' : ''}`,
          insertText: `@${name}`
        });
      } else if (variable.kind === 'var' && (variable as any).hasParameters) {
        completions.push({
          label: `@${name}`,
          kind: CompletionItemKind.Function,
          detail: 'Text template with parameters',
          insertText: `@${name}`
        });
      }
    }
    
    return completions;
  }
  
  async function getLockFile(document: TextDocument): Promise<any> {
    try {
      const docPath = document.uri.replace('file://', '');
      const docDir = path.dirname(docPath);
      
      // Search for mlld.lock.json up the directory tree
      let currentDir = docDir;
      while (currentDir !== path.dirname(currentDir)) {
        const lockPath = path.join(currentDir, 'mlld.lock.json');
        if (await fileSystem.exists(lockPath)) {
          const content = await fileSystem.readFile(lockPath);
          return JSON.parse(content);
        }
        currentDir = path.dirname(currentDir);
      }
    } catch (error) {
      logger.error('Error reading mlld.lock.json', { error });
    }
    
    return null;
  }

  connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    // Add documentation if needed
    if (item.data === 1) {
      item.detail = 'mlld directive';
      item.documentation = 'Use this directive to define variables and execute commands';
    }
    return item;
  });

  // Hover
  connection.onHover(async (params: TextDocumentPositionParams): Promise<Hover | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const analysis = await analyzeDocument(document);
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    
    // Find word at position
    const wordRange = getWordRangeAtPosition(text, offset);
    if (!wordRange) return null;
    
    const word = text.substring(wordRange.start, wordRange.end);
    
    // Check if it's a variable
    if (word.startsWith('@')) {
      const varName = word.substring(1);
      const variable = analysis.variables.get(varName);
      
      if (variable) {
        return {
          contents: {
            kind: 'markdown',
            value: `**${variable.kind} variable**: \`@${varName}\`\n\nSource: ${variable.source}`
          }
        };
      }
    }

    return null;
  });

  // Go to Definition
  connection.onDefinition(async (params: DefinitionParams): Promise<Definition | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const analysis = await analyzeDocument(document);
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    
    // Find word at position
    const wordRange = getWordRangeAtPosition(text, offset);
    if (!wordRange) return null;
    
    const word = text.substring(wordRange.start, wordRange.end);
    
    // Check if it's a variable reference
    if (word.startsWith('@')) {
      const varName = word.substring(1);
      const variable = analysis.variables.get(varName);
      
      if (variable) {
        return Location.create(
          variable.location.uri,
          Range.create(
            Position.create(variable.location.line, variable.location.column),
            Position.create(variable.location.line, variable.location.column + varName.length)
          )
        );
      }
    }

    return null;
  });

  function getWordRangeAtPosition(text: string, offset: number): { start: number; end: number } | null {
    // Find word boundaries
    let start = offset;
    let end = offset;
    
    // Expand left
    while (start > 0 && /[@\w]/.test(text[start - 1])) {
      start--;
    }
    
    // Expand right
    while (end < text.length && /[@\w]/.test(text[end])) {
      end++;
    }
    
    if (start === end) return null;
    
    return { start, end };
  }

  // Semantic Tokens Provider
  connection.languages.semanticTokens.on(async (params: SemanticTokensParams): Promise<SemanticTokens> => {
    connection.console.log(`[SEMANTIC] Tokens requested for ${params.textDocument.uri}`);
    logger.debug('Semantic tokens requested', { uri: params.textDocument.uri });
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      connection.console.log(`[SEMANTIC] Document not found: ${params.textDocument.uri}`);
      return { data: [] };
    }

    const state = getOrCreateDocumentState(document.uri);
    
    try {
      const analysis = await analyzeDocument(document);
      const builder = new SemanticTokensBuilder();
      
      connection.console.log(`[SEMANTIC] Processing AST with ${analysis.ast.length} nodes, ${analysis.errors.length} errors`);
      connection.console.log(`[SEMANTIC] Using TOKEN_TYPES: ${TOKEN_TYPES.join(', ')}`);
      logger.debug('Processing semantic tokens', { 
        uri: params.textDocument.uri,
        astLength: analysis.ast.length,
        hasErrors: analysis.errors.length > 0
      });
      
      // Process the AST to generate semantic tokens
      await processASTForSemanticTokens(analysis.ast, document, builder);
      
      const tokens = builder.build();
      const tokenCount = tokens.data.length / 5; // Each token is 5 integers
      connection.console.log(`[SEMANTIC] Built ${tokenCount} tokens`);
      logger.debug('Semantic tokens built', { 
        uri: params.textDocument.uri,
        tokenCount: tokenCount
      });
      
      // Cache the successful tokens
      state.lastValidTokens = tokens;
      state.lastValidAST = analysis.ast;
      
      return tokens;
    } catch (error) {
      connection.console.log(`[SEMANTIC] Error generating tokens, using cached tokens if available`);
      logger.error('Error generating semantic tokens, falling back to cache', {
        error: error.message,
        uri: document.uri
      });
      
      // If we have cached tokens, return them
      if (state.lastValidTokens) {
        connection.console.log(`[SEMANTIC] Returning cached tokens`);
        return state.lastValidTokens;
      }
      
      // No cached tokens available
      return { data: [] };
    }
  });

  async function processASTForSemanticTokens(
    ast: any[],
    document: TextDocument,
    builder: SemanticTokensBuilder
  ): Promise<void> {
    try {
      // Use the AST visitor for comprehensive semantic token generation
      const visitor = new ASTSemanticVisitor(document, builder, TOKEN_TYPES, TOKEN_MODIFIERS, TOKEN_TYPE_MAP);
      await visitor.visitAST(ast);
    } catch (error) {
      connection.console.error(`[SEMANTIC-ERROR] Error processing AST for semantic tokens: ${error.message}`);
      connection.console.error(`[SEMANTIC-ERROR] Stack trace: ${error.stack}`);
      logger.error('Error in semantic token processing', {
        error: error.message,
        stack: error.stack,
        uri: document.uri
      });
      // Don't re-throw - return partial results instead of crashing
    }
  }

  /**
   * Attempts to parse a document line by line or section by section
   * to recover as much valid AST as possible when the full parse fails
   */
  async function attemptPartialParsing(
    text: string, 
    originalError: any
  ): Promise<{ nodes: any[], errors: Diagnostic[] }> {
    const nodes: any[] = [];
    const errors: Diagnostic[] = [];
    const lines = text.split('\n');
    
    // Try to parse up to the error location first
    if (originalError.line && originalError.line > 1) {
      const textBeforeError = lines.slice(0, originalError.line - 1).join('\n');
      if (textBeforeError.trim()) {
        try {
          const result = await parse(textBeforeError);
          if (result.success) {
            nodes.push(...result.ast);
          }
        } catch (e) {
          // Ignore - we're doing best effort
        }
      }
    }
    
    // Try to parse individual top-level constructs
    let currentBlock = '';
    let blockStartLine = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) {
        continue;
      }
      
      // Check if this is a new top-level construct
      const isTopLevel = trimmedLine.startsWith('/') || 
                        trimmedLine.startsWith('>>') ||
                        trimmedLine.startsWith('---') || // frontmatter
                        trimmedLine.startsWith('```'); // code fence
      
      if (isTopLevel && currentBlock) {
        // Try to parse the previous block
        await tryParseBlock(currentBlock, blockStartLine, nodes, errors);
        currentBlock = '';
      }
      
      if (isTopLevel) {
        blockStartLine = i;
      }
      
      currentBlock += (currentBlock ? '\n' : '') + line;
    }
    
    // Parse any remaining block
    if (currentBlock) {
      await tryParseBlock(currentBlock, blockStartLine, nodes, errors);
    }
    
    return { nodes, errors };
  }
  
  async function tryParseBlock(
    block: string, 
    startLine: number, 
    nodes: any[], 
    errors: Diagnostic[]
  ): Promise<void> {
    try {
      const result = await parse(block);
      if (result.success && result.ast.length > 0) {
        // Adjust line numbers in the AST
        adjustLineNumbers(result.ast, startLine);
        nodes.push(...result.ast);
      }
    } catch (e: any) {
      // Record error but continue
      errors.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: startLine, character: 0 },
          end: { line: startLine, character: block.indexOf('\n') > 0 ? block.indexOf('\n') : block.length }
        },
        message: `Syntax error in block: ${e.message || 'Unknown error'}`,
        source: 'mlld'
      });
    }
  }
  
  function adjustLineNumbers(ast: any[], offset: number): void {
    // Recursively adjust line numbers in AST nodes
    function adjustNode(node: any): void {
      if (node && typeof node === 'object') {
        if (node.location) {
          if (node.location.start) {
            node.location.start.line += offset;
          }
          if (node.location.end) {
            node.location.end.line += offset;
          }
        }
        
        // Recursively process child nodes
        for (const key in node) {
          const value = node[key];
          if (Array.isArray(value)) {
            value.forEach(adjustNode);
          } else if (value && typeof value === 'object') {
            adjustNode(value);
          }
        }
      }
    }
    
    ast.forEach(adjustNode);
  }

  // Make the connection listen on the input/output streams
  documents.listen(connection);
  connection.listen();
  
  // Log that the server started
  connection.console.log('mlld language server started');
  connection.console.log('Semantic tokens provider registered: ' + (!!connection.languages.semanticTokens));
}