/**
 * Template Interpolator for Streaming Adapters
 *
 * Interpolates templates with event data and format-specific processing.
 *
 * Supported syntax:
 * - Variable references: `@evt.field`, `@evt.nested.field`
 * - Escape sequences: `@@` → `@`, `\@` → `@`, `%%` → `%`
 * - ANSI color codes: `%red%`, `%bold%` (processed based on format)
 *
 * Output formats:
 * - `text`: Plain text with variables replaced
 * - `ansi`: Variables replaced + ANSI codes expanded
 * - `json`: Variables JSON-stringified appropriately
 */

import { expandAnsiCodes, stripAnsiMarkers } from '@core/utils/ansi-processor';
import { extractPath } from './jsonpath';

export type TemplateFormat = 'text' | 'ansi' | 'json';

export interface InterpolateOptions {
  missingValue?: string;
  escapeHtml?: boolean;
}

/**
 * Interpolate a template with event data.
 *
 * @param template - Template string with `@evt.*` placeholders
 * @param eventData - Data extracted from the event
 * @param format - Output format ('text', 'ansi', or 'json')
 * @param options - Additional options
 * @returns Interpolated string
 */
export function interpolateTemplate(
  template: string,
  eventData: Record<string, unknown>,
  format: TemplateFormat = 'text',
  options?: InterpolateOptions
): string {
  const { missingValue = '' } = options ?? {};

  // Step 1: Replace @evt.* variables
  let result = replaceVariables(template, eventData, format, missingValue);

  // Step 2: Process ANSI codes based on format
  // (Do this BEFORE escape processing so %bold%%red% works correctly)
  if (format === 'ansi') {
    result = expandAnsiCodes(result);
  } else if (format === 'text' || format === 'json') {
    result = stripAnsiMarkers(result);
  }

  // Step 3: Process escape sequences (after ANSI so %% escapes work)
  result = processEscapes(result);

  return result;
}

/**
 * Replace @evt.* variables in a template.
 */
function replaceVariables(
  template: string,
  eventData: Record<string, unknown>,
  format: TemplateFormat,
  missingValue: string
): string {
  // Match @evt.path or @evt[index].path patterns
  // Uses negative lookbehind to skip escaped @@ and \@
  const variablePattern = /(?<![@\\])@evt\.([a-zA-Z_][a-zA-Z0-9_]*(-[a-zA-Z0-9_]+)*(?:\.[a-zA-Z_][a-zA-Z0-9_]*(-[a-zA-Z0-9_]+)*|\[\d+\])*)/g;

  return template.replace(variablePattern, (_match, path: string) => {
    const value = extractPath(eventData, path, { returnUndefined: true });

    if (value === undefined) {
      return missingValue;
    }

    return formatValue(value, format);
  });
}

/**
 * Format a value for output based on format type.
 */
function formatValue(value: unknown, format: TemplateFormat): string {
  if (value === null) {
    return format === 'json' ? 'null' : '';
  }

  if (value === undefined) {
    return format === 'json' ? 'null' : '';
  }

  if (typeof value === 'string') {
    if (format === 'json') {
      // JSON format: quote strings
      return JSON.stringify(value);
    }
    // text/ansi: use raw string
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    // Numbers and booleans: no quoting needed
    return String(value);
  }

  if (Array.isArray(value) || typeof value === 'object') {
    // Objects and arrays: always stringify
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Process escape sequences in a template.
 * - \@ → @
 * - @@ → @
 * - %% → %
 */
function processEscapes(text: string): string {
  return text
    .replace(/\\@/g, '@')
    .replace(/@@/g, '@')
    .replace(/%%/g, '%');
}

/**
 * Apply templates to event data for all output formats.
 *
 * Returns an object with plain, ansi, and optionally json formats.
 */
export interface FormattedOutput {
  plain: string;
  ansi: string;
  json?: string;
}

export interface EventTemplates {
  text?: string;
  ansi?: string;
  json?: string;
}

/**
 * Apply templates to produce formatted output in multiple formats.
 */
export function applyTemplates(
  eventData: Record<string, unknown>,
  templates: EventTemplates,
  options?: InterpolateOptions
): FormattedOutput {
  const result: FormattedOutput = {
    plain: '',
    ansi: ''
  };

  // Use text template for plain output
  if (templates.text) {
    result.plain = interpolateTemplate(templates.text, eventData, 'text', options);
  }

  // Use ansi template for colored output, fallback to text
  if (templates.ansi) {
    result.ansi = interpolateTemplate(templates.ansi, eventData, 'ansi', options);
  } else if (templates.text) {
    result.ansi = interpolateTemplate(templates.text, eventData, 'text', options);
  }

  // Use json template if specified
  if (templates.json) {
    result.json = interpolateTemplate(templates.json, eventData, 'json', options);
  }

  return result;
}

/**
 * Check if a string contains template variables.
 */
export function hasTemplateVariables(template: string): boolean {
  return /(?<![@\\])@evt\.[a-zA-Z_-]/.test(template);
}

/**
 * Extract variable paths from a template.
 */
export function extractVariablePaths(template: string): string[] {
  const variablePattern = /(?<![@\\])@evt\.([a-zA-Z_][a-zA-Z0-9_]*(-[a-zA-Z0-9_]+)*(?:\.[a-zA-Z_][a-zA-Z0-9_]*(-[a-zA-Z0-9_]+)*|\[\d+\])*)/g;
  const paths: string[] = [];
  let match;

  while ((match = variablePattern.exec(template)) !== null) {
    paths.push(match[1]);
  }

  return paths;
}

/**
 * Create a simple template that outputs a single field.
 */
export function createFieldTemplate(fieldName: string): string {
  return `@evt.${fieldName}`;
}

/**
 * Create default templates for common event types.
 */
export const DEFAULT_TEMPLATES = {
  thinking: {
    text: '@evt.text',
    ansi: '%dim%@evt.text%reset%'
  },
  message: {
    text: '@evt.chunk',
    ansi: '@evt.chunk'
  },
  toolUse: {
    text: '[@evt.name] @evt.input',
    ansi: '%cyan%[@evt.name]%reset% @evt.input'
  },
  toolResult: {
    text: '[@evt.toolUseId] @evt.result',
    ansi: '%green%[@evt.toolUseId]%reset% @evt.result'
  },
  error: {
    text: 'Error: @evt.message',
    ansi: '%red%Error:%reset% @evt.message'
  },
  metadata: {
    text: 'Tokens: @evt.inputTokens in / @evt.outputTokens out',
    ansi: '%dim%Tokens: @evt.inputTokens in / @evt.outputTokens out%reset%'
  }
};
