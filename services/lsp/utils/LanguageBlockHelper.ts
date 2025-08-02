import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';
import { embeddedLanguageService, EmbeddedLanguageService } from '@services/lsp/embedded/EmbeddedLanguageService';
import { ISemanticToken } from '@services/lsp/types';

/**
 * Helper class for consistent embedded language block tokenization across all visitors.
 * Centralizes the handling of language identifiers, code blocks, and brace tokenization.
 */
export class LanguageBlockHelper {
  private operatorHelper: OperatorTokenHelper;
  
  // Common language identifiers used in mlld
  private static readonly LANGUAGE_IDENTIFIERS = [
    'js', 'javascript', 'node',
    'python', 'py', 'python3',
    'sh', 'bash', 'shell', 'zsh',
    'ts', 'typescript'
  ];
  
  constructor(
    private document: TextDocument,
    private tokenBuilder: TokenBuilder,
    private embeddedService: EmbeddedLanguageService = embeddedLanguageService
  ) {
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
  }

  /**
   * Tokenize a language identifier (e.g., 'js', 'python', 'sh')
   * @param language The language identifier string
   * @param offset Absolute offset in the document
   * @returns true if language was tokenized
   */
  tokenizeLanguageIdentifier(language: string, offset: number): boolean {
    if (!LanguageBlockHelper.LANGUAGE_IDENTIFIERS.includes(language)) {
      return false;
    }
    
    const position = this.document.positionAt(offset);
    this.tokenBuilder.addToken({
      line: position.line,
      char: position.character,
      length: language.length,
      tokenType: 'embedded', // Using 'embedded' as per the established pattern
      modifiers: []
    });
    
    return true;
  }

  /**
   * Find and tokenize a language identifier in the given text
   * @param text The text to search in
   * @param baseOffset The base offset for position calculation
   * @returns Object with language and its offset, or null if not found
   */
  findAndTokenizeLanguage(text: string, baseOffset: number): { language: string; offset: number } | null {
    // Create regex pattern for all supported languages
    const languagePattern = LanguageBlockHelper.LANGUAGE_IDENTIFIERS.join('|');
    const regex = new RegExp(`\\b(${languagePattern})\\b`);
    const match = text.match(regex);
    
    if (match && match.index !== undefined) {
      const language = match[1];
      const offset = baseOffset + match.index;
      this.tokenizeLanguageIdentifier(language, offset);
      return { language, offset };
    }
    
    return null;
  }

  /**
   * Tokenize a complete embedded language block
   * Handles: language identifier, opening/closing braces, and embedded code content
   * @param directive The directive node containing the code block
   * @param language The language identifier (optional, will be detected if not provided)
   * @param codeContent The code content to tokenize
   * @returns true if successfully tokenized
   */
  tokenizeCodeBlock(
    directive: any,
    language?: string,
    codeContent?: string
  ): boolean {
    if (!directive.location) return false;
    
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(
      directive.location.start.offset,
      directive.location.end.offset
    );
    
    // Find language identifier if not provided
    if (!language) {
      const langInfo = this.findAndTokenizeLanguage(directiveText, directive.location.start.offset);
      if (!langInfo) return false;
      language = langInfo.language;
    } else {
      // Tokenize provided language
      const langPattern = new RegExp(`\\b${language}\\b`);
      const langMatch = directiveText.match(langPattern);
      if (langMatch && langMatch.index !== undefined) {
        this.tokenizeLanguageIdentifier(
          language,
          directive.location.start.offset + langMatch.index
        );
      }
    }
    
    // Find and tokenize opening brace
    const braceIndex = directiveText.indexOf('{');
    if (braceIndex === -1) return false;
    
    this.operatorHelper.addOperatorToken(
      directive.location.start.offset + braceIndex,
      1
    );
    
    // Find closing brace
    const closeBraceIndex = directiveText.lastIndexOf('}');
    if (closeBraceIndex === -1 || closeBraceIndex <= braceIndex) return false;
    
    // Extract code content if not provided
    if (!codeContent) {
      codeContent = directiveText.substring(braceIndex + 1, closeBraceIndex).trim();
    }
    
    // Tokenize embedded code if supported
    if (codeContent && this.embeddedService.isLanguageSupported(language)) {
      const codeStartInDirective = directiveText.indexOf(codeContent, braceIndex + 1);
      if (codeStartInDirective !== -1) {
        const codePosition = this.document.positionAt(
          directive.location.start.offset + codeStartInDirective
        );
        
        try {
          const embeddedTokens = this.embeddedService.generateTokens(
            codeContent,
            language,
            codePosition.line,
            codePosition.character
          );
          
          // Add all embedded language tokens
          for (const token of embeddedTokens) {
            this.tokenBuilder.addToken(token);
          }
        } catch (error) {
          console.error(`Failed to tokenize embedded ${language} code:`, error);
        }
      }
    }
    
    // Tokenize closing brace
    this.operatorHelper.addOperatorToken(
      directive.location.start.offset + closeBraceIndex,
      1
    );
    
    return true;
  }

