/**
 * Static Analysis CLI Command
 * Analyzes mlld modules without executing them
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors';
import { initializePatterns, enhanceParseError } from '@core/errors/patterns/init';
import { DependencyDetector } from '@core/utils/dependency-detector';
import { parseSync } from '@grammar/parser';
import { builtinTransformers } from '@interpreter/builtin/transformers';
import * as yaml from 'js-yaml';
import type { MlldNode, ImportDirectiveNode, ExportDirectiveNode, GuardDirectiveNode, ExecutableDirectiveNode, RunDirective, ExecDirective } from '@core/types';

export interface AnalyzeOptions {
  format?: 'json' | 'text';
  ast?: boolean;
  checkVariables?: boolean;
  errorOnWarnings?: boolean;
}

export interface AnalysisError {
  message: string;
  line?: number;
  column?: number;
}

export interface ExecutableInfo {
  name: string;
  params?: string[];
  labels?: string[];
}

export interface ImportInfo {
  from: string;
  names?: string[];
}

export interface GuardInfo {
  name: string;
  timing: string;
  label?: string;
}

export interface NeedsInfo {
  cmd?: string[];
  node?: string[];
  py?: string[];
}

export interface UndefinedVariableWarning {
  variable: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface VariableRedefinitionWarning {
  variable: string;
  line?: number;
  column?: number;
  originalLine?: number;
  originalColumn?: number;
  reason?: 'builtin-conflict' | 'reserved-conflict' | 'scope-redefinition';
  suggestion?: string;
}

export type AntiPatternWarningCode =
  | 'mutable-state'
  | 'when-exe-implicit-return'
  | 'deprecated-json-transform'
  | 'exe-parameter-shadowing';

export interface AntiPatternWarning {
  code: AntiPatternWarningCode;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface AnalyzeResult {
  filepath: string;
  valid: boolean;
  errors?: AnalysisError[];
  warnings?: UndefinedVariableWarning[];
  redefinitions?: VariableRedefinitionWarning[];
  antiPatterns?: AntiPatternWarning[];
  executables?: ExecutableInfo[];
  exports?: string[];
  imports?: ImportInfo[];
  guards?: GuardInfo[];
  needs?: NeedsInfo;
  ast?: MlldNode[];
}

/**
 * Walk AST recursively, handling all node structures
 */
function walkAST(nodes: MlldNode[], callback: (node: MlldNode) => void): void {
  function walkNode(node: any): void {
    if (!node || typeof node !== 'object') return;

    // Call callback for nodes with a type
    if (node.type) {
      callback(node);
    }

    // Traverse arrays
    if (Array.isArray(node)) {
      for (const item of node) {
        walkNode(item);
      }
      return;
    }

    // Traverse known structural properties
    if (node.body) walkNode(node.body);
    if (node.children) walkNode(node.children);
    if (node.entries) {
      for (const entry of node.entries) {
        walkNode(entry.value);
        walkNode(entry.key);
      }
    }
    if (node.values) {
      for (const key in node.values) {
        walkNode(node.values[key]);
      }
    }
    // For expression nodes
    if (node.left) walkNode(node.left);
    if (node.right) walkNode(node.right);
    if (node.condition) walkNode(node.condition);
    if (node.consequent) walkNode(node.consequent);
    if (node.alternate) walkNode(node.alternate);
    if (node.expression) walkNode(node.expression);
    if (node.args) walkNode(node.args);
    if (node.elements) walkNode(node.elements);
  }

  walkNode(nodes);
}

/**
 * Extract text content from node array
 */
function extractText(nodes: MlldNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .filter((n): n is { type: 'Text'; content: string } => n.type === 'Text')
    .map(n => n.content)
    .join('');
}

/**
 * Builtin variables that are always available without declaration
 */
const BUILTIN_TRANSFORMER_NAMES = builtinTransformers.flatMap(transformer => [
  transformer.name,
  transformer.uppercase,
]);

const RESERVED_VARIABLE_NAMES = new Set([
  'now', 'base', 'root', 'debug', 'INPUT', 'mx', 'fm',
  'payload', 'state', 'keychain', 'input', 'ctx', 'pipeline'
]);

const SHADOWABLE_BUILTIN_NAMES = new Set([
  ...BUILTIN_TRANSFORMER_NAMES,
  'keep',
  'keepStructured'
]);

const BUILTIN_VARIABLES = new Set([
  ...RESERVED_VARIABLE_NAMES,
  ...SHADOWABLE_BUILTIN_NAMES,
  // Builtin helpers
  'yaml', 'html', 'text'
]);

const DEPRECATED_JSON_BASE_NAMES = new Set(['json', 'JSON']);
const VALIDATE_CONFIG_FILENAMES = ['mlld-config.json', 'mlld.config.json'];
const WARNING_CODE_ALIASES: Record<string, AntiPatternWarningCode> = {
  'parameter-shadowing': 'exe-parameter-shadowing'
};
const SUPPRESSIBLE_WARNING_CODES = new Set<AntiPatternWarningCode>([
  'mutable-state',
  'when-exe-implicit-return',
  'deprecated-json-transform',
  'exe-parameter-shadowing'
]);
const GENERIC_EXE_PARAMETER_SUGGESTIONS = new Map<string, string>([
  ['result', 'status'],
  ['output', 'finalOutput'],
  ['response', 'modelResponse'],
  ['data', 'inputData'],
  ['value', 'inputValue']
]);

