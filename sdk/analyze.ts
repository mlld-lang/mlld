/**
 * Static Module Analysis API
 *
 * Provides static AST analysis of mlld modules without execution.
 * Enables tool discovery, validation, and metadata extraction.
 *
 * ## Use Cases
 * - MCP proxy tool discovery (extract exported functions, signatures, labels)
 * - Module registry validation (check exports exist, needs satisfied)
 * - IDE/LSP features (autocomplete, go-to-definition, hover info)
 * - Security auditing (find unguarded network functions, label coverage)
 * - Documentation generation (extract function signatures, descriptions)
 *
 * ## API
 *
 * ```typescript
 * const analysis = await analyzeModule('./tools/github.mld');
 *
 * // Check validity
 * if (!analysis.valid) {
 *   console.error('Module has errors:', analysis.errors);
 * }
 *
 * // Discover exported tools
 * const tools = analysis.executables
 *   .filter(e => analysis.exports.includes(e.name));
 *
 * // Check security labels
 * const networkFunctions = analysis.executables
 *   .filter(e => e.labels.some(l => l.startsWith('net:')));
 *
 * // Access full AST for custom analysis (lazy-loaded)
 * const ast = analysis.ast?.();
 * ```
 *
 * ## Types
 *
 * ### ModuleAnalysis
 * Main result type returned by analyzeModule().
 *
 * - filepath: string - Absolute path to the analyzed module
 * - valid: boolean - True if module parsed without errors
 * - errors: AnalysisError[] - Parse errors and validation failures
 * - warnings: AnalysisWarning[] - Non-fatal issues (e.g., unused exports)
 *
 * Metadata:
 * - frontmatter?: Record<string, unknown> - Parsed YAML frontmatter
 * - needs?: ModuleNeeds - Required capabilities (runtimes, tools, packages)
 * - profiles?: ProfilesDeclaration - Named profile requirements
 *
 * Definitions:
 * - exports: string[] - Exported names (from /export directives)
 * - executables: ExecutableInfo[] - Functions (from /exe directives)
 * - guards: GuardInfo[] - Security guards (from /guard directives)
 * - imports: ImportInfo[] - Module imports (from /import directives)
 * - variables: VariableInfo[] - All variables with exported flag
 *
 * Advanced:
 * - ast?: () => MlldNode[] - Lazy getter for full AST
 * - stats: ModuleStats - Quick metrics (lines, directive count, etc.)
 *
 * ### ExecutableInfo
 * Information about a /exe defined function.
 *
 * - name: string - Function name (e.g., '@createIssue')
 * - params: string[] - Parameter names (e.g., ['repo', 'title', 'body'])
 * - labels: DataLabel[] - Security labels (e.g., ['net:w', 'paid'])
 * - language?: string - Execution language ('cmd', 'sh', 'node', 'js', 'py', 'python')
 * - description?: string - From comments/metadata (future)
 *
 * ### GuardInfo
 * Information about a /guard directive.
 *
 * - name?: string - Guard name if named (e.g., '@secretGuard')
 * - timing: 'before' | 'after' | 'always' - When guard runs
 * - filter: string - What it guards (e.g., 'secret', 'op:run', 'net:w')
 *
 * ### ImportInfo
 * Information about a /import directive.
 *
 * - source: string - Import path (e.g., '@author/module', './utils.mld')
 * - type: 'module' | 'static' | 'live' | 'cached' | 'local' | 'policy' | 'templates'
 * - names: string[] - Imported names, empty for namespace imports
 * - alias?: string - Namespace alias for `* as @alias` imports
 *
 * ### VariableInfo
 * Information about any variable in the module.
 *
 * - name: string - Variable name (e.g., '@config')
 * - exported: boolean - Whether included in /export
 * - type: 'primitive' | 'object' | 'array' | 'executable' | 'unknown'
 * - labels?: DataLabel[] - Security labels if any
 *
 * ### ModuleStats
 * Quick metrics about the module.
 *
 * - lines: number - Total line count
 * - directives: number - Count of directive nodes
 * - executables: number - Count of /exe definitions
 * - guards: number - Count of /guard definitions
 * - imports: number - Count of /import directives
 * - exports: number - Count of exported names
 *
 * ### AnalysisError / AnalysisWarning
 * Diagnostic information.
 *
 * - code: string - Error/warning code (e.g., 'PARSE_ERROR', 'EXPORT_NOT_FOUND')
 * - message: string - Human-readable description
 * - location?: SourceLocation - Where in the file
 *
 * ## Implementation Notes
 *
 * 1. Parse source with grammar parser (no execution)
 * 2. Extract frontmatter from FrontmatterNode
 * 3. Walk AST for directive nodes:
 *    - kind='exe' -> ExecutableInfo
 *    - kind='export' -> exports[]
 *    - kind='import' -> ImportInfo
 *    - kind='guard' -> GuardInfo
 *    - kind='var' -> VariableInfo
 * 4. Cross-reference exports with defined variables for validation
 * 5. Return ModuleAnalysis with lazy AST getter
 *
 * @module sdk/analyze
 */

