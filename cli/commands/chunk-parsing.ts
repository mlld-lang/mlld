/**
 * Chunk-based parsing for fault-tolerant document analysis.
 *
 * When a document has syntax errors, parsing the entire document fails and
 * we lose all semantic tokens. This module enables parsing independent chunks
 * so valid sections still get syntax highlighting.
 */

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { MlldMode } from '@core/types';
import { parse } from '@grammar/parser';
import { logger } from '@core/utils/logger';

/**
 * Represents a chunk of document text that can be parsed independently.
 *
 * Invariants:
 * - Chunks are ordered by startOffset with no overlaps
 * - startLine/endLine are 0-based line numbers in the original document
 * - startOffset/endOffset are character offsets from document start
 * - startColumn is the 0-based column where the chunk begins on startLine
 */
export interface Chunk {
  /** The chunk's text content */
  text: string;
  /** 0-based line number where chunk starts in original document */
  startLine: number;
  /** 0-based line number where chunk ends in original document */
  endLine: number;
  /** Character offset from document start where chunk begins */
  startOffset: number;
  /** Character offset from document start where chunk ends */
  endOffset: number;
  /** 0-based column where chunk begins on startLine */
  startColumn: number;
}

/**
 * Result of parsing a single chunk.
 */
export interface ChunkParseResult {
  /** Whether parsing succeeded without errors */
  success: boolean;
  /** The chunk that was parsed */
  chunk: Chunk;
  /** Parsed AST nodes (empty if parsing failed) */
  ast: any[];
  /** Diagnostics generated during parsing */
  diagnostics: Diagnostic[];
  /** The error if parsing failed */
  error?: Error;
}

/**
 * Combined result from parsing all chunks.
 */
export interface MergedParseResult {
  /** All successfully parsed AST nodes, rebased to original document positions */
  nodes: any[];
  /** All errors/diagnostics from parsing */
  errors: Diagnostic[];
  /** Ranges in the document that failed to parse */
  failedRanges: Range[];
}

/**
 * State for tracking nested constructs during chunk splitting.
 * We cannot split inside any of these constructs.
 */
export interface SplitterState {
  /** Depth of [...] alligator blocks */
  bracketDepth: number;
  /** Depth of {...} code/data blocks */
  braceDepth: number;
  /** Depth of (...) conditions/grouping */
  parenDepth: number;
  /** Stack of template delimiters: backtick, ::, or ::: */
  templateStack: ('`' | '::' | ':::')[];
  /** Currently inside a line comment */
  inComment: boolean;
  /** Currently inside a ``` code fence */
  inCodeFence: boolean;
  /** Currently inside a single-quoted string */
  inSingleQuote: boolean;
  /** Currently inside a double-quoted string */
  inDoubleQuote: boolean;
}

/**
 * Location information from the parser.
 * Mirrors the structure produced by peggy.
 */
interface ASTLocation {
  start: {
    line: number;
    column: number;
    offset: number;
  };
  end: {
    line: number;
    column: number;
    offset: number;
  };
}

/**
 * Rebases all location fields in an AST node from chunk-relative positions
 * to original document positions.
 *
 * The parser produces locations relative to the chunk's text. When the chunk
 * starts at line 10, column 5, offset 250 in the original document, a node
 * at chunk position (line 1, column 1, offset 0) should be rebased to
 * (line 10, column 5, offset 250).
 *
 * For lines after the first line of a chunk, only line and offset need
 * adjustment - column is already correct relative to that line's start.
 *
 * @param node - AST node to rebase (mutated in place)
 * @param chunk - The chunk containing position offset information
 */
export function rebaseLocation(node: any, chunk: Chunk): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (node.location) {
    const loc = node.location as ASTLocation;

    if (loc.start) {
      // Parser lines are 1-based, chunk.startLine is 0-based
      const chunkRelativeLine = loc.start.line - 1; // Convert to 0-based

      // Offset always needs adjustment
      loc.start.offset += chunk.startOffset;

      // Line always needs adjustment
      loc.start.line += chunk.startLine;

      // Column only needs adjustment on the first line of the chunk
      if (chunkRelativeLine === 0) {
        loc.start.column += chunk.startColumn;
      }
    }

    if (loc.end) {
      const chunkRelativeLine = loc.end.line - 1; // Convert to 0-based

      loc.end.offset += chunk.startOffset;
      loc.end.line += chunk.startLine;

      if (chunkRelativeLine === 0) {
        loc.end.column += chunk.startColumn;
      }
    }
  }

  // Recursively process all child properties
  for (const key in node) {
    if (key === 'location') continue;

    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        rebaseLocation(item, chunk);
      }
    } else if (value && typeof value === 'object') {
      rebaseLocation(value, chunk);
    }
  }
}

/**
 * Creates an initial splitter state with all counters at zero.
 */
