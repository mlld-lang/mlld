/**
 * Built-in MCP tools for mlld language introspection.
 *
 * These tools provide LSP-like capabilities through MCP:
 * - mlld_validate: Syntax validation with error/warning reporting
 * - mlld_analyze: Full module analysis (exports, executables, imports, etc.)
 * - mlld_ast: Raw AST output for debugging
 *
 * All tools accept either a file path or inline code string.
 */

import { promises as fs } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { parse } from '@grammar/parser';
import { analyzeModule, type ModuleAnalysis } from '@sdk/analyze';
import { inferMlldMode, type MlldMode } from '@core/utils/mode';
import type { MCPToolSchema, ToolsCallResult } from './types';

// =============================================================================
// Tool Schemas
// =============================================================================

export const BUILTIN_TOOL_SCHEMAS: MCPToolSchema[] = [
  {
    name: 'mlld_validate',
    description: 'Validate mlld syntax and return errors/warnings. Accepts either a file path or inline code.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Path to .mld file to validate'
        },
        code: {
          type: 'string',
          description: 'Inline mlld code to validate'
        },
        mode: {
          type: 'string',
          description: 'Parsing mode: "strict" or "markdown" (default: inferred from file extension, or "strict" for inline code)'
        }
      },
      required: []
    }
  },
  {
    name: 'mlld_analyze',
    description: 'Full module analysis: exports, executables, imports, guards, variables, and statistics. Returns structured data about the module.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Path to .mld file to analyze'
        },
        code: {
          type: 'string',
          description: 'Inline mlld code to analyze'
        },
        mode: {
          type: 'string',
          description: 'Parsing mode: "strict" or "markdown"'
        },
        includeAst: {
          type: 'boolean',
          description: 'Include full AST in response (default: false)'
        }
      },
      required: []
    }
  },
  {
    name: 'mlld_ast',
    description: 'Get the parsed AST for mlld code. Useful for understanding syntax structure and debugging.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Path to .mld file to parse'
        },
        code: {
          type: 'string',
          description: 'Inline mlld code to parse'
        },
        mode: {
          type: 'string',
          description: 'Parsing mode: "strict" or "markdown"'
        }
      },
      required: []
    }
  }
];

// =============================================================================
// Types
// =============================================================================

interface ToolInput {
  file?: string;
  code?: string;
  mode?: string;
  includeAst?: boolean;
}

interface ResolvedInput {
  source: string;
  mode: MlldMode;
  filepath?: string;
}

// =============================================================================
// Input Resolution
// =============================================================================

async function resolveInput(args: ToolInput): Promise<ResolvedInput> {
  if (args.file && args.code) {
    throw new Error('Provide either "file" or "code", not both');
  }

  if (!args.file && !args.code) {
    throw new Error('Either "file" or "code" is required');
  }

  const mode = parseMode(args.mode);

  if (args.file) {
    const filepath = resolvePath(args.file);
    const source = await fs.readFile(filepath, 'utf8');
    const inferredMode = mode ?? inferMlldMode(filepath);
    return { source, mode: inferredMode, filepath };
  }

  return {
    source: args.code!,
    mode: mode ?? 'strict',
    filepath: undefined
  };
}

function parseMode(mode?: string): MlldMode | undefined {
  if (!mode) return undefined;
  if (mode === 'strict' || mode === 'markdown') return mode;
  throw new Error(`Invalid mode "${mode}". Must be "strict" or "markdown"`);
}

// =============================================================================
// Tool Implementations
// =============================================================================

async function executeValidate(args: ToolInput): Promise<ToolsCallResult> {
  try {
    const { source, mode, filepath } = await resolveInput(args);
    const result = await parse(source, { mode });

    const response: Record<string, unknown> = {
      valid: result.success,
      errors: result.success ? [] : [{
        message: result.error?.message ?? 'Parse failed',
        location: extractLocation(result.error)
      }],
      warnings: (result.warnings ?? []).map(w => ({
        message: w.message,
        location: w.location
      }))
    };

    if (filepath) {
      response.filepath = filepath;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      isError: !result.success
    };
  } catch (error) {
    return errorResult(error);
  }
}