/**
 * Common mistakes: variable.field patterns that are wrong
 * Maps "identifier.field" to suggestion message
 */
const SUSPICIOUS_FIELD_ACCESS: Record<string, string> = {
  'mx.now': '@now is a reserved variable, not @mx.now',
  'mx.base': '@base is a reserved variable, not @mx.base',
  'ctx.now': '@now is a reserved variable, not @ctx.now',
};

function normalizeSuppressedWarningCode(code: string): AntiPatternWarningCode | null {
  const normalized = code.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const aliased = WARNING_CODE_ALIASES[normalized];
  if (aliased) {
    return aliased;
  }

  if (SUPPRESSIBLE_WARNING_CODES.has(normalized as AntiPatternWarningCode)) {
    return normalized as AntiPatternWarningCode;
  }

  return null;
}

async function findNearestValidateConfigPath(moduleFilepath: string): Promise<string | null> {
  let currentDir = path.dirname(path.resolve(moduleFilepath));
  const rootDir = path.parse(currentDir).root;

  while (true) {
    for (const configFilename of VALIDATE_CONFIG_FILENAMES) {
      const configPath = path.join(currentDir, configFilename);
      try {
        await fs.access(configPath);
        return configPath;
      } catch {
        // Try the next config name or parent directory.
      }
    }

    if (currentDir === rootDir) {
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

async function loadSuppressedWarningCodes(moduleFilepath: string): Promise<Set<AntiPatternWarningCode>> {
  const configPath = await findNearestValidateConfigPath(moduleFilepath);
  if (!configPath) {
    return new Set();
  }

  try {
    const configRaw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(configRaw) as {
      validate?: {
        suppressWarnings?: unknown;
      };
    };

    if (!Array.isArray(parsed.validate?.suppressWarnings)) {
      return new Set();
    }

    const suppressedCodes = new Set<AntiPatternWarningCode>();
    for (const value of parsed.validate.suppressWarnings) {
      if (typeof value !== 'string') {
        continue;
      }
      const normalizedCode = normalizeSuppressedWarningCode(value);
      if (normalizedCode) {
        suppressedCodes.add(normalizedCode);
      }
    }
    return suppressedCodes;
  } catch {
    // Analyze stays resilient when config parsing fails.
    return new Set();
  }
}

/**
 * Detect undefined variable references in AST
 */
function detectUndefinedVariables(ast: MlldNode[]): UndefinedVariableWarning[] {
  const warnings: UndefinedVariableWarning[] = [];
  const declared = new Set<string>();

  // First pass: collect all declarations
  walkAST(ast, (node: any) => {
    // var @name = ...
    if (node.type === 'Directive' && node.kind === 'var') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        declared.add(identNode.identifier);
      }
    }

    // guard @name before/after ... = when [...]
    if (node.type === 'Directive' && node.kind === 'guard') {
      const nameNode = node.values?.name?.[0];
      if (nameNode?.identifier) {
        declared.add(nameNode.identifier);
      }
    }

    // exe @name(...) = ...
    if (node.type === 'Directive' && node.kind === 'exe') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        declared.add(identNode.identifier);
        // Also add parameter names as declared within exe scope
        if (node.values?.params) {
          for (const param of node.values.params) {
            if (param.name) declared.add(param.name);
          }
        }
      }
    }

    // import { @name } from ...
    if (node.type === 'Directive' && node.kind === 'import') {
      // Handle imports array (import { @a, @b } from ...)
      if (node.values?.imports) {
        for (const imp of node.values.imports) {
          if (imp.identifier) declared.add(imp.identifier);
          if (imp.alias) declared.add(imp.alias);
        }
      }
      // Legacy: handle names array
      if (node.values?.names) {
        for (const name of node.values.names) {
          if (name.identifier) declared.add(name.identifier);
          if (name.alias) declared.add(name.alias);
        }
      }
      // import "..." as @namespace (namespace is array with Text node containing the alias)
      if (node.values?.namespace) {
        if (Array.isArray(node.values.namespace)) {
          for (const ns of node.values.namespace) {
            if (ns.content) declared.add(ns.content);
            if (ns.identifier) declared.add(ns.identifier);
          }
        } else if (node.values.namespace.identifier) {
          declared.add(node.values.namespace.identifier);
        }
      }
      // import "@payload" as @p (aliased imports)
      if (node.values?.alias?.identifier) {
        declared.add(node.values.alias.identifier);
      }
    }

    // for @item in ... (directive form)
    if (node.type === 'Directive' && node.kind === 'for') {
      const varNode = node.values?.variable?.[0];
      if (varNode?.identifier) {
        declared.add(varNode.identifier);
      }
      // Key variable in key-value iteration: for @key, @value in @obj
      const keyNode = node.values?.key?.[0];
      if (keyNode?.identifier) {
        declared.add(keyNode.identifier);
      }
    }

    // for @item in ... (expression form, e.g., in var assignments)
    if (node.type === 'ForExpression') {
      if (node.variable?.identifier) {
        declared.add(node.variable.identifier);
      }
      if (node.key?.identifier) {
        declared.add(node.key.identifier);
      }
    }

    // let @name = ... (in blocks)
    if (node.type === 'LetAssignment') {
      if (node.identifier) declared.add(node.identifier);
    }
  });

  // Second pass: check all variable references
  const seen = new Set<string>(); // Avoid duplicate warnings for same variable
  const seenPaths = new Set<string>(); // Avoid duplicate warnings for same path

  walkAST(ast, (node: any) => {
    if (node.type === 'VariableReference') {
      const name = node.identifier;
      if (!name) return;

      // Build full path for suspicious access check (e.g., mx.now)
      let fullPath = name;
      if (node.fields && node.fields.length > 0) {
        const firstField = node.fields[0];
        if (firstField.type === 'field' && firstField.value) {
          fullPath = `${name}.${firstField.value}`;
        }
      }

      // Check for suspicious field access patterns (even if base variable is valid)
      if (SUSPICIOUS_FIELD_ACCESS[fullPath] && !seenPaths.has(fullPath)) {
        seenPaths.add(fullPath);
        warnings.push({
          variable: fullPath,
          line: node.location?.start?.line,
          column: node.location?.start?.column,
          suggestion: SUSPICIOUS_FIELD_ACCESS[fullPath],
        });
        return; // Don't also warn about the base variable
      }

      // Skip if already declared, builtin, or already warned
      if (declared.has(name) || BUILTIN_VARIABLES.has(name) || seen.has(name)) {
        return;
      }

      seen.add(name);

      warnings.push({
        variable: name,
        line: node.location?.start?.line,
        column: node.location?.start?.column,
      });
    }
  });

  return warnings;
}