export function createInitialSplitterState(): SplitterState {
  return {
    bracketDepth: 0,
    braceDepth: 0,
    parenDepth: 0,
    templateStack: [],
    inComment: false,
    inCodeFence: false,
    inSingleQuote: false,
    inDoubleQuote: false
  };
}

/**
 * Checks if the splitter is at a safe point to split.
 * A split is safe when we're not inside any nested construct.
 */
export function canSplitAt(state: SplitterState): boolean {
  return state.bracketDepth === 0 &&
         state.braceDepth === 0 &&
         state.parenDepth === 0 &&
         state.templateStack.length === 0 &&
         !state.inComment &&
         !state.inCodeFence &&
         !state.inSingleQuote &&
         !state.inDoubleQuote;
}

/**
 * Maximum number of chunks allowed before falling back to single-chunk mode.
 */
const MAX_CHUNKS = 200;

/**
 * Bare directive keywords that can start a directive in strict mode.
 */
const BARE_DIRECTIVE_PATTERN = /^(var|show|exe|run|for|foreach|when|while|stream|guard|import|export|output|append|log|path)\b/;

/**
 * Checks if a line starts a new directive.
 *
 * @param line - The line to check
 * @param mode - 'strict' or 'markdown' parsing mode
 * @returns true if the line starts a directive
 */
function isDirectiveStart(line: string, mode: MlldMode): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('/')) return true;

  if (mode === 'strict') {
    return BARE_DIRECTIVE_PATTERN.test(trimmed);
  }
  return false;
}

/**
 * Updates the splitter state based on a single line of text.
 * Tracks brackets, templates, code fences, and comments.
 *
 * @param state - The current splitter state (mutated in place)
 * @param line - The line to process
 */
function updateStateForLine(state: SplitterState, line: string): void {
  // Handle code fences
  if (line.trim().startsWith('```')) {
    state.inCodeFence = !state.inCodeFence;
    return;
  }

  if (state.inCodeFence) return;

  let escapeNext = false;

  // Scan character by character for brackets, templates, etc.
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    // Handle strings
    if (state.inSingleQuote) {
      if (char === '\'') {
        state.inSingleQuote = false;
      }
      continue;
    }
    if (state.inDoubleQuote) {
      if (char === '"') {
        state.inDoubleQuote = false;
      }
      continue;
    }

    // Check for >> comment start
    if (char === '>' && nextChar === '>') {
      state.inComment = true;
    }

    // Skip rest of line if in comment
    if (state.inComment) break;

    // Track brackets (but not inside templates)
    if (state.templateStack.length === 0) {
      if (char === '[') state.bracketDepth++;
      if (char === ']') state.bracketDepth = Math.max(0, state.bracketDepth - 1);
      if (char === '{') state.braceDepth++;
      if (char === '}') state.braceDepth = Math.max(0, state.braceDepth - 1);
      if (char === '(') state.parenDepth++;
      if (char === ')') state.parenDepth = Math.max(0, state.parenDepth - 1);
    }

    // String entry (only when not in template)
    if (state.templateStack.length === 0) {
      if (char === '\'') {
        state.inSingleQuote = true;
        continue;
      }
      if (char === '"') {
        state.inDoubleQuote = true;
        continue;
      }
    }

    // Template handling
    if (char === '`') {
      if (state.templateStack[state.templateStack.length - 1] === '`') {
        state.templateStack.pop();
      } else {
        state.templateStack.push('`');
      }
    }

    // Handle :: and ::: templates
    if (char === ':' && nextChar === ':') {
      const thirdChar = line[i + 2];
      if (thirdChar === ':') {
        // ::: triple colon
        if (state.templateStack[state.templateStack.length - 1] === ':::') {
          state.templateStack.pop();
        } else {
          state.templateStack.push(':::');
        }
        i += 2; // Skip next two chars
      } else {
        // :: double colon
        if (state.templateStack[state.templateStack.length - 1] === '::') {
          state.templateStack.pop();
        } else {
          state.templateStack.push('::');
        }
        i += 1; // Skip next char
      }
    }
  }

  // Reset comment flag at end of line
  state.inComment = false;
}

/**
 * Splits a document into independently parseable chunks.
 *
 * Chunks are split at blank lines followed by directive starts, but only
 * when not inside any nested construct (brackets, templates, code fences).
 *
 * @param text - The full document text
 * @param mode - 'strict' or 'markdown' parsing mode
 * @returns Array of chunks ordered by position
 */