async function executeAnalyze(args: ToolInput): Promise<ToolsCallResult> {
  try {
    const { source, mode, filepath } = await resolveInput(args);

    // For file inputs, use existing analyzeModule
    if (filepath) {
      const analysis = await analyzeModule(filepath);
      const response = formatAnalysis(analysis, args.includeAst);
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        isError: !analysis.valid
      };
    }

    // For inline code, parse and extract what we can
    const parseResult = await parse(source, { mode });

    if (!parseResult.success) {
      const response = {
        filepath: '<inline>',
        valid: false,
        errors: [{
          code: 'PARSE_ERROR',
          message: parseResult.error?.message ?? 'Parse failed',
          location: extractLocation(parseResult.error)
        }],
        warnings: [],
        exports: [],
        executables: [],
        guards: [],
        imports: [],
        variables: [],
        stats: { lines: source.split('\n').length, directives: 0, executables: 0, guards: 0, imports: 0, exports: 0 }
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        isError: true
      };
    }

    // Build a simplified analysis for inline code
    const ast = parseResult.ast;
    const analysis: ModuleAnalysis = {
      filepath: '<inline>',
      valid: true,
      errors: [],
      warnings: (parseResult.warnings ?? []).map(w => ({
        code: 'GRAMMAR_WARNING',
        message: w.message,
        location: w.location
      })),
      exports: extractExportsFromAst(ast),
      executables: extractExecutablesFromAst(ast),
      guards: extractGuardsFromAst(ast),
      imports: extractImportsFromAst(ast),
      variables: extractVariablesFromAst(ast),
      ast: () => ast,
      stats: computeStats(source, ast)
    };

    const response = formatAnalysis(analysis, args.includeAst);
    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      isError: false
    };
  } catch (error) {
    return errorResult(error);
  }
}

async function executeAst(args: ToolInput): Promise<ToolsCallResult> {
  try {
    const { source, mode, filepath } = await resolveInput(args);
    const result = await parse(source, { mode });

    if (!result.success) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false,
          error: result.error?.message ?? 'Parse failed',
          location: extractLocation(result.error)
        }, null, 2) }],
        isError: true
      };
    }

    const response: Record<string, unknown> = {
      success: true,
      ast: result.ast
    };

    if (filepath) {
      response.filepath = filepath;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
    };
  } catch (error) {
    return errorResult(error);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Execute a built-in tool by name.
 * Returns null if the tool name is not a built-in tool.
 */
export async function executeBuiltinTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolsCallResult | null> {
  switch (toolName) {
    case 'mlld_validate':
      return executeValidate(args as ToolInput);
    case 'mlld_analyze':
      return executeAnalyze(args as ToolInput);
    case 'mlld_ast':
      return executeAst(args as ToolInput);
    default:
      return null;
  }
}

/**
 * Check if a tool name is a built-in tool.
 */
export function isBuiltinTool(toolName: string): boolean {
  return BUILTIN_TOOL_SCHEMAS.some(schema => schema.name === toolName);
}

// =============================================================================
// Helpers
// =============================================================================

function errorResult(error: unknown): ToolsCallResult {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }, null, 2)
    }],
    isError: true
  };
}

function extractLocation(error: Error | null | undefined): { line?: number; column?: number } | undefined {
  if (!error) return undefined;
  const anyError = error as unknown as Record<string, unknown>;
  const location = anyError.location as Record<string, unknown> | undefined;
  if (location?.start) {
    const start = location.start as Record<string, unknown>;
    return { line: start.line as number, column: start.column as number };
  }
  return undefined;
}

function formatAnalysis(analysis: ModuleAnalysis, includeAst?: boolean): Record<string, unknown> {
  const response: Record<string, unknown> = {
    filepath: analysis.filepath,
    valid: analysis.valid,
    errors: analysis.errors,
    warnings: analysis.warnings,
    exports: analysis.exports,
    executables: analysis.executables,
    imports: analysis.imports,
    guards: analysis.guards,
    variables: analysis.variables,
    stats: analysis.stats
  };

  if (analysis.frontmatter) response.frontmatter = analysis.frontmatter;
  if (analysis.needs) response.needs = analysis.needs;
  if (analysis.profiles) response.profiles = analysis.profiles;
  if (includeAst && analysis.ast) response.ast = analysis.ast();

  return response;
}

// =============================================================================
// AST Extraction (simplified for inline code)
// =============================================================================

interface DirectiveNode {
  type: 'Directive';
  kind: string;
  variable?: { name: string } | Array<{ name: string }>;
  values?: Record<string, unknown>;
  params?: Array<{ name: string }>;
  labels?: string[];
  language?: string;
  source?: string;
  importType?: string;
  names?: Array<{ name: string; alias?: string }>;
  alias?: string;
  timing?: string;
  filter?: string;
}

