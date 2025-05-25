# Meld Language Server Implementation Plan

## Overview
Implement a Language Server Protocol (LSP) server for Meld that provides intelligent code assistance by reusing the existing parser, interpreter, and error infrastructure.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Meld Language Server                   │
├─────────────────────────────────────────────────────────────┤
│  DocumentManager    │  Analyzer         │  SymbolIndex       │
│  - Track open docs  │  - Parse docs     │  - Variable defs   │
│  - Handle changes   │  - Build AST      │  - Import graph    │
│  - Cache ASTs       │  - Track vars     │  - Cross-file refs │
├─────────────────────────────────────────────────────────────┤
│              Core Meld Infrastructure (Reused)               │
│  Parser │ Environment │ PathService │ Error System          │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Core Language Server (Week 1-2)

### 1.1 Project Structure
```
language-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts               # Main LSP server entry
│   ├── connection.ts           # LSP connection handling
│   ├── documents/
│   │   ├── DocumentManager.ts  # Track open documents
│   │   ├── DocumentAnalyzer.ts # Parse and analyze documents
│   │   └── DocumentCache.ts    # Cache ASTs and analysis
│   ├── analysis/
│   │   ├── VariableTracker.ts  # Track variable definitions/refs
│   │   ├── ImportResolver.ts   # Resolve import chains
│   │   ├── SymbolIndex.ts      # Global symbol tracking
│   │   └── DiagnosticEngine.ts # Convert errors to diagnostics
│   └── features/
│       ├── completion.ts       # Auto-completion
│       ├── definition.ts       # Go-to-definition
│       ├── hover.ts           # Hover information
│       ├── diagnostics.ts     # Error checking
│       └── semanticTokens.ts  # Syntax highlighting
└── client/
    └── vscode/                # VSCode client extension
```

### 1.2 Core Server Implementation

```typescript
// server.ts
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentManager } from './documents/DocumentManager';
import { AnalysisEngine } from './analysis/AnalysisEngine';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const documentManager = new DocumentManager();
const analysisEngine = new AnalysisEngine();

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['@', '{', '.', '[']
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      diagnosticProvider: {
        interFileDependencies: true,
        workspaceDiagnostics: true
      },
      semanticTokensProvider: {
        legend: getSemanticTokensLegend(),
        full: true,
        range: true
      }
    }
  };
});
```

### 1.3 Document Analysis Engine

```typescript
// DocumentAnalyzer.ts
import { parse } from '@grammar/parser';
import { Environment } from '@interpreter/env';
import { NodeType } from '@core/types';

export class DocumentAnalyzer {
  private ast: ParseResult | null = null;
  private environment: Environment;
  private variables: Map<string, VariableInfo> = new Map();
  private imports: ImportInfo[] = [];
  
  async analyze(document: TextDocument): Promise<AnalysisResult> {
    // Parse document
    const text = document.getText();
    this.ast = parse(text);
    
    // Create lightweight environment for analysis
    this.environment = new Environment({
      fileSystem: this.fileSystemProxy,
      pathService: this.pathService,
      // Don't execute commands, just track them
      commandExecutor: this.mockExecutor
    });
    
    // Walk AST and collect information
    await this.walkAST(this.ast.value);
    
    return {
      ast: this.ast,
      variables: this.variables,
      imports: this.imports,
      diagnostics: this.collectDiagnostics()
    };
  }
  
  private async walkAST(nodes: ASTNode[]) {
    for (const node of nodes) {
      switch (node.type) {
        case NodeType.TextDirective:
          this.trackVariable(node);
          break;
        case NodeType.ImportDirective:
          await this.trackImport(node);
          break;
        case NodeType.Variable:
          this.trackVariableReference(node);
          break;
        // ... handle other node types
      }
    }
  }
}
```

## Phase 2: Core Features (Week 2-3)

### 2.1 Diagnostics (Real-time Error Checking)

