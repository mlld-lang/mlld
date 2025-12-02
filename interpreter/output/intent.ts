/**
 * Output Intent System
 *
 * Structured representation of output operations that enables:
 * - Collapsible break normalization (fixes #396)
 * - Explicit formatting control (addresses #246)
 * - Foundation for streaming format adapters
 */

/**
 * Type of output intent
 * - content: Document text, directive output
 * - break: Whitespace/newlines (can be collapsible)
 * - progress: CLI progress/meta messages
 * - error: Error output
 */
export type IntentType = 'content' | 'break' | 'progress' | 'error';

/**
 * Source that generated this intent
 * - text: Plain markdown text
 * - directive: Directive output (/show, /run, etc)
 * - newline: Newline AST nodes
 * - streaming: Real-time streaming chunks
 */
export type IntentSource = 'text' | 'directive' | 'newline' | 'streaming';

/**
 * Visibility control for future streaming adapters
 * - always: Always shown
 * - optional: Shown based on flags (e.g., --show-thinking)
 * - never: Internal/suppressed
 */
export type IntentVisibility = 'always' | 'optional' | 'never';

/**
 * Structured output intent
 *
 * Intents represent output operations before final rendering.
 * OutputRenderer buffers these, collapses adjacent breaks, and
 * produces normalized output.
 */
export interface OutputIntent {
  /** Type of output */
  type: IntentType;

  /** Content to output */
  value: string;

  /** What generated this intent */
  source: IntentSource;

  /** Visibility control */
  visibility: IntentVisibility;

  /**
   * Whether this break can be collapsed with adjacent breaks
   * Only applies to type: 'break'
   *
   * Algorithm:
   * - Adjacent collapsible breaks → single break
   * - Non-collapsible breaks never collapse
   * - Content/progress/error flush pending breaks
   *
   * Examples:
   * - [break(coll), break(coll)] → [break]
   * - [break(coll), content, break(coll)] → [break, content, break]
   * - [break(coll), break(non-coll)] → [break, break]
   */
  collapsible?: boolean;
}

/**
 * Helper to create a content intent
 */
export function contentIntent(
  value: string,
  source: IntentSource = 'text',
  visibility: IntentVisibility = 'always'
): OutputIntent {
  return {
    type: 'content',
    value,
    source,
    visibility,
    collapsible: false
  };
}

/**
 * Helper to create a collapsible break intent
 */
export function breakIntent(
  value: string = '\n',
  collapsible: boolean = true,
  source: IntentSource = 'newline'
): OutputIntent {
  return {
    type: 'break',
    value,
    source,
    visibility: 'always',
    collapsible
  };
}

/**
 * Helper to create a progress intent
 */
export function progressIntent(
  value: string,
  visibility: IntentVisibility = 'optional'
): OutputIntent {
  return {
    type: 'progress',
    value,
    source: 'directive',
    visibility,
    collapsible: false
  };
}

/**
 * Helper to create an error intent
 */
export function errorIntent(
  value: string,
  source: IntentSource = 'directive'
): OutputIntent {
  return {
    type: 'error',
    value,
    source,
    visibility: 'always',
    collapsible: false
  };
}