import { promises as fs } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { parse } from '@grammar/parser';
import type { MlldNode, DirectiveNode, SourceLocation } from '@core/types';
import type { DataLabel } from '@core/types/security';
import type { ModuleNeeds } from '@core/registry/types';
import { extractFrontmatter as parseFrontmatterYaml } from '@core/registry/utils/ModuleMetadata';
import { normalizeModuleNeeds } from '@core/registry/utils/ModuleNeeds';
import { inferMlldMode } from '@core/utils/mode';
import { normalizeProfilesDeclaration, type ProfilesDeclaration } from '@core/policy/needs';

// =============================================================================
// Public Types
// =============================================================================

export interface ModuleAnalysis {
  /** Absolute path to the analyzed module */
  filepath: string;

  /** True if module parsed without errors */
  valid: boolean;

  /** Parse errors and validation failures */
  errors: AnalysisError[];

  /** Non-fatal issues */
  warnings: AnalysisWarning[];

  // -- Metadata --

  /** Parsed YAML frontmatter */
  frontmatter?: Record<string, unknown>;

  /** Required capabilities (from frontmatter or /needs) */
  needs?: ModuleNeeds;

  /** Named profile requirements (from frontmatter or /profiles) */
  profiles?: ProfilesDeclaration;

  // -- Definitions --

  /** Exported names from /export directives */
  exports: string[];

  /** Functions from /exe directives */
  executables: ExecutableInfo[];

  /** Security guards from /guard directives */
  guards: GuardInfo[];

  /** Module imports from /import directives */
  imports: ImportInfo[];

  /** All variables (with exported flag) */
  variables: VariableInfo[];

  // -- Advanced --

  /** Lazy getter for full AST (call to access) */
  ast?: () => MlldNode[];

  /** Quick metrics */
  stats: ModuleStats;
}

export interface ExecutableInfo {
  /** Function name (e.g., '@createIssue') */
  name: string;

  /** Parameter names */
  params: string[];

  /** Security labels (e.g., ['net:w', 'paid']) */
  labels: DataLabel[];

  /** Execution language */
  language?: 'cmd' | 'sh' | 'node' | 'js' | 'py' | 'python' | 'bash' | 'template';

  /** Description from comments/metadata */
  description?: string;
}

export interface GuardInfo {
  /** Guard name if named */
  name?: string;

  /** When guard runs */
  timing: 'before' | 'after' | 'always';

  /** What it guards (label or operation) */
  filter: string;
}

export interface ImportInfo {
  /** Import path */
  source: string;

  /** Import type */
  type: 'module' | 'static' | 'live' | 'cached' | 'local' | 'policy' | 'templates';