export function splitIntoChunks(text: string, mode: MlldMode): Chunk[] {
  // Handle empty document
  if (!text || text.length === 0) {
    return [{
      text: '',
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 0,
      startColumn: 0
    }];
  }

  const lines = text.split('\n');
  logger.debug('[CHUNK] Splitting document', { totalLines: lines.length, mode });
  const chunks: Chunk[] = [];
  const state = createInitialSplitterState();

  let chunkStart = 0;
  let chunkStartOffset = 0;
  let currentOffset = 0;
  let wasBlankLine = false;
  let previousLineWasDirective = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineLength = line.length;
    const isBlank = line.trim() === '';

    const startsDirective = isDirectiveStart(line, mode);
    const splitForAdjacentDirective = previousLineWasDirective && startsDirective && canSplitAt(state);

    // Check if we can split here
    if ((wasBlankLine && !isBlank && canSplitAt(state) && startsDirective) || splitForAdjacentDirective) {
      // We have a valid split point before this line
      // Calculate the end of the previous chunk (includes the blank line)
      const prevLineEnd = currentOffset; // This is the offset at the start of current line

      // Only create a chunk if we have content
      if (lineIndex > chunkStart) {
        // Build chunk text from chunkStart to lineIndex (exclusive)
        const chunkLines = lines.slice(chunkStart, lineIndex);
        const chunkText = chunkLines.join('\n');

        chunks.push({
          text: chunkText,
          startLine: chunkStart,
          endLine: lineIndex - 1,
          startOffset: chunkStartOffset,
          endOffset: prevLineEnd - 1, // -1 to not include the trailing newline
          startColumn: 0
        });

        // Safety check
        if (chunks.length >= MAX_CHUNKS) {
          console.warn(`[chunk-parsing] Exceeded ${MAX_CHUNKS} chunks, falling back to single chunk`);
          return [{
            text,
            startLine: 0,
            endLine: lines.length - 1,
            startOffset: 0,
            endOffset: text.length,
            startColumn: 0
          }];
        }

        // Start new chunk
        chunkStart = lineIndex;
        chunkStartOffset = currentOffset;
      }
    }

    // Update state for this line
    updateStateForLine(state, line);

    // Track whether this was a blank line for next iteration
    wasBlankLine = isBlank;
    previousLineWasDirective = !isBlank && startsDirective && canSplitAt(state);

    // Update offset (include newline except for last line)
    currentOffset += lineLength;
    if (lineIndex < lines.length - 1) {
      currentOffset += 1; // newline character
    }
  }

  // Emit final chunk
  const chunkLines = lines.slice(chunkStart);
  const chunkText = chunkLines.join('\n');

  chunks.push({
    text: chunkText,
    startLine: chunkStart,
    endLine: lines.length - 1,
    startOffset: chunkStartOffset,
    endOffset: text.length,
    startColumn: 0
  });

  logger.debug('[CHUNK] Created chunks', { count: chunks.length });
  return chunks;
}

/**
 * Creates a diagnostic from a parse error within a chunk.
 * Rebases the error location from chunk-relative to document-global.
 */
function createChunkDiagnostic(chunk: Chunk, error: any): Diagnostic {
  // Extract line from error if available (parser errors have location)
  const errorLine = error?.location?.start?.line ?? 1;
  const errorCol = error?.location?.start?.column ?? 1;
  const character = chunk.startColumn + Math.max(0, errorCol - 1);

  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: { line: chunk.startLine + errorLine - 1, character },
      end: { line: chunk.startLine + errorLine - 1, character: character + 1 }
    },
    message: error?.message || 'Syntax error',
    source: 'mlld'
  };
}

/**
 * Parses a single chunk and rebases locations to document positions.
 */
export async function parseChunk(chunk: Chunk, mode: MlldMode): Promise<ChunkParseResult> {
  try {
    const result = await parse(chunk.text, { mode });

    if (!result.success) {
      return {
        success: false,
        chunk,
        ast: [],
        diagnostics: [createChunkDiagnostic(chunk, result.error)],
        error: result.error
      };
    }

    // Deep clone to avoid mutating cached AST nodes
    const clonedAst = JSON.parse(JSON.stringify(result.ast));

    // Rebase all locations from chunk-relative to document-global
    for (const node of clonedAst) {
      rebaseLocation(node, chunk);
    }

    return {
      success: true,
      chunk,
      ast: clonedAst,
      diagnostics: []
    };
  } catch (error: any) {
    return {
      success: false,
      chunk,
      ast: [],
      diagnostics: [createChunkDiagnostic(chunk, error)],
      error
    };
  }
}

/**
 * Merges results from parsing multiple chunks.
 * Combines successful ASTs and tracks failed ranges.
 */
export function mergeChunkResults(results: ChunkParseResult[]): MergedParseResult {
  const nodes: any[] = [];
  const errors: Diagnostic[] = [];
  const failedRanges: Range[] = [];

  function getChunkEndCharacter(chunk: Chunk): number {
    if (!chunk.text) return 0;
    const parts = chunk.text.split('\n');
    const lastLine = parts[parts.length - 1] ?? '';
    return lastLine.length;
  }

  for (const result of results) {
    if (result.success) {
      nodes.push(...result.ast);
    } else {
      // Track failed range for downstream handling
      failedRanges.push({
        start: { line: result.chunk.startLine, character: 0 },
        end: { line: result.chunk.endLine, character: getChunkEndCharacter(result.chunk) }
      });
    }

    // Always include diagnostics
    errors.push(...result.diagnostics);
  }

  return { nodes, errors, failedRanges };
}