/**
 * Detect variable redefinitions in nested scopes
 * This catches cases like:
 *   var @x = 1
 *   when @cond [
 *     var @x = 2  // ERROR: redefinition of outer scope variable
 *   ]
 */
function detectVariableRedefinitions(ast: MlldNode[]): VariableRedefinitionWarning[] {
  const warnings: VariableRedefinitionWarning[] = [];

  // Track declarations with their scope depth and location
  interface VarDeclaration {
    name: string;
    depth: number;
    line?: number;
    column?: number;
  }

  const declarations: VarDeclaration[] = [];

  function findOuterDeclaration(name: string, currentDepth: number): VarDeclaration | undefined {
    // Find a declaration of this name at a shallower depth
    for (const decl of declarations) {
      if (decl.name === name && decl.depth < currentDepth) {
        return decl;
      }
    }
    return undefined;
  }

  function walkWithScope(nodes: any, depth: number): void {
    if (!nodes) return;

    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        walkWithScope(node, depth);
      }
      return;
    }

    if (typeof nodes !== 'object') return;

    const node = nodes;

    // Check for var declarations
    if (node.type === 'Directive' && node.kind === 'var') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        const name = identNode.identifier;
        const line = node.location?.start?.line;
        const column = node.location?.start?.column;

        if (RESERVED_VARIABLE_NAMES.has(name)) {
          warnings.push({
            variable: name,
            line,
            column,
            reason: 'reserved-conflict',
            suggestion: `Cannot redefine reserved @${name}.`,
          });
        } else if (SHADOWABLE_BUILTIN_NAMES.has(name)) {
          warnings.push({
            variable: name,
            line,
            column,
            reason: 'builtin-conflict',
            suggestion: `@${name} shadows a built-in transform in this scope.`,
          });
        } else {
          // Check if this shadows an outer scope variable
          const outer = findOuterDeclaration(name, depth);
          if (outer) {
            warnings.push({
              variable: name,
              line,
              column,
              originalLine: outer.line,
              originalColumn: outer.column,
              reason: 'scope-redefinition',
            });
          }
        }

        // Record this declaration
        declarations.push({ name, depth, line, column });
      }
    }

    // Track let declarations too (they can also cause issues)
    if (node.type === 'LetAssignment') {
      const name = node.identifier;
      if (name) {
        const line = node.location?.start?.line;
        const column = node.location?.start?.column;

        if (RESERVED_VARIABLE_NAMES.has(name)) {
          warnings.push({
            variable: name,
            line,
            column,
            reason: 'reserved-conflict',
            suggestion: `Cannot redefine reserved @${name}.`,
          });
        } else if (SHADOWABLE_BUILTIN_NAMES.has(name)) {
          warnings.push({
            variable: name,
            line,
            column,
            reason: 'builtin-conflict',
            suggestion: `@${name} shadows a built-in transform in this scope.`,
          });
        } else {
          const outer = findOuterDeclaration(name, depth);
          if (outer) {
            warnings.push({
              variable: name,
              line,
              column,
              originalLine: outer.line,
              originalColumn: outer.column,
              reason: 'scope-redefinition',
            });
          }
        }

        declarations.push({ name, depth, line, column });
      }
    }

    // Increase depth when entering blocks (body, children, or values.action for when blocks)
    const hasBlock = node.body || node.children || node.values?.action;
    const newDepth = hasBlock ? depth + 1 : depth;

    // Recurse into structural properties
    if (node.body) walkWithScope(node.body, newDepth);
    if (node.children) walkWithScope(node.children, newDepth);
    if (node.values) {
      for (const key in node.values) {
        // Skip identifier to avoid double-counting
        if (key !== 'identifier') {
          // action is a block scope (when blocks, for blocks)
          const scopeDepth = (key === 'action') ? newDepth : depth;
          walkWithScope(node.values[key], scopeDepth);
        }
      }
    }
    if (node.entries) {
      for (const entry of node.entries) {
        walkWithScope(entry.value, depth);
        walkWithScope(entry.key, depth);
      }
    }
  }

  walkWithScope(ast, 0);
  return warnings;
}