  /** Imported names (empty for namespace imports) */
  names: string[];

  /** Namespace alias for wildcard imports */
  alias?: string;
}

export interface VariableInfo {
  /** Variable name */
  name: string;

  /** Whether included in /export */
  exported: boolean;

  /** Inferred type */
  type: 'primitive' | 'object' | 'array' | 'executable' | 'unknown';

  /** Security labels if any */
  labels?: DataLabel[];
}

export interface ModuleStats {
  /** Total line count */
  lines: number;

  /** Count of directive nodes */
  directives: number;

  /** Count of /exe definitions */
  executables: number;

  /** Count of /guard definitions */
  guards: number;

  /** Count of /import directives */
  imports: number;

  /** Count of exported names */
  exports: number;
}

export interface AnalysisError {
  /** Error code */
  code: string;

  /** Human-readable message */
  message: string;

  /** Location in source */
  location?: SourceLocation;
}

export interface AnalysisWarning {
  /** Warning code */
  code: string;

  /** Human-readable message */
  message: string;

  /** Location in source */
  location?: SourceLocation;
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Analyze an mlld module without executing it.
 *
 * Parses the module and extracts metadata, exports, executables, guards,
 * imports, and variables via static AST analysis.
 *
 * @param filepath - Path to .mld file (relative or absolute)
 * @returns Promise<ModuleAnalysis> - Analysis results
 *
 * @example
 * ```typescript
 * const analysis = await analyzeModule('./tools/github.mld');
 *
 * // Get exported functions
 * const tools = analysis.executables
 *   .filter(e => analysis.exports.includes(e.name));
 *
 * // Check for network operations
 * const hasNetwork = analysis.executables
 *   .some(e => e.labels.includes('net:w'));
 * ```
 */
export async function analyzeModule(filepath: string): Promise<ModuleAnalysis> {
  const absolutePath = resolvePath(filepath);

  // Read source
  let source: string;
  try {
    source = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    return createErrorResult(absolutePath, {
      code: 'FILE_NOT_FOUND',
      message: `Cannot read file: ${(error as Error).message}`
    });
  }

  // Infer mode from file extension
  const mode = inferMlldMode(absolutePath);

  // Parse with mode
  const parseResult = await parse(source, { mode });

  if (!parseResult.success) {
    const parseError = parseResult.error;
    return createErrorResult(absolutePath, {
      code: 'PARSE_ERROR',
      message: parseError?.message ?? 'Parse failed',
      location: extractErrorLocation(parseError)
    });
  }

  const ast = parseResult.ast;
  const warnings: AnalysisWarning[] = parseResult.warnings.map(w => ({
    code: 'GRAMMAR_WARNING',
    message: w.message,
    location: w.location
  }));

  // Extract all data
  const frontmatter = extractFrontmatterFromSource(source);
  const needs = extractNeeds(frontmatter);
  const profiles = extractProfiles(frontmatter, ast);
  const exports = extractExports(ast);
  const executables = extractExecutables(ast);
  const guards = extractGuards(ast);
  const imports = extractImports(ast);
  const variables = extractVariables(ast, exports, executables);
  const stats = computeStats(source, ast, exports, executables, guards, imports);

  // Validation
  const errors: AnalysisError[] = [];
  validateExports(exports, variables, errors);

  return {
    filepath: absolutePath,
    valid: errors.length === 0,
    errors,
    warnings,
    frontmatter: frontmatter ?? undefined,
    needs,
    profiles,
    exports,
    executables,
    guards,
    imports,
    variables,
    ast: () => ast,
    stats
  };
}

// =============================================================================
// Extraction Functions
// =============================================================================

function extractFrontmatterFromSource(source: string): Record<string, unknown> | null {
  try {
    const fm = parseFrontmatterYaml(source);
    return Object.keys(fm).length > 0 ? fm : null;
  } catch {
    return null;
  }
}

function extractNeeds(frontmatter: Record<string, unknown> | null): ModuleNeeds | undefined {
  if (!frontmatter?.needs) return undefined;

  const normalized = normalizeModuleNeeds(frontmatter.needs);

  // Return undefined if empty
  if (normalized.runtimes.length === 0 &&
      normalized.tools.length === 0 &&
      Object.keys(normalized.packages).length === 0) {
    return undefined;
  }

  return normalized;
}

function extractProfiles(
  frontmatter: Record<string, unknown> | null,
  ast: MlldNode[]
): ProfilesDeclaration | undefined {
  const fromAst = extractProfilesFromAst(ast);
  if (fromAst && Object.keys(fromAst).length > 0) {
    return fromAst;
  }

  if (!frontmatter?.profiles) {
    return undefined;
  }

  try {
    const normalized = normalizeProfilesDeclaration(frontmatter.profiles);
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function extractProfilesFromAst(ast: MlldNode[]): ProfilesDeclaration | undefined {
  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'profiles') continue;
    const directive = node as DirectiveNode;
    try {
      return normalizeProfilesDeclaration((directive.values as any)?.profiles ?? {});
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extractExports(ast: MlldNode[]): string[] {
  const exports: string[] = [];

  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'export') continue;

    const directive = node as DirectiveNode;
    const exportValues = directive.values?.exports;

    if (Array.isArray(exportValues)) {
      for (const exp of exportValues) {
        // Export reference nodes have identifier field
        const name = exp?.identifier;
        if (typeof name === 'string') {
          exports.push(name.startsWith('@') ? name : `@${name}`);
        }
      }
    }
  }

  return exports;
}

function extractExecutables(ast: MlldNode[]): ExecutableInfo[] {
  const executables: ExecutableInfo[] = [];

  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'exe') continue;

    const directive = node as DirectiveNode;
    const meta = directive.meta ?? {};
    const values = directive.values ?? {};

    // Extract name from values.identifier[0].identifier
    let name = '';
    if (Array.isArray(values.identifier) && values.identifier[0]) {
      name = values.identifier[0].identifier ?? '';
    }
    if (typeof name === 'string' && name && !name.startsWith('@')) {
      name = `@${name}`;
    }

    // Extract params from values.params[].name
    const params: string[] = [];
    if (Array.isArray(values.params)) {
      for (const p of values.params) {
        const paramName = p?.name;
        if (typeof paramName === 'string') {
          params.push(paramName);
        }
      }
    }

    // Extract language
    const language = determineLanguage(directive);

    // Extract labels from values.securityLabels or meta.securityLabels
    const labels: DataLabel[] = [];
    if (Array.isArray(values.securityLabels)) {
      labels.push(...values.securityLabels);
    } else if (Array.isArray(meta.securityLabels)) {
      labels.push(...meta.securityLabels);
    }

    // Extract description from metadata if available
    const description = meta.metadata?.description as string | undefined;

    if (name) {
      executables.push({
        name,
        params,
        labels,
        language,
        description
      });
    }
  }

