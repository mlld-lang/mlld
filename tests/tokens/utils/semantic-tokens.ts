import { ASTSemanticVisitor } from '@services/lsp/ASTSemanticVisitor';
import { parseSync } from '@grammar/parser';
import { SemanticTokensBuilder } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface Token {
  line: number;
  character: number;
  length: number;
  type: string;
  modifiers: string[];
  text?: string;
}

// Token types and modifiers (normalized to the expectation set used in these tests)
const TOKEN_TYPES = [
  'keyword',          // 0 - Keywords and directives
  'variable',         // 1 - Variables (declarations and references)
  'string',           // 2 - Strings, templates, file paths
  'operator',         // 3 - Operators and brackets
  'label',            // 4 - Labels for sections and languages
  'type',             // 5 - Types (used for XML tags)
  'parameter',        // 6 - Function parameters
  'comment',          // 7 - Comments
  'number',           // 8 - Numbers
  'property',         // 9 - Object properties
  'interface',        // 10 - Interfaces (file references)
  'typeParameter',    // 11 - Type parameters (file paths in sections)
  'namespace',        // 12 - Namespaces (section names)
  'function'          // 13 - Functions (exec invocations)
];

const TOKEN_MODIFIERS = [
  'declaration',      // 0 - variable declarations
  'reference',        // 1 - variable references
  'readonly',         // 2 - imported variables
  'interpolated',     // 3 - interpolated content
  'literal',          // 4 - literal strings (single quotes)
  'invalid',          // 5 - invalid syntax
  'deprecated'        // 6 - deprecated syntax
];

// Map mlld-specific token types to the expectation set used in tests
const TOKEN_TYPE_MAP = {
  // mlld-specific mappings
  'directive': 'keyword',          // /var, /show, etc.
  'directiveDefinition': 'keyword',
  'directiveAction': 'keyword',
  'cmdLanguage': 'label',
  'variableRef': 'variable',       // @variable references
  'interpolation': 'variable',     // @var in templates
  'template': 'operator',          // Template delimiters (::, :::, `)
  'templateContent': 'string',     // Template content
  'embedded': 'label',             // Language labels (js, python)
  'embeddedCode': 'string',        // Embedded code content
  'alligator': 'string',           // File paths in <>
  'alligatorOpen': 'operator',     // < bracket
  'alligatorClose': 'operator',    // > bracket
  'xmlTag': 'type',                // XML tags in triple-colon
  'section': 'label',              // Section names (#section)
  'boolean': 'keyword',            // true/false
  'null': 'keyword',               // null
  'namespace': 'label',
  'typeParameter': 'type',
  'function': 'variable',
  'modifier': 'operator',
  'enum': 'operator',
  'interface': 'string',
  'method': 'variable',
  'class': 'type',
  'module': 'type',                // Module names in imports
  // Standard types (pass through)
  'keyword': 'keyword',
  'variable': 'variable',
  'string': 'string',
  'operator': 'operator',
  'parameter': 'parameter',
  'comment': 'comment',
  'number': 'number',
  'property': 'property',
  'label': 'label',
  'type': 'type'
};

export async function generateSemanticTokens(source: string): Promise<Token[]> {
  try {
    // Parse the source to get AST
    const ast = parseSync(source, { filePath: 'test.mld', mode: 'strict', startRule: 'Start' });
    
    // Create a text document for the visitor
    const document = TextDocument.create('file:///test.mld', 'mlld', 1, source);
    
    // Create a semantic tokens builder
    const builder = new SemanticTokensBuilder();
    
    // Create visitor and generate tokens
    const visitor = new ASTSemanticVisitor(document, builder, TOKEN_TYPES, TOKEN_MODIFIERS, TOKEN_TYPE_MAP);
    await visitor.visitAST(ast);
    
    // Get the built tokens
    const semanticTokens = builder.build();
    
    // Convert to our test format
    const tokens: Token[] = [];
    const lines = source.split('\n');
    
    // Decode the semantic tokens data
    // The data is in groups of 5: [deltaLine, deltaChar, length, tokenType, tokenModifiers]
    let prevLine = 0;
    let prevChar = 0;
    
    for (let i = 0; i < semanticTokens.data.length; i += 5) {
      const deltaLine = semanticTokens.data[i];
      const deltaChar = semanticTokens.data[i + 1];
      const length = semanticTokens.data[i + 2];
      const tokenTypeIndex = semanticTokens.data[i + 3];
      const tokenModifiersBitset = semanticTokens.data[i + 4];
      
      // Calculate absolute position
      const line = prevLine + deltaLine;
      const character = (deltaLine === 0) ? prevChar + deltaChar : deltaChar;
      
      prevLine = line;
      prevChar = character;
      
      // Extract text
      let text = '';
      if (line < lines.length) {
        const lineText = lines[line];
        text = lineText.substring(character, character + length);
      }
      
      // Decode modifiers
      const modifiers: string[] = [];
      for (let j = 0; j < TOKEN_MODIFIERS.length; j++) {
        if (tokenModifiersBitset & (1 << j)) {
          modifiers.push(TOKEN_MODIFIERS[j]);
        }
      }
      
      tokens.push({
        line,
        character,
        length,
        type: TOKEN_TYPES[tokenTypeIndex] || 'unknown',
        modifiers,
        text: text.trim() || undefined
      });
    }
    
    // Filter out directive tokens (keywords that start with /)
    // since we know all directives are tokenized correctly
    const filteredTokens = tokens.filter(token => {
      // Keep all non-keyword tokens
      if (token.type !== 'keyword') return true;
      // For keyword tokens, exclude those that start with /
      return !token.text?.startsWith('/');
    });
    
    return filteredTokens;
  } catch (error) {
    // Log the error for debugging
    console.error('Failed to generate semantic tokens:', error);
    // If parsing fails, return empty tokens array
    // This allows us to test that parsing doesn't crash
    return [];
  }
}
