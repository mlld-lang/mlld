/**
 * mlld Language Server Implementation
 * 
 * This file implements the Language Server Protocol (LSP) for mlld, providing
 * intelligent features like autocomplete, hover, go-to-definition, and diagnostics
 * for mlld files in any LSP-compatible editor.
 * 
 * NOTE: This requires the 'vscode-languageserver' package to be installed:
 * npm install --save-dev vscode-languageserver
 */

import { logger } from '@core/utils/logger';

// Command entry point
export async function languageServerCommand(args?: string[]): Promise<void> {
  // The --stdio flag is passed by VSCode and other editors
  // We don't need to do anything special with it as the connection
  // will be set up automatically via stdio
  const hasStdio = args?.includes('--stdio');

  // vscode-languageserver is now bundled, so we can start directly
  try {
    const { startLanguageServer } = await import('./language-server-impl');
    await startLanguageServer();
  } catch (error) {
    console.error('Failed to start language server:', error);
    process.exit(1);
  }
}

/**
 * Language Server Architecture Overview
 * 
 * The mlld language server provides the following capabilities:
 * 
 * 1. Document Synchronization
 *    - Tracks open mlld files
 *    - Parses documents using the mlld grammar
 *    - Caches AST and analysis results
 * 
 * 2. Diagnostics (Error Reporting)
 *    - Parse errors with line/column information
 *    - Undefined variable warnings
 *    - Import resolution errors
 * 
 * 3. Completion (Autocomplete)
 *    - Directives: /var, /show, /run, etc.
 *    - Variables: @varname references
 *    - File paths: [./file.mld] completions
 *    - Template variables: {{varname}} in templates
 *    - Section headers: "Section Name" from [file.md]
 * 
 * 4. Hover Information
 *    - Variable type and value
 *    - Directive documentation
 *    - Import source information
 * 
 * 5. Go to Definition
 *    - Jump to variable declarations
 *    - Navigate to import sources
 *    - Find exec command definitions
 * 
 * 6. Document Analysis
 *    - Variable tracking across files
 *    - Import graph resolution
 *    - Dependency analysis
 * 
 * Implementation Notes:
 * - Uses the actual mlld parser for accurate analysis
 * - Implements incremental parsing for performance
 * - Caches analysis results to avoid re-parsing
 * - Supports workspace-wide analysis for imports
 * - Configurable via editor settings
 */

// Type definitions for when the package is installed
export interface MlldLanguageServerConfig {
  maxNumberOfProblems: number;
  enableAutocomplete: boolean;
  projectPath?: string;
  includePaths?: string[];
  // Graceful incomplete line handling
  validationDelay?: number;           // Default: 1000ms
  semanticTokenDelay?: number;        // Default: 250ms
  showIncompleteLineErrors?: boolean; // Default: false
}

export interface VariableInfo {
  name: string;
  kind: 'var' | 'path' | 'exe';
  value?: any;
  location: {
    uri: string;
    line: number;
    column: number;
  };
  source: 'local' | 'imported';
  importPath?: string;
}

export interface DocumentAnalysis {
  ast: any[];
  errors: any[];
  variables: Map<string, VariableInfo>;
  imports: string[];
  exports: string[];
  lastAnalyzed: number;
}

export interface DocumentState {
  uri: string;
  version: number;
  content: string;
  lastValidAST?: any[];
  lastValidTokens?: any; // SemanticTokens data
  currentEditLine?: number;
  lastEditTime: number;
  mode?: import('@core/types/mode').MlldMode;
}