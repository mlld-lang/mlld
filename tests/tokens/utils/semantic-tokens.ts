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

// Token types and modifiers from language-server-impl.ts
const TOKEN_TYPES = [
  'keyword',          // Keywords and directives
  'variable',         // Variables (declarations and references)
  'string',           // Strings, templates, file paths
  'operator',         // Operators and brackets
  'label',            // Labels for sections and languages
  'number',           // Numbers
  'comment',          // Comments
  'regexp',           // Regular expressions
  'type',             // Types (like XML tags)
  'property',         // Properties and attributes
  'parameter',        // Function parameters
  'function',         // Function names
  'namespace',        // Namespaces
  'method',           // Methods
  'event'             // Events
];

const TOKEN_MODIFIERS = [
  'declaration',      // Variable is being declared
  'definition',       // Function/type is being defined
  'readonly',         // Read-only variable
  'static',           // Static member
  'deprecated',       // Deprecated item
  'abstract',         // Abstract member
  'async',            // Async function
  'modification',     // Being modified
  'documentation',    // Documentation
  'defaultLibrary'    // Part of default library
];

// Map mlld-specific token types to VSCode standard types
const TOKEN_TYPE_MAP = {
  'directive': 'keyword',          // /var, /show, etc.
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

export async function generateSemanticTokens(source: string): Promise<Token[]> {
  try {
    // Parse the source to get AST
    const ast = parseSync(source, { filePath: 'test.mld' });
    
    // Create a text document for the visitor
    const document = TextDocument.create('file:///test.mld', 'mlld', 1, source);
    
    // Create a semantic tokens builder
    const builder = new SemanticTokensBuilder();
    
    // Create visitor and generate tokens
    const visitor = new ASTSemanticVisitor(document, builder, TOKEN_TYPES, TOKEN_MODIFIERS, TOKEN_TYPE_MAP);
    visitor.visitAST(ast);
    
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
    
    return tokens;
  } catch (error) {
    // Log the error for debugging
    console.error('Failed to generate semantic tokens:', error);
    // If parsing fails, return empty tokens array
    // This allows us to test that parsing doesn't crash
    return [];
  }
}