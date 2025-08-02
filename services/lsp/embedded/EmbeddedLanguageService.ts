import Parser from 'web-tree-sitter';
import * as path from 'path';
import { ISemanticToken } from '@services/lsp/types';

/**
 * Service for parsing and tokenizing embedded language code blocks
 * using web-tree-sitter for accurate AST-based semantic tokens
 */
export class EmbeddedLanguageService {
  private initialized = false;
  private parsers = new Map<string, Parser>();
  private languages = new Map<string, Parser.Language>();
  
  // Map language aliases to canonical names
  private static LANGUAGE_ALIASES: Record<string, string> = {
    'js': 'javascript',
    'node': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'python3': 'python',
    'sh': 'bash',
    'shell': 'bash',
    'zsh': 'bash',
  };

  // Map tree-sitter node types to VSCode semantic token types
  private static TOKEN_MAPPINGS: Record<string, Record<string, string>> = {
    javascript: {
      'identifier': 'variable',
      'property_identifier': 'property',
      'function_declaration': 'function',
      'method_definition': 'method',
      'class_declaration': 'class',
      'string': 'string',
      'template_string': 'string',
      'number': 'number',
      'comment': 'comment',
      'line_comment': 'comment',
      'block_comment': 'comment',
      'true': 'keyword',
      'false': 'keyword',
      'null': 'keyword',
      'undefined': 'keyword',
      'const': 'keyword',
      'let': 'keyword',
      'var': 'keyword',
      'if': 'keyword',
      'else': 'keyword',
      'for': 'keyword',
      'while': 'keyword',
      'return': 'keyword',
      'new': 'keyword',
      'this': 'keyword',
      'super': 'keyword',
      'import': 'keyword',
      'export': 'keyword',
      'default': 'keyword',
      'from': 'keyword',
      'as': 'keyword',
      'async': 'keyword',
      'await': 'keyword',
      '=>': 'operator',
      '=': 'operator',
      '+': 'operator',
      '-': 'operator',
      '*': 'operator',
      '/': 'operator',
      '%': 'operator',
      '==': 'operator',
      '===': 'operator',
      '!=': 'operator',
      '!==': 'operator',
      '<': 'operator',
      '>': 'operator',
      '<=': 'operator',
      '>=': 'operator',
      '&&': 'operator',
      '||': 'operator',
      '!': 'operator',
      '?': 'operator',
      ':': 'operator',
      '.': 'operator',
      ',': 'operator',
      ';': 'operator',
      '(': 'operator',
      ')': 'operator',
      '[': 'operator',
      ']': 'operator',
      '{': 'operator',
      '}': 'operator',
    },
    python: {
      'identifier': 'variable',
      'attribute': 'property',
      'function_definition': 'function',
      'class_definition': 'class',
      'string': 'string',
      'integer': 'number',
      'float': 'number',
      'comment': 'comment',
      'True': 'keyword',
      'False': 'keyword',
      'None': 'keyword',
      'def': 'keyword',
      'if': 'keyword',
      'elif': 'keyword',
      'else': 'keyword',
      'for': 'keyword',
      'while': 'keyword',
      'return': 'keyword',
      'import': 'keyword',
      'from': 'keyword',
      'as': 'keyword',
      'try': 'keyword',
      'except': 'keyword',
      'finally': 'keyword',
      'with': 'keyword',
      'async': 'keyword',
      'await': 'keyword',
      'lambda': 'keyword',
      'in': 'keyword',
      'not': 'keyword',
      'and': 'keyword',
      'or': 'keyword',
      '=': 'operator',
      '+': 'operator',
      '-': 'operator',
      '*': 'operator',
      '/': 'operator',
      '//': 'operator',
      '%': 'operator',
      '**': 'operator',
      '==': 'operator',
      '!=': 'operator',
      '<': 'operator',
      '>': 'operator',
      '<=': 'operator',
      '>=': 'operator',
      ':': 'operator',
      '.': 'operator',
      ',': 'operator',
      '(': 'operator',
      ')': 'operator',
      '[': 'operator',
      ']': 'operator',
      '{': 'operator',
      '}': 'operator',
    },
    bash: {
      'variable_name': 'variable',
      'command_name': 'function',
      'function_definition': 'function',
      'string': 'string',
      'raw_string': 'string',
      'number': 'number',
      'comment': 'comment',
      'if': 'keyword',
      'then': 'keyword',
      'else': 'keyword',
      'elif': 'keyword',
      'fi': 'keyword',
      'for': 'keyword',
      'while': 'keyword',
      'do': 'keyword',
      'done': 'keyword',
      'case': 'keyword',
      'esac': 'keyword',
      'function': 'keyword',
      'return': 'keyword',
      'local': 'keyword',
      'export': 'keyword',
      'readonly': 'keyword',
      'declare': 'keyword',
      '=': 'operator',
      '==': 'operator',
      '!=': 'operator',
      '-eq': 'operator',
      '-ne': 'operator',
      '-lt': 'operator',
      '-le': 'operator',
      '-gt': 'operator',
      '-ge': 'operator',
      '&&': 'operator',
      '||': 'operator',
      '!': 'operator',
      '|': 'operator',
      '&': 'operator',
      ';': 'operator',
      '(': 'operator',
      ')': 'operator',
      '[': 'operator',
      ']': 'operator',
      '{': 'operator',
      '}': 'operator',
      '$': 'operator',
    }
  };

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await Parser.init();
    