/**
 * Detect mutable-state anti-patterns where local @state objects are used with @state.stop
 */
function detectMutableStateAntiPatterns(ast: MlldNode[], sourceText: string): AntiPatternWarning[] {
  const stateObjectDeclarations: Array<{ line?: number; column?: number }> = [];

  walkAST(ast, (node: any) => {
    if (node.type === 'Directive' && node.kind === 'var') {
      const identifier = node.values?.identifier?.[0]?.identifier;
      const valueNode = node.values?.value?.[0];
      if (identifier === 'state' && valueNode?.type === 'object') {
        stateObjectDeclarations.push({
          line: node.location?.start?.line,
          column: node.location?.start?.column,
        });
      }
    }

    if (node.type === 'LetAssignment') {
      const valueNode = node.value?.[0];
      if (node.identifier === 'state' && valueNode?.type === 'object') {
        stateObjectDeclarations.push({
          line: node.location?.start?.line,
          column: node.location?.start?.column,
        });
      }
    }

  });

  const hasStateStopAccess = /@state\.stop\b/.test(sourceText);
  if (stateObjectDeclarations.length === 0 || !hasStateStopAccess) {
    return [];
  }

  return stateObjectDeclarations.map(declaration => ({
    code: 'mutable-state',
    message: 'Local @state object with @state.stop access is a mutable-state anti-pattern. @state is SDK-managed and local variable objects are immutable.',
    line: declaration.line,
    column: declaration.column,
    suggestion: 'Use a different variable name (for example @runState) and model updates by creating new values instead of mutating fields.'
  }));
}

function getNodeStart(node: any): { line?: number; column?: number } {
  const line = node?.location?.start?.line
    ?? node?.content?.[0]?.location?.start?.line;
  const column = node?.location?.start?.column
    ?? node?.content?.[0]?.location?.start?.column;
  return { line, column };
}

function isImplicitWhenExeReturnAction(action: any[]): boolean {
  if (!Array.isArray(action) || action.length === 0) {
    return false;
  }

  if (action.length !== 1) {
    return true;
  }

  const first = action[0];
  if (!first || typeof first !== 'object') {
    return true;
  }

  // Explicit return block form is clear and intentional.
  if (first.type === 'ExeBlock') {
    return false;
  }

  // Directive actions represent imperative effects/statements.
  if (first.type === 'Directive') {
    return false;
  }

  return true;
}

function detectWhenExeImplicitReturnAntiPatterns(ast: MlldNode[]): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  walkAST(ast, (node: any) => {
    if (node.type !== 'Directive' || node.kind !== 'exe' || node.subtype !== 'exeBlock') {
      return;
    }

    const statements = node.values?.statements;
    if (!Array.isArray(statements)) {
      return;
    }

    for (const statement of statements) {
      if (!statement || statement.type !== 'WhenExpression' || !Array.isArray(statement.conditions)) {
        continue;
      }

      for (const rawEntry of statement.conditions) {
        const entry = Array.isArray(rawEntry) && rawEntry.length === 1 ? rawEntry[0] : rawEntry;
        const action = entry?.action;

        if (!Array.isArray(action) || action.length === 0 || !isImplicitWhenExeReturnAction(action)) {
          continue;
        }

        const actionStart = getNodeStart(action[0]);
        const statementStart = getNodeStart(statement);
        warnings.push({
          code: 'when-exe-implicit-return',
          message: 'when action in an exe block returns from the exe when matched. Use block-form return to make return intent explicit.',
          line: actionStart.line ?? statementStart.line,
          column: actionStart.column ?? statementStart.column,
          suggestion: 'Use `when @cond => [ => @value ]` for explicit returns, or use a directive action for side effects.'
        });
      }
    }
  });

  return warnings;
}

function collectDeclaredNames(ast: MlldNode[]): Set<string> {
  const declared = new Set<string>();

  walkAST(ast, (node: any) => {
    if (node.type === 'Directive' && node.kind === 'var') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        declared.add(identNode.identifier);
      }
    }

    if (node.type === 'LetAssignment' && node.identifier) {
      declared.add(node.identifier);
    }

    if (node.type === 'Directive' && node.kind === 'exe') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        declared.add(identNode.identifier);
      }

      if (Array.isArray(node.values?.params)) {
        for (const param of node.values.params) {
          if (param?.name) {
            declared.add(param.name);
          }
        }
      }
    }

    if (node.type === 'Directive' && node.kind === 'import') {
      if (Array.isArray(node.values?.imports)) {
        for (const imp of node.values.imports) {
          if (imp?.identifier) declared.add(imp.identifier);
          if (imp?.alias) declared.add(imp.alias);
        }
      }
      if (Array.isArray(node.values?.names)) {
        for (const name of node.values.names) {
          if (name?.identifier) declared.add(name.identifier);
          if (name?.alias) declared.add(name.alias);
        }
      }
      if (node.values?.alias?.identifier) {
        declared.add(node.values.alias.identifier);
      }
      if (node.values?.namespace) {
        if (Array.isArray(node.values.namespace)) {
          for (const ns of node.values.namespace) {
            if (ns?.identifier) declared.add(ns.identifier);
            if (ns?.content) declared.add(ns.content);
          }
        } else if (node.values.namespace.identifier) {
          declared.add(node.values.namespace.identifier);
        }
      }
    }
  });

  return declared;
}