function isDirectiveNode(node: unknown): node is DirectiveNode {
  return typeof node === 'object' && node !== null && (node as Record<string, unknown>).type === 'Directive';
}

function extractExportsFromAst(ast: unknown[]): string[] {
  const exports: string[] = [];
  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'export') continue;

    // Get exports from values.exports
    const values = node.values as Record<string, unknown> | undefined;
    const exportsList = values?.exports as Array<{ identifier: string }> | undefined;

    if (Array.isArray(exportsList)) {
      for (const e of exportsList) {
        if (e.identifier) exports.push(e.identifier);
      }
    }
  }
  return exports;
}

function extractExecutablesFromAst(ast: unknown[]): Array<{ name: string; params: string[]; labels: string[]; language?: string }> {
  const executables: Array<{ name: string; params: string[]; labels: string[]; language?: string }> = [];
  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'exe') continue;

    // Get identifier from values.identifier
    const values = node.values as Record<string, unknown> | undefined;
    const identifiers = values?.identifier as Array<{ identifier: string }> | undefined;
    const name = identifiers?.[0]?.identifier;
    if (!name) continue;

    // Get params from values.params
    const params = values?.params as Array<{ name: string }> | undefined;

    executables.push({
      name,
      params: (params ?? []).map(p => p.name),
      labels: node.labels ?? [],
      language: node.language
    });
  }
  return executables;
}

function extractGuardsFromAst(ast: unknown[]): Array<{ name?: string; timing: string; filter: string }> {
  const guards: Array<{ name?: string; timing: string; filter: string }> = [];
  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'guard') continue;

    // Get identifier from values.identifier if present
    const values = node.values as Record<string, unknown> | undefined;
    const identifiers = values?.identifier as Array<{ identifier: string }> | undefined;
    const name = identifiers?.[0]?.identifier;

    // Get timing and filter from values or node directly
    const timing = (values?.timing as string) ?? node.timing ?? 'before';
    const filter = (values?.filter as string) ?? node.filter ?? '';

    guards.push({ name, timing, filter });
  }
  return guards;
}

function extractImportsFromAst(ast: unknown[]): Array<{ source: string; type: string; names: string[]; alias?: string }> {
  const imports: Array<{ source: string; type: string; names: string[]; alias?: string }> = [];
  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'import') continue;

    // Get source from raw.path
    const raw = (node as Record<string, unknown>).raw as Record<string, unknown> | undefined;
    const source = (raw?.path as string) ?? '';

    // Get import names from values.imports
    const values = node.values as Record<string, unknown> | undefined;
    const importsList = values?.imports as Array<{ identifier: string }> | undefined;
    const names = (importsList ?? []).map(i => i.identifier);

    imports.push({
      source,
      type: node.subtype ?? 'module',
      names,
      alias: node.alias
    });
  }
  return imports;
}

function extractVariablesFromAst(ast: unknown[]): Array<{ name: string; exported: boolean; type: string }> {
  const variables: Array<{ name: string; exported: boolean; type: string }> = [];
  const exports = new Set(extractExportsFromAst(ast));

  for (const node of ast) {
    if (!isDirectiveNode(node)) continue;
    if (node.kind !== 'var' && node.kind !== 'path' && node.kind !== 'exe') continue;

    // Get identifier from values.identifier
    const values = node.values as Record<string, unknown> | undefined;
    const identifiers = values?.identifier as Array<{ identifier: string }> | undefined;

    for (const v of identifiers ?? []) {
      if (!v.identifier) continue;
      variables.push({
        name: v.identifier,
        exported: exports.has(v.identifier),
        type: node.kind === 'exe' ? 'executable' : 'unknown'
      });
    }
  }
  return variables;
}

function computeStats(source: string, ast: unknown[]): { lines: number; directives: number; executables: number; guards: number; imports: number; exports: number } {
  let directives = 0;
  let executables = 0;
  let guards = 0;
  let imports = 0;
  let exports = 0;

  for (const node of ast) {
    if (!isDirectiveNode(node)) continue;
    directives++;
    switch (node.kind) {
      case 'exe': executables++; break;
      case 'guard': guards++; break;
      case 'import': imports++; break;
      case 'export': exports++; break;
    }
  }

  return {
    lines: source.split('\n').length,
    directives,
    executables,
    guards,
    imports,
    exports
  };
}