    // Load commonly used language parsers
    // Note: Currently only JavaScript has a pre-built WASM file
    // Python and Bash would need their WASM files built separately
    await this.loadLanguage('javascript');
    
    // TODO: Build WASM files for these languages
    // await this.loadLanguage('python');
    // await this.loadLanguage('bash');
    
    this.initialized = true;
  }
  
  /**
   * Initialize synchronously if possible (for use in sync contexts)
   * Returns true if already initialized, false otherwise
   */
  ensureInitialized(): boolean {
    if (this.initialized) return true;
    
    // Start initialization asynchronously
    this.initialize().catch(err => {
      console.error('Failed to initialize embedded language service:', err);
    });
    
    return false;
  }

  private async loadLanguage(name: string): Promise<void> {
    try {
      const parser = new Parser();
      
      // Try multiple possible locations for WASM files
      const possiblePaths = [
        // Development: from node_modules
        path.join(process.cwd(), 'node_modules', `tree-sitter-${name}`, `tree-sitter-${name}.wasm`),
        // Production: bundled with the LSP
        path.join(__dirname, '..', '..', '..', 'wasm', `tree-sitter-${name}.wasm`),
        // Alternative development path
        path.join(process.cwd(), 'dist', 'wasm', `tree-sitter-${name}.wasm`),
      ];
      
      let language: Parser.Language | null = null;
      let loadedPath: string | null = null;
      
      for (const wasmPath of possiblePaths) {
        try {
          language = await Parser.Language.load(wasmPath);
          loadedPath = wasmPath;
          break;
        } catch (err) {
          // Try next path
          continue;
        }
      }
      
      if (!language) {
        throw new Error(`Could not find WASM file for tree-sitter-${name} in any of the expected locations`);
      }
      
      parser.setLanguage(language);
      
      this.parsers.set(name, parser);
      this.languages.set(name, language);
      
      if (process.env.DEBUG_LSP) {
        console.log(`Loaded tree-sitter-${name} from ${loadedPath}`);
      }
    } catch (error) {
      console.warn(`Failed to load tree-sitter parser for ${name}:`, error);
    }
  }

  /**
   * Generate semantic tokens for embedded code
   * @param code The code content
   * @param language The language identifier (can be an alias)
   * @param startLine Starting line in the parent document (0-based)
   * @param startColumn Starting column in the parent document (0-based)
   * @returns Array of semantic tokens
   */
  generateTokens(
    code: string,
    language: string,
    startLine: number,
    startColumn: number
  ): ISemanticToken[] {
    const tokens: ISemanticToken[] = [];
    
    // Ensure we're initialized
    if (!this.initialized) {
      this.ensureInitialized();
      return tokens; // Return empty for now, will work on next call
    }
    
    // Resolve language alias
    const canonicalLang = EmbeddedLanguageService.LANGUAGE_ALIASES[language] || language;
    
    // Get parser for language
    const parser = this.parsers.get(canonicalLang);
    if (!parser) {
      console.warn(`No parser available for language: ${language}`);
      return tokens;
    }
    
    try {
      // Parse the code
      const tree = parser.parse(code);
      
      // Walk the AST and generate tokens
      this.walkTree(tree.rootNode, canonicalLang, tokens, startLine, startColumn);
      
    } catch (error) {
      console.error(`Error parsing ${language} code:`, error);
    }
    
    return tokens;
  }

  private walkTree(
    node: Parser.SyntaxNode,
    language: string,
    tokens: ISemanticToken[],
    offsetLine: number,
    offsetColumn: number,
    isFirstLine: boolean = true
  ): void {
    // Get token type for this node
    const tokenType = this.getTokenType(node, language);
    
    if (tokenType && node.text.trim()) {
      // Calculate position with offset
      // For the first line of embedded code, add column offset
      // For subsequent lines, column starts from 0 in the embedded code
      const line = offsetLine + node.startPosition.row;
      const column = node.startPosition.row === 0 && isFirstLine
        ? offsetColumn + node.startPosition.column
        : node.startPosition.column;
      
      tokens.push({
        line,
        char: column,
        length: node.endIndex - node.startIndex,
        tokenType,
        modifiers: []
      });
    }
    
    // Recursively process children
    for (const child of node.children) {
      this.walkTree(
        child, 
        language, 
        tokens, 
        offsetLine, 
        offsetColumn,
        isFirstLine && node.startPosition.row === 0
      );
    }
  }

  private getTokenType(node: Parser.SyntaxNode, language: string): string | null {
    const mappings = EmbeddedLanguageService.TOKEN_MAPPINGS[language];
    if (!mappings) return null;
    
    // Check for direct mapping
    if (mappings[node.type]) {
      return mappings[node.type];
    }
    
    // Check text content for operators and keywords
    if (mappings[node.text]) {
      return mappings[node.text];
    }
    
    // Handle special cases
    if (node.type === 'ERROR') {
      return null; // Don't highlight error nodes
    }
    
    return null;
  }

  /**
   * Check if a language is supported
   */
  isLanguageSupported(language: string): boolean {
    const canonical = EmbeddedLanguageService.LANGUAGE_ALIASES[language] || language;
    return this.parsers.has(canonical);
  }

  /**
   * Get canonical language name from alias
   */
  getCanonicalLanguage(alias: string): string {
    return EmbeddedLanguageService.LANGUAGE_ALIASES[alias] || alias;
  }
}

// Singleton instance
export const embeddedLanguageService = new EmbeddedLanguageService();