```typescript
// DiagnosticEngine.ts
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { MeldError } from '@core/errors';

export class DiagnosticEngine {
  convertToDiagnostics(errors: MeldError[]): Diagnostic[] {
    return errors.map(error => ({
      severity: this.getSeverity(error.severity),
      range: {
        start: {
          line: error.location.start.line - 1,
          character: error.location.start.column - 1
        },
        end: {
          line: error.location.end.line - 1,
          character: error.location.end.column - 1
        }
      },
      message: error.message,
      code: error.code,
      source: 'meld'
    }));
  }
  
  async validateDocument(analyzer: DocumentAnalyzer): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    // Check parse errors
    if (!analyzer.ast.success) {
      diagnostics.push(...this.convertToDiagnostics([analyzer.ast.error]));
    }
    
    // Check undefined variables
    for (const ref of analyzer.variableReferences) {
      if (!analyzer.variables.has(ref.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: ref.range,
          message: `Unknown variable: ${ref.name}`,
          code: 'undefined-variable'
        });
      }
    }
    
    // Check file paths
    for (const pathRef of analyzer.pathReferences) {
      if (!await this.fileExists(pathRef.path)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: pathRef.range,
          message: `File not found: ${pathRef.path}`,
          code: 'file-not-found'
        });
      }
    }
    
    return diagnostics;
  }
}
```

### 2.2 Auto-completion

```typescript
// completion.ts
export class CompletionProvider {
  async provideCompletions(
    document: TextDocument,
    position: Position,
    analyzer: DocumentAnalyzer
  ): Promise<CompletionItem[]> {
    const context = this.getContext(document, position);
    
    switch (context.type) {
      case 'directive':
        return this.getDirectiveCompletions();
        
      case 'variable':
        return this.getVariableCompletions(analyzer);
        
      case 'path':
        return this.getPathCompletions(context.prefix);
        
      case 'import':
        return this.getImportCompletions(analyzer);
    }
  }
  
  private getVariableCompletions(analyzer: DocumentAnalyzer): CompletionItem[] {
    const items: CompletionItem[] = [];
    
    // Add all available variables
    for (const [name, info] of analyzer.variables) {
      items.push({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: `${info.type}: ${this.getPreviewValue(info)}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.getVariableDocumentation(info)
        },
        insertText: name
      });
    }
    
    // Add imported variables
    for (const imp of analyzer.imports) {
      for (const variable of imp.exportedVariables) {
        items.push({
          label: variable.name,
          kind: CompletionItemKind.Variable,
          detail: `(imported from ${imp.source})`,
          insertText: variable.name
        });
      }
    }
    
    return items;
  }
}
```

### 2.3 Go-to-Definition

```typescript
// definition.ts
export class DefinitionProvider {
  async provideDefinition(
    document: TextDocument,
    position: Position,
    analyzer: DocumentAnalyzer
  ): Promise<Location | null> {
    const node = analyzer.getNodeAtPosition(position);
    
    if (node?.type === NodeType.Variable) {
      const variableName = node.name;
      
      // Check local definitions
      const localDef = analyzer.variables.get(variableName);
      if (localDef) {
        return {
          uri: document.uri,
          range: localDef.definitionRange
        };
      }
      
      // Check imports
      for (const imp of analyzer.imports) {
        const importedVar = imp.exportedVariables.find(v => v.name === variableName);
        if (importedVar) {
          return {
            uri: imp.fileUri,
            range: importedVar.range
          };
        }
      }
    }
    
    return null;
  }
}
```

### 2.4 Hover Information

```typescript
// hover.ts
export class HoverProvider {
  async provideHover(
    document: TextDocument,
    position: Position,
    analyzer: DocumentAnalyzer
  ): Promise<Hover | null> {
    const node = analyzer.getNodeAtPosition(position);
    
    if (node?.type === NodeType.Variable) {
      const info = analyzer.variables.get(node.name);
      if (info) {
        // Try to evaluate the variable value
        const value = await this.evaluateVariable(info, analyzer);
        
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: [
              `**${info.name}** *(${info.type})*`,
              '```meld',
              info.definition,
              '```',
              '',
              '**Value:**',
              '```',
              this.formatValue(value),
              '```'
            ].join('\n')
          },
          range: node.range
        };
      }
    }
    
    return null;
  }
}
```

## Phase 3: Advanced Features (Week 3-4)

### 3.1 Semantic Tokens (Smart Syntax Highlighting)

```typescript
// semanticTokens.ts
export class SemanticTokensProvider {
  async provideSemanticTokens(
    document: TextDocument,
    analyzer: DocumentAnalyzer
  ): Promise<SemanticTokens> {
    const builder = new SemanticTokensBuilder();
    
    // Walk AST and emit semantic tokens
    this.walkASTForTokens(analyzer.ast.value, builder, analyzer);
    
    return builder.build();
  }
  
