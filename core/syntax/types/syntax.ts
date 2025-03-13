/**
 * Interface for multi-line block syntax in Meld
 */
export interface MultiLineBlock {
  /**
   * The type of block delimiter used
   * [[ ]] for text blocks
   * {{ }} for data blocks
   * ``` ``` for code fences
   */
  type: 'text' | 'data' | 'code';
  
  /**
   * The content within the block
   */
  content: string;

  /**
   * Optional language identifier for code fences
   */
  language?: string;
}

/**
 * Template literal syntax in Meld
 * - Delimited by backticks (`)
 * - Can contain ${var} for text variable interpolation
 * - Can contain #{data} for data variable interpolation
 * - Can be multi-line when wrapped in [[` and `]]
 * - Can contain any quotes without escaping
 */
export interface TemplateLiteral {
  /**
   * The content within the template literal
   */
  content: string;

  /**
   * Whether this is a multi-line template
   * Multi-line templates must be wrapped in [[` and `]]
   */
  isMultiLine: boolean;

  /**
   * Text variables referenced in the template using ${var}
   */
  textVariables?: string[];

  /**
   * Data variables referenced in the template using #{data}
   */
  dataVariables?: string[];
}

/**
 * Code fence syntax in Meld
 * - Must start with 3 or more backticks
 * - Must appear at start of line (no indentation)
 * - Can have optional language identifier
 * - Must close with same number of backticks
 * - Content is treated as literal text (no interpolation)
 * - Supports nesting with different backtick counts
 * - Preserves all whitespace and newlines
 */
export interface CodeFence extends MultiLineBlock {
  type: 'code';
  
  /**
   * Number of backticks used (minimum 3)
   */
  backtickCount: number;
} 