function getParseReplacementForJsonAlias(identifier: string): string | null {
  if (identifier === 'json' || identifier === 'JSON') {
    return 'parse';
  }

  if (identifier.startsWith('json.')) {
    return `parse.${identifier.slice('json.'.length)}`;
  }
  if (identifier.startsWith('JSON.')) {
    return `parse.${identifier.slice('JSON.'.length).toLowerCase()}`;
  }
  if (identifier.startsWith('json_')) {
    return `parse.${identifier.slice('json_'.length).toLowerCase()}`;
  }
  if (identifier.startsWith('JSON_')) {
    return `parse.${identifier.slice('JSON_'.length).toLowerCase()}`;
  }

  return null;
}

function detectDeprecatedJsonTransformAntiPatterns(ast: MlldNode[]): AntiPatternWarning[] {
  const declaredNames = collectDeclaredNames(ast);
  if (declaredNames.has('json') || declaredNames.has('JSON')) {
    return [];
  }

  const warnings: AntiPatternWarning[] = [];
  const seen = new Set<string>();
  const pushWarning = (identifier: string, location?: { start?: { line?: number; column?: number } }): void => {
    const replacement = getParseReplacementForJsonAlias(identifier);
    if (!replacement) {
      return;
    }

    const baseName = identifier.split(/[._]/)[0];
    if (DEPRECATED_JSON_BASE_NAMES.has(baseName) && declaredNames.has(baseName)) {
      return;
    }

    const line = location?.start?.line;
    const column = location?.start?.column;
    const dedupeKey = `${identifier}:${line ?? 0}:${column ?? 0}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    warnings.push({
      code: 'deprecated-json-transform',
      message: `@${identifier} is a deprecated alias for @${replacement}.`,
      line,
      column,
      suggestion: `Use @${replacement} instead.`
    });
  };

  const walkNode = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walkNode(child);
      }
      return;
    }

    const maybeRef = node as any;
    if (maybeRef.type === 'VariableReference') {
      if (maybeRef.valueType !== 'identifier') {
        const identifier = typeof maybeRef.identifier === 'string' ? maybeRef.identifier : '';
        if (identifier) {
          pushWarning(identifier, maybeRef.location);
        }
      }

      if (Array.isArray(maybeRef.pipes)) {
        for (const pipe of maybeRef.pipes) {
          if (!pipe || typeof pipe !== 'object') {
            continue;
          }
          const transform = typeof pipe.transform === 'string' ? pipe.transform : '';
          if (!transform) {
            continue;
          }
          pushWarning(transform, pipe.location);
        }
      }
    }

    if (typeof maybeRef.rawIdentifier === 'string' && maybeRef.rawIdentifier.length > 0) {
      pushWarning(maybeRef.rawIdentifier, maybeRef.location);
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
      walkNode(value);
    }
  };

  walkNode(ast);

  return warnings;
}

function detectExeParameterShadowingWarnings(ast: MlldNode[]): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const seen = new Set<string>();

  walkAST(ast, (node: any) => {
    if (node.type !== 'Directive' || node.kind !== 'exe') {
      return;
    }

    const exeName = node.values?.identifier?.[0]?.identifier ?? 'anonymous';
    const params = node.values?.params;
    if (!Array.isArray(params)) {
      return;
    }

    for (const param of params) {
      if (!param || typeof param !== 'object') {
        continue;
      }

      const paramName = typeof param.name === 'string' ? param.name : '';
      if (!paramName) {
        continue;
      }

      const suggestedName = GENERIC_EXE_PARAMETER_SUGGESTIONS.get(paramName.toLowerCase());
      if (!suggestedName) {
        continue;
      }

      const line = param.location?.start?.line ?? node.location?.start?.line;
      const column = param.location?.start?.column ?? node.location?.start?.column;
      const dedupeKey = `${exeName}:${paramName}:${line ?? 0}:${column ?? 0}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      warnings.push({
        code: 'exe-parameter-shadowing',
        message: `Parameter @${paramName} in @${exeName}() can shadow caller variables and cause accidental value collisions.`,
        line,
        column,
        suggestion: `Use a more specific name such as @${suggestedName}. If intentional, add "validate.suppressWarnings": ["exe-parameter-shadowing"] to mlld-config.json.`
      });
    }
  });

  return warnings;
}

/**
 * Extract executables from AST
 */