  private walkASTForTokens(
    nodes: ASTNode[],
    builder: SemanticTokensBuilder,
    analyzer: DocumentAnalyzer
  ) {
    for (const node of nodes) {
      switch (node.type) {
        case NodeType.Variable:
          // Distinguish between defined/undefined variables
          const isDefined = analyzer.variables.has(node.name);
          builder.push(
            node.location.start.line - 1,
            node.location.start.column - 1,
            node.name.length,
            isDefined ? TokenTypes.variable : TokenTypes.unresolvedReference,
            isDefined ? [] : [TokenModifiers.deprecated]
          );
          break;
          
        case NodeType.TextDirective:
          // Mark read-only variables differently
          if (node.value.type === NodeType.PathValue) {
            builder.push(..., TokenModifiers.readonly);
          }
          break;
      }
    }
  }
}
```

### 3.2 Workspace-wide Analysis

```typescript
// SymbolIndex.ts
export class SymbolIndex {
  private symbols: Map<string, SymbolInfo[]> = new Map();
  private importGraph: Map<string, Set<string>> = new Map();
  
  async indexWorkspace(workspaceFolder: string) {
    const meldFiles = await this.findMeldFiles(workspaceFolder);
    
    for (const file of meldFiles) {
      const content = await fs.readFile(file, 'utf8');
      const analyzer = new DocumentAnalyzer();
      await analyzer.analyze(TextDocument.create(file, 'meld', 1, content));
      
      // Index symbols
      for (const [name, info] of analyzer.variables) {
        if (!this.symbols.has(name)) {
          this.symbols.set(name, []);
        }
        this.symbols.get(name)!.push({
          file,
          ...info
        });
      }
      
      // Build import graph
      this.importGraph.set(file, new Set(
        analyzer.imports.map(imp => imp.resolvedPath)
      ));
    }
  }
  
  findReferences(symbolName: string): Location[] {
    // Find all references across workspace
    const locations: Location[] = [];
    
    for (const [file, symbols] of this.symbols) {
      // ... find references
    }
    
    return locations;
  }
}
```

### 3.3 Code Actions (Quick Fixes)

```typescript
// codeActions.ts
export class CodeActionProvider {
  async provideCodeActions(
    document: TextDocument,
    range: Range,
    diagnostics: Diagnostic[]
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];
    
    for (const diagnostic of diagnostics) {
      if (diagnostic.code === 'undefined-variable') {
        // Offer to create the variable
        actions.push({
          title: `Create variable '${diagnostic.data.variableName}'`,
          kind: CodeActionKind.QuickFix,
          edit: {
            changes: {
              [document.uri]: [{
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                newText: `@text ${diagnostic.data.variableName} = ""\n`
              }]
            }
          }
        });
        
        // Offer similar variable names
        const similar = this.findSimilarVariables(diagnostic.data.variableName);
        for (const suggestion of similar) {
          actions.push({
            title: `Change to '${suggestion}'`,
            kind: CodeActionKind.QuickFix,
            edit: {
              changes: {
                [document.uri]: [{
                  range: diagnostic.range,
                  newText: suggestion
                }]
              }
            }
          });
        }
      }
    }
    
