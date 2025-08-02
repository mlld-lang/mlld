/**
 * LSP-related type definitions
 */

export interface ISemanticToken {
  line: number;          // 0-based line number
  char: number;          // 0-based character position (matching TokenBuilder)
  length: number;        // Token length
  tokenType: string;     // VSCode semantic token type
  modifiers: string[];   // Token modifiers (e.g., 'declaration', 'readonly')
}