function extractExecutables(ast: MlldNode[]): ExecutableInfo[] {
  const executables: ExecutableInfo[] = [];

  walkAST(ast, (node) => {
    if (node.type === 'Directive' && node.kind === 'exe') {
      const exeNode = node as any;

      // Name is in values.identifier[0].identifier
      const identifierNode = exeNode.values?.identifier?.[0];
      const name = identifierNode?.identifier;

      if (name) {
        const exec: ExecutableInfo = { name };

        // Extract params if present - params[].name directly
        if (exeNode.values?.params && Array.isArray(exeNode.values.params)) {
          const params = exeNode.values.params
            .filter((p: any) => p.type === 'Parameter' && p.name)
            .map((p: any) => p.name);
          if (params.length > 0) {
            exec.params = params;
          }
        }

        // Extract labels if present
        if (exeNode.values?.labels && Array.isArray(exeNode.values.labels)) {
          const labels = exeNode.values.labels
            .filter((l: any) => l.type === 'Label' && l.name)
            .map((l: any) => l.name);
          if (labels.length > 0) {
            exec.labels = labels;
          }
        }

        executables.push(exec);
      }
    }
  });

  return executables;
}

/**
 * Extract exports from AST
 */
function extractExports(ast: MlldNode[]): string[] {
  const exports: string[] = [];

  walkAST(ast, (node) => {
    if (node.type === 'Directive' && node.kind === 'export') {
      const exportNode = node as any;
      if (exportNode.values?.exports && Array.isArray(exportNode.values.exports)) {
        for (const exp of exportNode.values.exports) {
          // Export items are VariableReference with identifier property
          if (exp.type === 'VariableReference' && exp.identifier) {
            exports.push(exp.identifier);
          }
        }
      }
    }
  });

  return [...new Set(exports)];
}

/**
 * Extract imports from AST
 */
function extractImports(ast: MlldNode[]): ImportInfo[] {
  const imports: ImportInfo[] = [];

  walkAST(ast, (node) => {
    if (node.type === 'Directive' && node.kind === 'import') {
      const importNode = node as any;

      // Path comes from raw.path which is the cleaned string
      const from = importNode.raw?.path;

      if (from) {
        const info: ImportInfo = { from };

        // Extract imported names
        if (importNode.values?.imports && Array.isArray(importNode.values.imports)) {
          const names: string[] = [];
          for (const imp of importNode.values.imports) {
            // Named imports are VariableReference with identifier
            if (imp.type === 'VariableReference' && imp.identifier) {
              names.push(imp.identifier);
            } else if (imp.type === 'ImportWildcard') {
              names.push('*');
            }
          }
          if (names.length > 0) {
            info.names = names;
          }
        }

        imports.push(info);
      }
    }
  });

  return imports;
}

/**
 * Extract guards from AST
 */
function extractGuards(ast: MlldNode[]): GuardInfo[] {
  const guards: GuardInfo[] = [];

  walkAST(ast, (node) => {
    if (node.type === 'Directive' && node.kind === 'guard') {
      const guardNode = node as GuardDirectiveNode;
      const name = (
        (guardNode.values?.name ?? []).find((part: any) => part?.type === 'VariableReference')?.identifier
        ?? extractText(guardNode.values?.name)
        ?? (typeof guardNode.raw?.name === 'string' ? guardNode.raw.name.replace(/^@/, '') : '')
      );

      if (name) {
        const timing = (
          (guardNode.values as Record<string, unknown> | undefined)?.timing
          ?? guardNode.meta?.timing
          ?? guardNode.raw?.timing
        );
        const guard: GuardInfo = {
          name,
          timing: typeof timing === 'string'
            ? timing
            : (guardNode.subtype === 'guardBefore' ? 'before' : 'after')
        };

        // Extract label if present
        if (guardNode.values?.label) {
          const label = extractText(guardNode.values.label);
          if (label) guard.label = label;
        }

        guards.push(guard);
      }
    }
  });

  return guards;
}

/**
 * Extract needs from frontmatter and AST analysis
 */
function extractNeeds(content: string, ast: MlldNode[]): NeedsInfo | undefined {
  const needs: NeedsInfo = {};

  // Check frontmatter first
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    try {
      const metadata = yaml.load(frontmatterMatch[1]) as any;
      if (metadata?.needs) {
        const needsArray = Array.isArray(metadata.needs) ? metadata.needs : [metadata.needs];
        for (const need of needsArray) {
          if (need === 'sh' || need === 'cmd') {
            needs.cmd = needs.cmd || [];
          }
          if (need === 'node' || need === 'js') {
            needs.node = needs.node || [];
          }
          if (need === 'py' || need === 'python') {
            needs.py = needs.py || [];
          }
        }
      }
    } catch {
      // Ignore YAML parse errors
    }
  }

  // Also detect from AST
  const detector = new DependencyDetector();
  const runtimeNeeds = detector.detectRuntimeNeeds(ast);

  for (const need of runtimeNeeds) {
    if (need === 'sh') {
      needs.cmd = needs.cmd || [];
    }
    if (need === 'js' || need === 'node') {
      needs.node = needs.node || [];
    }
    if (need === 'py') {
      needs.py = needs.py || [];
    }
  }

  // Return undefined if no needs detected
  if (Object.keys(needs).length === 0) {
    return undefined;
  }

  return needs;
}