    return actions;
  }
}
```

## Phase 4: Client Extensions (Week 4)

### 4.1 VSCode Extension

```typescript
// client/vscode/src/extension.ts
import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js')
  );
  
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };
  
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'meld' },
      { scheme: 'file', language: 'markdown', pattern: '**/*.md' }
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.{meld,mld,md}')
    }
  };
  
  const client = new LanguageClient(
    'meldLanguageServer',
    'Meld Language Server',
    serverOptions,
    clientOptions
  );
  
  client.start();
}
```

### 4.2 Package Configuration

```json
// client/vscode/package.json
{
  "name": "meld-lsp",
  "displayName": "Meld Language Support",
  "description": "Rich language support for Meld files",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.75.0"
  },
  "categories": ["Programming Languages"],
  "activationEvents": [
    "onLanguage:meld",
    "onLanguage:markdown"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "languages": [{
      "id": "meld",
      "aliases": ["Meld", "meld"],
      "extensions": [".meld", ".mld"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "meld",
      "scopeName": "source.meld",
      "path": "./syntaxes/meld.tmLanguage.json"
    }],
    "configuration": {
      "title": "Meld",
      "properties": {
        "meld.trace.server": {
          "scope": "window",
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Traces the communication between VSCode and the language server."
        }
      }
    }
  }
}
```

## Phase 5: Testing & Optimization (Week 5)

### 5.1 Unit Tests

```typescript
// test/analyzer.test.ts
describe('DocumentAnalyzer', () => {
  it('should track variable definitions', async () => {
    const doc = TextDocument.create('test.meld', 'meld', 1, `
      @text greeting = "Hello"
      @data config = { name: "test" }
    `);
    
    const analyzer = new DocumentAnalyzer();
    const result = await analyzer.analyze(doc);
    
    expect(result.variables.size).toBe(2);
    expect(result.variables.get('greeting')).toMatchObject({
      type: 'text',
      value: 'Hello'
    });
  });
  
  it('should track imports', async () => {
    const doc = TextDocument.create('test.meld', 'meld', 1, `
      @import {config, utils} from [shared.meld]
    `);
    
    const analyzer = new DocumentAnalyzer();
    const result = await analyzer.analyze(doc);
    
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].variables).toEqual(['config', 'utils']);
  });
});
```

### 5.2 Performance Optimization

```typescript
// DocumentCache.ts
export class DocumentCache {
  private cache: LRUCache<string, CachedAnalysis> = new LRUCache({ max: 100 });
  
  async getAnalysis(document: TextDocument): Promise<AnalysisResult> {
    const key = document.uri;
    const cached = this.cache.get(key);
    
    if (cached && cached.version === document.version) {
      return cached.analysis;
    }
    
    // Incremental parsing for better performance
    if (cached && this.canUseIncremental(document, cached)) {
      const analysis = await this.incrementalAnalyze(document, cached);
      this.cache.set(key, { version: document.version, analysis });
      return analysis;
    }
    
    // Full analysis
    const analyzer = new DocumentAnalyzer();
    const analysis = await analyzer.analyze(document);
    this.cache.set(key, { version: document.version, analysis });
    return analysis;
  }
}
```

## Implementation Timeline

### Week 1-2: Core Infrastructure
- [ ] Set up project structure
- [ ] Implement basic server with document tracking
- [ ] Create DocumentAnalyzer using existing parser
- [ ] Basic diagnostics (parse errors)

### Week 2-3: Essential Features
- [ ] Variable completion
- [ ] Go-to-definition for variables
- [ ] Hover information
- [ ] Import resolution

### Week 3-4: Advanced Features
- [ ] Semantic tokens
- [ ] Workspace indexing
- [ ] Find references
- [ ] Code actions

### Week 4-5: Client & Testing
- [ ] VSCode extension
- [ ] Comprehensive tests
- [ ] Performance optimization
- [ ] Documentation

## Benefits Over Current Implementation

1. **Real-time Feedback**: Errors shown as you type
2. **Cross-file Intelligence**: Navigate imports, find all references
3. **Smart Completions**: Context-aware suggestions
4. **Accurate Highlighting**: Based on actual parsing, not regex
5. **Refactoring Support**: Rename across files
6. **Hover Previews**: See variable values without running

## Future Enhancements

1. **Execution Preview**: Show what commands would output
2. **Dependency Graph**: Visualize import relationships
3. **Formatting**: Auto-format Meld files
4. **Snippets**: Smart templates for common patterns
5. **Debug Adapter**: Step through Meld execution