  return executables;
}

function determineLanguage(directive: DirectiveNode): ExecutableInfo['language'] | undefined {
  const raw = directive.raw ?? {};
  const meta = directive.meta ?? {};
  const subtype = directive.subtype;

  // Check raw.lang first (explicit language)
  if (raw.lang) {
    const lang = String(raw.lang).toLowerCase();
    if (['cmd', 'sh', 'bash', 'node', 'js', 'py', 'python'].includes(lang)) {
      return lang as ExecutableInfo['language'];
    }
  }

  // Check meta.language
  if (meta.language) {
    const lang = String(meta.language).toLowerCase();
    if (['cmd', 'sh', 'bash', 'node', 'js', 'py', 'python'].includes(lang)) {
      return lang as ExecutableInfo['language'];
    }
  }

  // Infer from subtype
  if (subtype === 'exeCommand') {
    return 'cmd';
  }
  if (subtype === 'exeCode') {
    // Default to js for code blocks
    return 'js';
  }

  // Check if it's a template (no run/code body)
  if (!raw.command && !raw.code) {
    return 'template';
  }

  return undefined;
}

function extractGuards(ast: MlldNode[]): GuardInfo[] {
  const guards: GuardInfo[] = [];

  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'guard') continue;

    const directive = node as DirectiveNode;
    const raw = directive.raw ?? {};
    const meta = directive.meta ?? {};
    const values = directive.values ?? {};

    // Extract name from values.name[0].identifier or raw.name
    let name: string | undefined;
    if (Array.isArray(values.name) && values.name[0]?.identifier) {
      name = values.name[0].identifier;
    } else if (typeof raw.name === 'string') {
      name = raw.name;
    }
    if (name && !name.startsWith('@')) {
      name = `@${name}`;
    }

    // Timing from raw.timing or meta.timing
    const timing = (raw.timing ?? meta.timing ?? 'before') as GuardInfo['timing'];

    // Filter from meta.filterValue or raw.filter
    const filter = (meta.filterValue ?? raw.filter ?? '') as string;

    guards.push({
      name: name || undefined,
      timing,
      filter
    });
  }

  return guards;
}