/**
 * Analyze an mlld module without executing it
 */
export async function analyze(filepath: string, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const result: AnalyzeResult = {
    filepath: path.resolve(filepath),
    valid: true
  };

  try {
    const content = await fs.readFile(filepath, 'utf8');

    let ast: MlldNode[];
    try {
      // Use strict mode for .mld files, markdown mode for .mld.md files
      const mode = filepath.endsWith('.mld.md') ? 'markdown' : 'strict';
      ast = parseSync(content, { mode });
    } catch (parseError: any) {
      result.valid = false;

      // Try to enhance the error message
      await initializePatterns();
      const enhanced = await enhanceParseError(parseError, content, filepath);

      result.errors = [{
        message: enhanced?.message || parseError.message,
        line: parseError.location?.start?.line,
        column: parseError.location?.start?.column
      }];
      return result;
    }

    // Extract module information
    const executables = extractExecutables(ast);
    const exports = extractExports(ast);
    const imports = extractImports(ast);
    const guards = extractGuards(ast);
    const needs = extractNeeds(content, ast);

    if (executables.length > 0) result.executables = executables;
    if (exports.length > 0) result.exports = exports;
    if (imports.length > 0) result.imports = imports;
    if (guards.length > 0) result.guards = guards;
    if (needs) result.needs = needs;
    if (options.ast) result.ast = ast;

    // Check for undefined variables (enabled by default)
    if (options.checkVariables !== false) {
      const suppressedWarningCodes = await loadSuppressedWarningCodes(filepath);

      const warnings = detectUndefinedVariables(ast);
      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      // Check for variable redefinitions in nested scopes
      const redefinitions = detectVariableRedefinitions(ast);
      if (redefinitions.length > 0) {
        result.redefinitions = redefinitions;
      }

      const antiPatterns = [
        ...detectMutableStateAntiPatterns(ast, content),
        ...detectWhenExeImplicitReturnAntiPatterns(ast),
        ...detectDeprecatedJsonTransformAntiPatterns(ast),
        ...detectExeParameterShadowingWarnings(ast),
      ].filter(warning => !suppressedWarningCodes.has(warning.code));
      if (antiPatterns.length > 0) {
        result.antiPatterns = antiPatterns;
      }
    }

  } catch (error: any) {
    result.valid = false;
    result.errors = [{
      message: error.message
    }];
  }

  return result;
}

/**
 * Display analysis result
 */
function displayResult(result: AnalyzeResult, format: 'json' | 'text'): void {
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Text format
  console.log();
  console.log(chalk.bold(result.filepath));
  console.log();

  if (!result.valid) {
    console.log(chalk.red('Invalid module'));
    if (result.errors) {
      for (const err of result.errors) {
        const loc = err.line ? ` (line ${err.line}${err.column ? `:${err.column}` : ''})` : '';
        console.log(chalk.red(`  ${err.message}${loc}`));
      }
    }
    return;
  }

  console.log(chalk.green('Valid module'));
  console.log();

  const label = (s: string) => chalk.dim(s.padEnd(12));

  if (result.executables && result.executables.length > 0) {
    console.log(`${label('executables')} ${result.executables.map(e => e.name).join(', ')}`);
  }

  if (result.exports && result.exports.length > 0) {
    console.log(`${label('exports')} ${result.exports.join(', ')}`);
  }

  if (result.imports && result.imports.length > 0) {
    console.log(`${label('imports')}`);
    for (const imp of result.imports) {
      const names = imp.names ? ` (${imp.names.join(', ')})` : '';
      console.log(`  ${chalk.cyan(imp.from)}${names}`);
    }
  }

  if (result.guards && result.guards.length > 0) {
    console.log(`${label('guards')}`);
    for (const guard of result.guards) {
      const label_text = guard.label ? ` [${guard.label}]` : '';
      console.log(`  ${guard.name} (${guard.timing})${label_text}`);
    }
  }

  if (result.needs) {
    const needsList: string[] = [];
    if (result.needs.cmd) needsList.push('sh');
    if (result.needs.node) needsList.push('node');
    if (result.needs.py) needsList.push('py');
    console.log(`${label('needs')} ${needsList.join(', ')}`);
  }

  // Display warnings for undefined variables
  if (result.warnings && result.warnings.length > 0) {
    console.log();
    console.log(chalk.yellow(`Warnings (${result.warnings.length}):`));
    for (const warn of result.warnings) {
      const loc = warn.line ? ` (line ${warn.line}${warn.column ? `:${warn.column}` : ''})` : '';
      console.log(chalk.yellow(`  @${warn.variable}${loc} - undefined variable`));
      if (warn.suggestion) {
        console.log(chalk.dim(`    hint: ${warn.suggestion}`));
      }
    }
  }

  // Display informational notices and errors for variable redefinitions
  if (result.redefinitions && result.redefinitions.length > 0) {
    const builtinShadowWarnings = result.redefinitions.filter(redef => redef.reason === 'builtin-conflict');
    const hardErrors = result.redefinitions.filter(redef => redef.reason !== 'builtin-conflict');

    if (builtinShadowWarnings.length > 0) {
      console.log();
      console.log(chalk.yellow(`Info (${builtinShadowWarnings.length}):`));
      for (const redef of builtinShadowWarnings) {
        const loc = redef.line ? ` (line ${redef.line}${redef.column ? `:${redef.column}` : ''})` : '';
        console.log(chalk.yellow(`  @${redef.variable}${loc} - shadows a built-in transform in this scope`));
        if (redef.suggestion) {
          console.log(chalk.dim(`    hint: ${redef.suggestion}`));
        }
      }
    }

    if (hardErrors.length > 0) {
      console.log();
      console.log(chalk.red(`Errors (${hardErrors.length}):`));
      for (const redef of hardErrors) {
      const loc = redef.line ? ` (line ${redef.line}${redef.column ? `:${redef.column}` : ''})` : '';
      if (redef.reason === 'reserved-conflict') {
        console.log(chalk.red(`  @${redef.variable}${loc} - conflicts with reserved name`));
        if (redef.suggestion) {
          console.log(chalk.dim(`    hint: ${redef.suggestion}`));
        }
      } else {
        const origLoc = redef.originalLine ? ` (originally at line ${redef.originalLine})` : '';
        console.log(chalk.red(`  @${redef.variable}${loc} - cannot redefine variable in nested scope${origLoc}`));
        console.log(chalk.dim(`    mlld variables (var) are immutable once defined.`));
        console.log(chalk.dim(`    To accumulate values in a loop, use one of these approaches:`));
        console.log(chalk.dim(`      1. let @${redef.variable} = ... (ephemeral, block-scoped only)`));
        console.log(chalk.dim(`      2. var @${redef.variable}New = ... (new variable name)`));
        console.log(chalk.dim(`      3. @${redef.variable} += value (augmented assignment for accumulation)`));
      }
    }
    }
  }

  if (result.antiPatterns && result.antiPatterns.length > 0) {
    console.log();
    console.log(chalk.yellow(`Anti-pattern warnings (${result.antiPatterns.length}):`));
    for (const warning of result.antiPatterns) {
      const loc = warning.line ? ` (line ${warning.line}${warning.column ? `:${warning.column}` : ''})` : '';
      console.log(chalk.yellow(`  ${warning.message}${loc}`));
      if (warning.suggestion) {
        console.log(chalk.dim(`    hint: ${warning.suggestion}`));
      }
    }
  }
}

