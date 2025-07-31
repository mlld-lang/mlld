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
  
  // Check if vscode-languageserver is installed
  try {
    // Dynamic import to check if the package exists
    const lspModule = await import('vscode-languageserver/node.js').catch(() => null);
    
    if (!lspModule) {
      console.error('Error: Language server dependencies not installed.');
      console.error('\nTo fix this, try one of the following:');
      console.error('1. Reinstall mlld: npm install -g mlld');
      console.error('2. Install locally: npm install mlld');
      console.error('3. Install the dependency directly: npm install vscode-languageserver');
      console.error('\nThe mlld language server provides intelligent features like:');
      console.error('- Syntax validation and error reporting');
      console.error('- Autocomplete for directives, variables, and file paths');
      console.error('- Hover information for variables');
      console.error('- Go-to-definition for variables');
      console.error('- Import resolution and multi-file analysis');
      console.error('- Semantic syntax highlighting');
      process.exit(1);
    }

    // If we get here, the package is installed - start the server
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