function extractImports(ast: MlldNode[]): ImportInfo[] {
  const imports: ImportInfo[] = [];

  for (const node of ast) {
    if (!isDirectiveNode(node) || node.kind !== 'import') continue;

    const directive = node as DirectiveNode;
    const raw = directive.raw ?? {};
    const meta = directive.meta ?? {};
    const values = directive.values ?? {};

    // Extract source path from values.path[].content or raw.path
    let source = '';
    if (Array.isArray(values.path)) {
      source = values.path.map((p: any) => p?.content ?? p?.value ?? '').join('');
    } else if (raw.path) {
      source = String(raw.path);
    }

    // Extract import type
    const importType = (meta.importType ?? 'module') as ImportInfo['type'];

    // Extract names and alias
    const names: string[] = [];
    let alias: string | undefined;

    // For namespace imports (subtype: 'importNamespace'), alias is in raw.namespace
    if (directive.subtype === 'importNamespace') {
      alias = raw.namespace as string | undefined;
      if (alias && !alias.startsWith('@')) {
        alias = `@${alias}`;
      }
    } else if (Array.isArray(values.imports)) {
      for (const imp of values.imports) {
        if (imp?.identifier === '*') {
          // Wildcard import with alias
          alias = imp?.alias;
          if (alias && !alias.startsWith('@')) {
            alias = `@${alias}`;
          }
        } else if (imp?.identifier) {
          const name = imp.identifier;
          names.push(name.startsWith('@') ? name : `@${name}`);
        }
      }
    }

    imports.push({
      source,
      type: importType,
      names,
      alias
    });
  }

  return imports;
}

function extractVariables(
  ast: MlldNode[],
  exports: string[],
  executables: ExecutableInfo[]
): VariableInfo[] {
  const variables: VariableInfo[] = [];
  const exportSet = new Set(exports);

  for (const node of ast) {
    if (!isDirectiveNode(node)) continue;

    const directive = node as DirectiveNode;
    const values = directive.values ?? {};

    // Handle /var directives
    if (directive.kind === 'var') {
      // Extract name from values.identifier[0].identifier
      let name = '';
      if (Array.isArray(values.identifier) && values.identifier[0]) {
        name = values.identifier[0].identifier ?? '';
      }
      if (typeof name === 'string' && name && !name.startsWith('@')) {
        name = `@${name}`;
      }

      if (!name) continue;

      const varType = inferVariableType(directive);
      const labels = extractLabelsFromDirective(directive);

      variables.push({
        name,
        exported: exportSet.has(name),
        type: varType,
        labels: labels.length > 0 ? labels : undefined
      });
    }

    // Handle /exe directives (they're also variables)
    if (directive.kind === 'exe') {
      // Extract name from values.identifier[0].identifier
      let name = '';
      if (Array.isArray(values.identifier) && values.identifier[0]) {
        name = values.identifier[0].identifier ?? '';
      }
      if (typeof name === 'string' && name && !name.startsWith('@')) {
        name = `@${name}`;
      }

      if (!name) continue;

      // Find the executable info for labels
      const execInfo = executables.find(e => e.name === name);

      variables.push({
        name,
        exported: exportSet.has(name),
        type: 'executable',
        labels: execInfo?.labels?.length ? execInfo.labels : undefined
      });
    }
  }

  return variables;
}