export async function analyzeCommand(filepath: string, options: AnalyzeOptions = {}): Promise<void> {
  if (!filepath) {
    console.error(chalk.red('File path is required'));
    console.log('Usage: mlld analyze <filepath> [--format json|text]');
    process.exit(1);
  }

  try {
    const result = await analyze(filepath, options);
    displayResult(result, options.format || 'text');

    if (!result.valid) {
      process.exit(1);
    }

    // Redefinitions that are not builtin-shadow warnings are errors.
    const hardRedefinitions = (result.redefinitions ?? []).filter(
      redef => redef.reason !== 'builtin-conflict'
    );
    if (hardRedefinitions.length > 0) {
      process.exit(1);
    }

    // Exit with error if warnings found and errorOnWarnings is set
    const warningCount =
      (result.warnings?.length ?? 0) +
      (result.antiPatterns?.length ?? 0) +
      (result.redefinitions?.filter(redef => redef.reason === 'builtin-conflict').length ?? 0);
    if (options.errorOnWarnings && warningCount > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

export function createValidateCommand() {
  return {
    name: 'validate',
    description: 'Validate mlld syntax and show module structure',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld validate <filepath> [options]

Validate mlld syntax and analyze module structure without executing.
Returns validation status, exports, imports, guards, executables, and runtime needs.
Also checks for undefined variable references, reserved-name conflicts, builtin shadowing info, and anti-pattern warnings (including generic exe parameter shadowing).
Intentional anti-pattern warnings can be suppressed in mlld-config.json via validate.suppressWarnings.

Options:
  --format <format>     Output format: json or text (default: text)
  --ast                 Include the parsed AST in output (requires --format json)
  --no-check-variables  Skip undefined variable checking
  --error-on-warnings   Exit with code 1 if warnings are found
  -h, --help            Show this help message

Examples:
  mlld validate module.mld                     # Validate with text output
  mlld validate module.mld --format json       # Validate with JSON output
  mlld validate module.mld --error-on-warnings # Fail on warnings
        `);
        return;
      }

      const filepath = args[0];
      const format = (flags.format || 'text') as 'json' | 'text';
      const ast = flags.ast === true;
      const checkVariables = flags['no-check-variables'] !== true && flags.noCheckVariables !== true;
      const errorOnWarnings = flags['error-on-warnings'] === true || flags.errorOnWarnings === true;

      if (!['json', 'text'].includes(format)) {
        console.error(chalk.red('Invalid format. Must be: json or text'));
        process.exit(1);
      }

      if (ast && format !== 'json') {
        console.error(chalk.red('--ast requires --format json'));
        process.exit(1);
      }

      await analyzeCommand(filepath, { format, ast, checkVariables, errorOnWarnings });
    }
  };
}

// Keep analyze as an alias
export const createAnalyzeCommand = createValidateCommand;