  /**
   * Tokenize inline code in /var and /exe directives
   * Handles patterns like: /var @x = js { return 42; }
   * @param directive The directive containing inline code
   * @param codeNode Optional code node with language and code content
   * @returns true if successfully tokenized
   */
  tokenizeInlineCode(directive: any, codeNode?: any): boolean {
    if (!directive.location) return false;
    
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(
      directive.location.start.offset,
      directive.location.end.offset
    );
    
    // Determine language and code content
    let language: string | undefined;
    let codeContent: string | undefined;
    
    if (directive.kind === 'exe' && directive.raw) {
      language = directive.raw.lang;
      codeContent = directive.raw.code;
    } else if (codeNode) {
      language = codeNode.lang || codeNode.language;
      codeContent = codeNode.code;
    }
    
    if (!language || !codeContent) return false;
    
    // Find language identifier and opening brace
    const langBraceMatch = directiveText.match(new RegExp(`=\\s*(${language})\\s*\\{`));
    if (!langBraceMatch) return false;
    
    const langStart = directiveText.indexOf(langBraceMatch[0]) + langBraceMatch[0].indexOf(language);
    
    // Tokenize language identifier
    this.tokenizeLanguageIdentifier(
      language,
      directive.location.start.offset + langStart
    );
    
    // Use the general code block tokenizer for the rest
    return this.tokenizeCodeBlock(directive, language, codeContent.trim());
  }

  /**
   * Tokenize /run directive with language-specific code
   * Handles patterns like: /run js { console.log('hello'); }
   * @param directive The run directive
   * @param langText Optional language text already extracted
   * @returns true if successfully tokenized
   */
  tokenizeRunDirective(directive: any, langText?: string): boolean {
    if (!directive.location || !directive.values) return false;
    
    const values = directive.values;
    
    // Handle language identifier if provided
    if (langText && values.lang) {
      const langStart = directive.location.start.column + 4; // After "/run "
      const langPosition = this.document.positionAt(
        directive.location.start.offset + langStart
      );
      
      this.tokenBuilder.addToken({
        line: langPosition.line,
        char: langPosition.character,
        length: langText.length,
        tokenType: 'embedded',
        modifiers: []
      });
    }
    
    // Handle code block if present
    if (values.code) {
      return this.tokenizeCodeBlock(directive);
    }
    
    return false;
  }

  /**
   * Tokenize command braces in /run directives
   * Handles opening and closing braces for command blocks
   * @param firstCommand First command node (for opening brace)
   * @param lastCommand Last command node (for closing brace)
   */
  tokenizeCommandBraces(firstCommand: any, lastCommand: any): void {
    // Add opening brace
    if (firstCommand?.location) {
      this.operatorHelper.addOperatorToken(
        firstCommand.location.start.offset - 1, // Brace is before command
        1
      );
    }
    
    // Add closing brace
    if (lastCommand?.location) {
      this.operatorHelper.addOperatorToken(
        lastCommand.location.end.offset,
        1
      );
    }
  }

  /**
   * Extract code content between braces
   * @param text The text containing the code block
   * @param openBraceIndex Index of the opening brace
   * @param closeBraceIndex Index of the closing brace
   * @returns Object with trimmed code content and its bounds
   */
  extractCodeContent(
    text: string,
    openBraceIndex: number,
    closeBraceIndex: number
  ): { content: string; startOffset: number; endOffset: number } {
    const rawContent = text.substring(openBraceIndex + 1, closeBraceIndex);
    
    // Find first non-whitespace
    let contentStart = 0;
    while (contentStart < rawContent.length && /\s/.test(rawContent[contentStart])) {
      if (rawContent[contentStart] === '\n') {
        contentStart++;
        break; // Stop after first newline
      }
      contentStart++;
    }
    
    // Find last non-whitespace
    let contentEnd = rawContent.length;
    while (contentEnd > contentStart && /\s/.test(rawContent[contentEnd - 1])) {
      if (rawContent[contentEnd - 1] === '\n') {
        contentEnd--;
        break;
      }
      contentEnd--;
    }
    
    return {
      content: rawContent.substring(contentStart, contentEnd),
      startOffset: openBraceIndex + 1 + contentStart,
      endOffset: openBraceIndex + 1 + contentEnd
    };
  }
}