function inferVariableType(directive: DirectiveNode): VariableInfo['type'] {
  const meta = directive.meta ?? {};
  const values = directive.values ?? {};

  // Check meta.inferredType first
  const inferredType = meta.inferredType as string | undefined;
  if (inferredType === 'array') return 'array';
  if (inferredType === 'object') return 'object';
  if (inferredType === 'primitive' || inferredType === 'number' || inferredType === 'boolean') {
    return 'primitive';
  }
  if (inferredType === 'template' || inferredType === 'string') {
    return 'primitive';
  }

  // Check values.value structure
  if (Array.isArray(values.value)) {
    const firstValue = values.value[0];
    if (firstValue?.type === 'Literal') {
      const valueType = firstValue.valueType as string | undefined;
      if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
        return 'primitive';
      }
    }
    // Check if it's an array value (value is a raw number/array literal)
    if (typeof firstValue === 'number') {
      return 'primitive';
    }
  }

  return 'unknown';
}

function extractLabelsFromDirective(directive: DirectiveNode): DataLabel[] {
  const meta = directive.meta ?? {};
  const values = directive.values ?? {};
  const labels: DataLabel[] = [];

  if (Array.isArray(meta.securityLabels)) {
    labels.push(...meta.securityLabels);
  }
  if (Array.isArray(values.securityLabels)) {
    labels.push(...values.securityLabels);
  }

  return labels;
}

function computeStats(
  source: string,
  ast: MlldNode[],
  exports: string[],
  executables: ExecutableInfo[],
  guards: GuardInfo[],
  imports: ImportInfo[]
): ModuleStats {
  const lines = source.split('\n').length;

  let directives = 0;
  for (const node of ast) {
    if (isDirectiveNode(node)) {
      directives++;
    }
  }

  return {
    lines,
    directives,
    executables: executables.length,
    guards: guards.length,
    imports: imports.length,
    exports: exports.length
  };
}

// =============================================================================
// Validation
// =============================================================================

function validateExports(
  exports: string[],
  variables: VariableInfo[],
  errors: AnalysisError[]
): void {
  const definedNames = new Set(variables.map(v => v.name));

  for (const exportName of exports) {
    if (!definedNames.has(exportName)) {
      errors.push({
        code: 'EXPORT_NOT_FOUND',
        message: `Exported '${exportName}' is not defined in the module`
      });
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function isDirectiveNode(node: MlldNode): node is DirectiveNode {
  return node.type === 'Directive';
}

function createErrorResult(filepath: string, error: AnalysisError): ModuleAnalysis {
  return {
    filepath,
    valid: false,
    errors: [error],
    warnings: [],
    exports: [],
    executables: [],
    guards: [],
    imports: [],
    variables: [],
    stats: { lines: 0, directives: 0, executables: 0, guards: 0, imports: 0, exports: 0 }
  };
}

function extractErrorLocation(error: Error | undefined): SourceLocation | undefined {
  if (!error) return undefined;

  const anyError = error as any;
  if (anyError.location) {
    return {
      line: anyError.location.start?.line,
      column: anyError.location.start?.column,
      offset: anyError.location.start?.offset
    };
  }

  return undefined;
}
