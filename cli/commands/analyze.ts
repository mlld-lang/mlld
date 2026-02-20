/**
 * Static Analysis CLI Command
 * Analyzes mlld modules without executing them
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import { MlldError, ErrorSeverity } from '@core/errors';
import { initializePatterns, enhanceParseError } from '@core/errors/patterns/init';
import { DependencyDetector } from '@core/utils/dependency-detector';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { inferStartRule, isTemplateFile } from '@core/utils/mode';
import { parseSync } from '@grammar/parser';
import { builtinTransformers } from '@interpreter/builtin/transformers';
import {
  maskPlainMlldTemplateFences,
  restorePlainMlldTemplateFences
} from '@interpreter/eval/template-fence-literals';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import * as yaml from 'js-yaml';
import type { MlldNode, ImportDirectiveNode, ExportDirectiveNode, GuardDirectiveNode, ExecutableDirectiveNode, RunDirective, ExecDirective } from '@core/types';

export interface AnalyzeOptions {
  format?: 'json' | 'text';
  ast?: boolean;
  checkVariables?: boolean;
  errorOnWarnings?: boolean;
  verbose?: boolean;
  knownTemplateParams?: Map<string, Set<string>>;
  deep?: boolean;
  strictTemplateVariables?: boolean;
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
  reason?: 'builtin-conflict' | 'reserved-conflict' | 'soft-reserved-conflict' | 'scope-redefinition';
  suggestion?: string;
}

export type AntiPatternWarningCode =
  | 'deprecated-json-transform'
  | 'exe-parameter-shadowing'
  | 'template-strict-for-syntax'
  | 'hyphenated-identifier-in-template';

export interface AntiPatternWarning {
  code: AntiPatternWarningCode;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface TemplateVariableInfo {
  name: string;
  type: 'variable' | 'function';
  line?: number;
  column?: number;
}

export interface TemplateInfo {
  type: 'att' | 'mtt';
  variables: TemplateVariableInfo[];
  discoveredParams?: string[];
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
  template?: TemplateInfo;
  ast?: MlldNode[];
}

interface ImportReference {
  from: string;
  line?: number;
  column?: number;
}

interface TemplateReference {
  path: string;
  line?: number;
  column?: number;
}

interface DeepValidationTargets {
  files: string[];
  diagnostics: AnalyzeResult[];
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
    if (node.commandRef) walkNode(node.commandRef);
    if (node.arguments) walkNode(node.arguments);
    if (node.elements) walkNode(node.elements);
    // Template-relevant properties
    if (Array.isArray(node.content)) walkNode(node.content);
    if (node.variable && typeof node.variable === 'object') walkNode(node.variable);
    if (node.source && typeof node.source === 'object') walkNode(node.source);
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

/**
 * Names that cause a hard runtime error when redefined.
 * These are enforced by VariableManager.setVariable().
 */
const RESERVED_VARIABLE_NAMES = new Set([
  'now', 'base', 'root', 'debug', 'mx', 'keychain', 'input'
]);

/**
 * Names that are conventionally reserved (SDK-injected, frontmatter, etc.)
 * but are not runtime-enforced. Redefining them produces a warning, not an error.
 */
const SOFT_RESERVED_NAMES = new Set([
  'fm', 'payload', 'state', 'ctx', 'pipeline'
]);

const SHADOWABLE_BUILTIN_NAMES = new Set([
  ...BUILTIN_TRANSFORMER_NAMES,
  'keep',
  'keepStructured'
]);

const BUILTIN_VARIABLES = new Set([
  ...RESERVED_VARIABLE_NAMES,
  ...SOFT_RESERVED_NAMES,
  ...SHADOWABLE_BUILTIN_NAMES,
  // Builtin helpers
  'yaml', 'html', 'text'
]);

const DEPRECATED_JSON_BASE_NAMES = new Set(['json', 'JSON']);
const VALIDATE_CONFIG_FILENAMES = ['mlld-config.json', 'mlld.config.json'];
const MODULE_FILE_EXTENSIONS = ['.mld.md', '.mld', '.mlld.md', '.mlld'] as const;
const MODULE_ENTRY_CANDIDATES = [
  'index.mld',
  'main.mld',
  'index.mld.md',
  'main.mld.md',
  'index.mlld',
  'main.mlld',
  'index.mlld.md',
  'main.mlld.md'
] as const;
const WARNING_CODE_ALIASES: Record<string, AntiPatternWarningCode> = {
  'parameter-shadowing': 'exe-parameter-shadowing'
};
const SUPPRESSIBLE_WARNING_CODES = new Set<AntiPatternWarningCode>([
  'deprecated-json-transform',
  'exe-parameter-shadowing',
  'hyphenated-identifier-in-template'
]);
const GENERIC_EXE_PARAMETER_SUGGESTIONS = new Map<string, string>([
  ['result', 'status'],
  ['output', 'finalOutput'],
  ['response', 'modelResponse'],
  ['data', 'inputData'],
  ['value', 'inputValue']
]);


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

  walkAST(ast, (node: any) => {
    if (node.type === 'VariableReference') {
      const name = node.identifier;
      if (!name) return;

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
        } else if (SOFT_RESERVED_NAMES.has(name)) {
          warnings.push({
            variable: name,
            line,
            column,
            reason: 'soft-reserved-conflict',
            suggestion: `@${name} is conventionally reserved (SDK/system use). Redefining it may cause unexpected behavior.`,
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
        } else if (SOFT_RESERVED_NAMES.has(name)) {
          warnings.push({
            variable: name,
            line,
            column,
            reason: 'soft-reserved-conflict',
            suggestion: `@${name} is conventionally reserved (SDK/system use). Redefining it may cause unexpected behavior.`,
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
      message: `@${identifier} is deprecated.`,
      line,
      column,
      suggestion: `If parsing JSON text → use @${replacement} (e.g. @input | @${replacement}). If serializing an object to JSON → the pipe can usually be removed: structured values auto-serialize in templates and show.`
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

function extractImportReferences(ast: MlldNode[]): ImportReference[] {
  const imports: ImportReference[] = [];

  walkAST(ast, (node) => {
    if (node.type !== 'Directive' || node.kind !== 'import') {
      return;
    }

    const importNode = node as any;
    const from = importNode.raw?.path;
    if (!from || typeof from !== 'string') {
      return;
    }

    imports.push({
      from,
      line: importNode.location?.start?.line,
      column: importNode.location?.start?.column
    });
  });

  return imports;
}

function extractTemplateReferences(ast: MlldNode[]): TemplateReference[] {
  const templates: TemplateReference[] = [];

  walkAST(ast, (node) => {
    if (node.type !== 'Directive' || node.kind !== 'exe') {
      return;
    }

    const exeNode = node as any;
    const pathNodes = exeNode.values?.path;
    if (!Array.isArray(pathNodes) || pathNodes.length === 0) {
      return;
    }

    // Skip dynamic template paths (interpolated path fragments).
    if (!pathNodes.every((part: any) => part?.type === 'Text' && typeof part.content === 'string')) {
      return;
    }

    const templatePath = pathNodes.map((part: any) => part.content).join('');
    if (!templatePath) {
      return;
    }

    templates.push({
      path: templatePath,
      line: exeNode.location?.start?.line,
      column: exeNode.location?.start?.column
    });
  });

  return templates;
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
  const addNeed = (need: string): void => {
    const normalized = need.toLowerCase();
    if (normalized === 'sh' || normalized === 'cmd' || normalized === 'bash' || normalized === 'shell') {
      needs.cmd = needs.cmd || [];
    }
    if (normalized === 'node' || normalized === 'js' || normalized === 'javascript') {
      needs.node = needs.node || [];
    }
    if (normalized === 'py' || normalized === 'python') {
      needs.py = needs.py || [];
    }
  };

  // Check frontmatter first
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    try {
      const metadata = yaml.load(frontmatterMatch[1]) as any;
      if (metadata?.needs) {
        const needsArray = Array.isArray(metadata.needs) ? metadata.needs : [metadata.needs];
        for (const need of needsArray) {
          if (typeof need === 'string') {
            addNeed(need);
          }
        }
      }
    } catch {
      // Ignore YAML parse errors
    }
  }

  // Collect explicit /needs directive declarations.
  walkAST(ast, (node: any) => {
    if (node.type !== 'Directive' || node.kind !== 'needs') {
      return;
    }

    const declaredNeeds = node.values?.needs;
    if (!declaredNeeds || typeof declaredNeeds !== 'object') {
      return;
    }

    const needsRecord = declaredNeeds as Record<string, unknown>;

    if (needsRecord.cmd !== undefined
      || needsRecord.sh === true
      || needsRecord.bash === true
      || (Array.isArray(needsRecord.__commands) && needsRecord.__commands.length > 0)) {
      needs.cmd = needs.cmd || [];
    }
    if (needsRecord.node !== undefined || needsRecord.js !== undefined) {
      needs.node = needs.node || [];
    }
    if (needsRecord.py !== undefined || needsRecord.python !== undefined) {
      needs.py = needs.py || [];
    }
  });

  // Also detect from AST
  const detector = new DependencyDetector();
  const runtimeNeeds = detector.detectRuntimeNeeds(ast);

  for (const need of runtimeNeeds) {
    addNeed(need);
  }

  // Return undefined if no needs detected
  if (Object.keys(needs).length === 0) {
    return undefined;
  }

  return needs;
}

/**
 * Collect for-loop iterator variable names from a template AST.
 * These are locally-scoped bindings, not template parameters.
 * In .att templates, for-loops produce TemplateForBlock nodes (not Directive nodes).
 */
function collectTemplateForIterators(ast: MlldNode[]): Set<string> {
  const iterators = new Set<string>();

  walkAST(ast, (node: any) => {
    // Template for-loops: TemplateForBlock with variable.identifier
    if (node.type === 'TemplateForBlock') {
      const varNode = node.variable;
      if (varNode?.type === 'VariableReference' && varNode.identifier) {
        iterators.add(varNode.identifier);
      }
    }

    // Module for-loops (if templates ever contain them): Directive kind=for
    if (node.type === 'Directive' && node.kind === 'for') {
      const varNodes = node.values?.variable;
      if (Array.isArray(varNodes)) {
        for (const v of varNodes) {
          if (v.type === 'VariableReference' && v.identifier) {
            iterators.add(v.identifier);
          }
        }
      }
    }
  });

  return iterators;
}

/**
 * Detect @for in .att templates — common mistake where users use strict-mode
 * for-loop syntax instead of /for ... /end. The .att parser produces
 * VariableReference nodes for @for (since it's just @word syntax).
 */
function detectTemplateStrictForSyntax(ast: MlldNode[]): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  walkAST(ast, (node: any) => {
    if (node.type === 'VariableReference' && node.identifier === 'for') {
      warnings.push({
        code: 'template-strict-for-syntax',
        message: `"@for" is not valid in templates. Use "/for ... /end" instead.`,
        line: node.location?.start?.line,
        column: node.location?.start?.column,
        suggestion: 'In .att templates, use /for @var in @collection ... /end (slash prefix, no brackets).',
      });
    }
  });

  return warnings;
}

/**
 * Detect hyphenated identifiers in template contexts.
 * Since hyphens are now valid in identifiers, @item-file resolves as a single
 * variable "item-file" instead of @item followed by literal "-file".
 * Warn users who may have code relying on the old behavior.
 */
function detectHyphenatedIdentifiersInTemplates(ast: MlldNode[]): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const definedVars = new Set<string>();

  // First pass: collect all defined variable names
  walkAST(ast, (node: any) => {
    if (node.type === 'Directive' && node.kind === 'var') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        definedVars.add(identNode.identifier);
      }
    }
    if (node.type === 'Directive' && node.kind === 'exe') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        definedVars.add(identNode.identifier);
      }
    }
  });

  // Second pass: find hyphenated identifiers that might be accidental
  walkAST(ast, (node: any) => {
    if (node.type === 'VariableReference' && node.identifier && node.identifier.includes('-')) {
      const id = node.identifier;
      // Check if the non-hyphenated prefix is a defined variable
      const prefix = id.split('-')[0];
      if (definedVars.has(prefix) && !definedVars.has(id)) {
        warnings.push({
          code: 'hyphenated-identifier-in-template',
          message: `@${id} is now parsed as a single identifier. Previously, @${prefix} was the variable and "-${id.slice(prefix.length + 1)}" was literal text.`,
          line: node.location?.start?.line,
          column: node.location?.start?.column,
          suggestion: `If you want @${prefix} followed by literal text, use @${prefix}\\-${id.slice(prefix.length + 1)} (backslash boundary).`,
        });
      }
    }
  });

  return warnings;
}

/**
 * Collect all variable and function references from a template AST
 */
function collectTemplateVariables(ast: MlldNode[]): TemplateVariableInfo[] {
  const variables: TemplateVariableInfo[] = [];
  const seen = new Set<string>();

  walkAST(ast, (node: any) => {
    if (node.type === 'VariableReference') {
      const name = node.identifier;
      if (!name || seen.has(`var:${name}`)) return;
      seen.add(`var:${name}`);
      variables.push({
        name,
        type: 'variable',
        line: node.location?.start?.line,
        column: node.location?.start?.column,
      });
    }

    if (node.type === 'ExecInvocation') {
      const name = node.commandRef?.name;
      if (!name || seen.has(`fn:${name}`)) return;
      seen.add(`fn:${name}`);
      variables.push({
        name,
        type: 'function',
        line: node.location?.start?.line,
        column: node.location?.start?.column,
      });
    }
  });

  return variables;
}

/**
 * Detect undefined template variable references.
 * If knownParams is provided, flags references not in params and not builtin.
 * If knownParams is empty/not provided, flags all references as informational.
 * forIterators are excluded — these are locally-scoped loop bindings.
 */
function detectUndefinedTemplateVariables(
  templateVars: TemplateVariableInfo[],
  knownParams?: Set<string>,
  forIterators?: Set<string>
): UndefinedVariableWarning[] {
  const warnings: UndefinedVariableWarning[] = [];

  for (const tv of templateVars) {
    if (BUILTIN_VARIABLES.has(tv.name)) continue;
    if (forIterators && forIterators.has(tv.name)) continue;

    if (knownParams && knownParams.size > 0) {
      if (knownParams.has(tv.name)) continue;
      warnings.push({
        variable: tv.name,
        line: tv.line,
        column: tv.column,
        suggestion: tv.type === 'function'
          ? `@${tv.name}() is not a known parameter. Known: ${[...knownParams].join(', ')}`
          : `@${tv.name} is not a known parameter. Known: ${[...knownParams].join(', ')}`,
      });
    } else {
      warnings.push({
        variable: tv.name,
        line: tv.line,
        column: tv.column,
        suggestion: tv.type === 'function'
          ? `@${tv.name}() reference — no exe declaration found in sibling modules`
          : `@${tv.name} reference — no exe declaration found in sibling modules`,
      });
    }
  }

  return warnings;
}

/**
 * Exe template declarations collected from all modules during directory validation.
 * Each entry maps a normalized path suffix to parameter names.
 */
interface TemplateParamEntry {
  absPath: string;
  suffix: string;
  params: Set<string>;
}

/**
 * Build a map of template paths to their parameter names from all .mld modules in the file list.
 * Used during directory validation to resolve template params across the full tree.
 *
 * Stores both absolute resolved paths and normalized suffixes for matching, since
 * exe declarations may reference templates relative to a different base than the module dir.
 */
async function buildTemplateParamMap(files: string[]): Promise<Map<string, Set<string>>> {
  const entries: TemplateParamEntry[] = [];
  const projectRoot = await resolveProjectRootForDeepValidation(files);

  for (const file of files) {
    const lower = file.toLowerCase();
    if (!lower.endsWith('.mld') && !lower.endsWith('.mld.md')) continue;

    try {
      const content = await fs.readFile(file, 'utf8');
      const mode = lower.endsWith('.mld.md') ? 'markdown' : 'strict';
      const ast = parseSync(content, { mode });
      const moduleDir = path.dirname(path.resolve(file));

      walkAST(ast, (node: any) => {
        if (node.type !== 'Directive' || node.kind !== 'exe') return;

        const pathNodes = node.values?.path;
        if (!Array.isArray(pathNodes)) return;

        const pathText = pathNodes
          .filter((n: any) => n.type === 'Text')
          .map((n: any) => n.content)
          .join('');

        if (!pathText) return;

        const exeParams = node.values?.params;
        if (!Array.isArray(exeParams)) return;

        const params = new Set<string>();
        for (const param of exeParams) {
          if (param?.name) params.add(param.name);
        }

        // Store with both absolute resolution and normalized suffix.
        const absPath = resolveStaticReferenceBasePath(pathText, file, projectRoot)
          ?? path.resolve(moduleDir, pathText);
        const suffix = pathText.replace(/^\.\//, '');

        entries.push({ absPath, suffix, params });
      });
    } catch {
      // Skip files that fail to parse
    }
  }

  // Build the map: for each actual template file, find matching entries
  const paramMap = new Map<string, Set<string>>();
  const templateFiles = files.filter(f => {
    const l = f.toLowerCase();
    return l.endsWith('.att') || l.endsWith('.mtt');
  });

  for (const tplFile of templateFiles) {
    const absTpl = path.resolve(tplFile);
    const merged = new Set<string>();

    for (const entry of entries) {
      // Match by exact absolute path or by path suffix
      if (entry.absPath === absTpl || absTpl.endsWith('/' + entry.suffix)) {
        for (const p of entry.params) merged.add(p);
      }
    }

    if (merged.size > 0) {
      paramMap.set(absTpl, merged);
    }
  }

  return paramMap;
}

/**
 * Scan sibling .mld/.mld.md files for exe declarations that use this template file.
 * Returns the union of all parameter names found across callers.
 * When knownTemplateParams is provided (directory validation), uses it as fallback.
 */
async function discoverTemplateParams(templatePath: string, knownTemplateParams?: Map<string, Set<string>>): Promise<Set<string>> {
  const absTemplatePath = path.resolve(templatePath);
  const templateFilename = path.basename(absTemplatePath);
  const params = new Set<string>();

  const dirsToScan = new Set<string>();
  dirsToScan.add(path.dirname(absTemplatePath));
  const parentDir = path.dirname(path.dirname(absTemplatePath));
  if (parentDir !== path.dirname(absTemplatePath)) {
    dirsToScan.add(parentDir);
  }

  for (const dir of dirsToScan) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (!lower.endsWith('.mld') && !lower.endsWith('.mld.md')) continue;

      const modulePath = path.join(dir, entry);
      try {
        const content = await fs.readFile(modulePath, 'utf8');
        const mode = lower.endsWith('.mld.md') ? 'markdown' : 'strict';
        const ast = parseSync(content, { mode });

        walkAST(ast, (node: any) => {
          if (node.type !== 'Directive' || node.kind !== 'exe') return;

          // Check if this exe references our template file
          const pathNodes = node.values?.path;
          if (!Array.isArray(pathNodes)) return;

          const pathText = pathNodes
            .filter((n: any) => n.type === 'Text')
            .map((n: any) => n.content)
            .join('');

          // Match if the path ends with our template filename
          if (!pathText.endsWith(templateFilename)) return;

          // Extract parameter names
          const exeParams = node.values?.params;
          if (Array.isArray(exeParams)) {
            for (const param of exeParams) {
              if (param?.name) params.add(param.name);
            }
          }
        });
      } catch {
        // Skip files that fail to parse
      }
    }
  }

  // Fallback to cross-directory map when local scanning finds nothing
  if (params.size === 0 && knownTemplateParams) {
    const known = knownTemplateParams.get(absTemplatePath);
    if (known) {
      for (const p of known) params.add(p);
    }
  }

  return params;
}

function isModuleFilePath(filepath: string): boolean {
  const normalized = filepath.toLowerCase();
  return MODULE_FILE_EXTENSIONS.some(ext => normalized.endsWith(ext));
}

function isUrlLikePath(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

async function isFilePath(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile();
  } catch {
    return false;
  }
}

function resolveStaticReferenceBasePath(
  reference: string,
  importerFilepath: string,
  projectRoot: string
): string | null {
  const trimmed = reference.trim();
  if (!trimmed || isUrlLikePath(trimmed)) {
    return null;
  }

  if (/^@(base|root)(?:\/|$)/.test(trimmed)) {
    const withoutPrefix = trimmed.replace(/^@(base|root)(?:\/)?/, '');
    if (!withoutPrefix) {
      return projectRoot;
    }
    const relative = withoutPrefix.startsWith('/') ? withoutPrefix.slice(1) : withoutPrefix;
    return path.resolve(projectRoot, relative);
  }

  if (trimmed.startsWith('@')) {
    return null;
  }

  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }

  return path.resolve(path.dirname(importerFilepath), trimmed);
}

function buildModuleCandidatesForDeepValidation(basePath: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (candidate: string): void => {
    const normalized = path.resolve(candidate);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  addCandidate(basePath);

  const lower = basePath.toLowerCase();
  const hasModuleExtension = MODULE_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
  if (!hasModuleExtension) {
    for (const ext of MODULE_FILE_EXTENSIONS) {
      addCandidate(basePath + ext);
    }
    for (const entry of MODULE_ENTRY_CANDIDATES) {
      addCandidate(path.join(basePath, entry));
    }
  }

  return candidates;
}

async function resolveModuleImportForDeepValidation(
  importRef: string,
  importerFilepath: string,
  projectRoot: string
): Promise<string | null> {
  const basePath = resolveStaticReferenceBasePath(importRef, importerFilepath, projectRoot);
  if (!basePath) {
    return null;
  }

  const candidates = buildModuleCandidatesForDeepValidation(basePath);
  for (const candidate of candidates) {
    if (await isFilePath(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolveTemplatePathForDeepValidation(
  templateRef: string,
  importerFilepath: string,
  projectRoot: string
): Promise<string | null> {
  const basePath = resolveStaticReferenceBasePath(templateRef, importerFilepath, projectRoot);
  if (!basePath) {
    return null;
  }

  const ext = path.extname(basePath).toLowerCase();
  if (ext !== '.att' && ext !== '.mtt') {
    return null;
  }

  if (await isFilePath(basePath)) {
    return path.resolve(basePath);
  }

  return null;
}

async function parseModuleAstForDeepTraversal(filepath: string): Promise<MlldNode[] | null> {
  try {
    const content = await fs.readFile(filepath, 'utf8');
    const mode = filepath.toLowerCase().endsWith('.mld.md') ? 'markdown' : 'strict';
    return parseSync(content, { mode });
  } catch {
    return null;
  }
}

function addTraversalDiagnostic(
  diagnostics: Map<string, AnalysisError[]>,
  filepath: string,
  error: AnalysisError
): void {
  const current = diagnostics.get(filepath) ?? [];
  current.push(error);
  diagnostics.set(filepath, current);
}

function diagnosticsToAnalyzeResults(diagnostics: Map<string, AnalysisError[]>): AnalyzeResult[] {
  return Array.from(diagnostics.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filepath, errors]) => ({
      filepath,
      valid: false,
      errors
    }));
}

async function resolveProjectRootForDeepValidation(entryFiles: string[]): Promise<string> {
  const firstPath = entryFiles.find(Boolean);
  if (!firstPath) {
    return process.cwd();
  }

  const nodeFs = new NodeFileSystem();
  const startDir = path.dirname(path.resolve(firstPath));
  return findProjectRoot(startDir, nodeFs);
}

async function collectDeepValidationTargets(entryFiles: string[]): Promise<DeepValidationTargets> {
  const diagnostics = new Map<string, AnalysisError[]>();
  const modules = new Set<string>();
  const templates = new Set<string>();
  const queue: string[] = [];

  const normalizedEntries = entryFiles.map(file => path.resolve(file));
  const projectRoot = await resolveProjectRootForDeepValidation(normalizedEntries);

  for (const entry of normalizedEntries) {
    const lower = entry.toLowerCase();
    if (lower.endsWith('.att') || lower.endsWith('.mtt')) {
      templates.add(entry);
      continue;
    }

    if (isModuleFilePath(entry)) {
      modules.add(entry);
      queue.push(entry);
    } else {
      // Keep unknown files in the module set so analyze() can return a concrete error.
      modules.add(entry);
      queue.push(entry);
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const currentModule = queue.shift() as string;
    const normalizedModule = path.resolve(currentModule);
    if (visited.has(normalizedModule)) {
      continue;
    }
    visited.add(normalizedModule);

    const ast = await parseModuleAstForDeepTraversal(normalizedModule);
    if (!ast) {
      continue;
    }

    const imports = extractImportReferences(ast);
    for (const imported of imports) {
      const resolvedImport = await resolveModuleImportForDeepValidation(
        imported.from,
        normalizedModule,
        projectRoot
      );

      if (resolvedImport) {
        if (!modules.has(resolvedImport)) {
          modules.add(resolvedImport);
          queue.push(resolvedImport);
        }
        continue;
      }

      const isLocalLike =
        imported.from.startsWith('@base') ||
        imported.from.startsWith('@root') ||
        (!imported.from.startsWith('@') && !isUrlLikePath(imported.from));
      if (isLocalLike) {
        addTraversalDiagnostic(diagnostics, normalizedModule, {
          message: `Unable to resolve import "${imported.from}" during deep validation`,
          line: imported.line,
          column: imported.column
        });
      }
    }

    const templateRefs = extractTemplateReferences(ast);
    for (const templateRef of templateRefs) {
      const resolvedTemplate = await resolveTemplatePathForDeepValidation(
        templateRef.path,
        normalizedModule,
        projectRoot
      );

      if (resolvedTemplate) {
        templates.add(resolvedTemplate);
        continue;
      }

      addTraversalDiagnostic(diagnostics, normalizedModule, {
        message: `Unable to resolve template "${templateRef.path}" during deep validation`,
        line: templateRef.line,
        column: templateRef.column
      });
    }
  }

  const files = [...modules, ...templates].sort();
  return {
    files,
    diagnostics: diagnosticsToAnalyzeResults(diagnostics)
  };
}

function buildTemplateUndefinedVariableErrors(result: AnalyzeResult): AnalysisError[] {
  if (!result.template || !result.warnings || result.warnings.length === 0) {
    return [];
  }

  const discoveredParams = result.template.discoveredParams ?? [];
  const definedParamsText = discoveredParams.length > 0 ? discoveredParams.join(', ') : '(none)';

  return result.warnings.map(warning => ({
    message: [
      `undefined variable @${warning.variable} in template`,
      `defined parameters: ${definedParamsText}`,
      `hint: use @@${warning.variable} or \\@${warning.variable} for literal @ text (use @@var or \\@var for literal @ text)`
    ].join('\n'),
    line: warning.line,
    column: warning.column
  }));
}

function promoteTemplateWarningsToErrors(result: AnalyzeResult): AnalyzeResult {
  const templateErrors = buildTemplateUndefinedVariableErrors(result);
  if (templateErrors.length === 0) {
    return result;
  }

  return {
    ...result,
    valid: false,
    warnings: undefined,
    errors: [...(result.errors ?? []), ...templateErrors]
  };
}

export async function analyzeDeep(filepaths: string[], options: AnalyzeOptions = {}): Promise<AnalyzeResult[]> {
  const { files, diagnostics } = await collectDeepValidationTargets(filepaths);
  const dedupedFiles = [...new Set(files)];
  const knownTemplateParams = await buildTemplateParamMap(dedupedFiles);
  const analyzeOptions: AnalyzeOptions = {
    ...options,
    knownTemplateParams
  };

  const diagnosticsByFile = new Map<string, AnalysisError[]>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.filepath || !diagnostic.errors || diagnostic.errors.length === 0) {
      continue;
    }
    diagnosticsByFile.set(path.resolve(diagnostic.filepath), diagnostic.errors);
  }

  const analyzedResults: AnalyzeResult[] = [];
  for (const file of dedupedFiles) {
    const baseResult = await analyze(file, analyzeOptions);
    const strictResult = options.strictTemplateVariables ? promoteTemplateWarningsToErrors(baseResult) : baseResult;
    const fileDiagnostics = diagnosticsByFile.get(path.resolve(strictResult.filepath));

    if (fileDiagnostics && fileDiagnostics.length > 0) {
      analyzedResults.push({
        ...strictResult,
        valid: false,
        errors: [...(strictResult.errors ?? []), ...fileDiagnostics]
      });
      diagnosticsByFile.delete(path.resolve(strictResult.filepath));
    } else {
      analyzedResults.push(strictResult);
    }
  }

  for (const [filepath, errors] of diagnosticsByFile.entries()) {
    analyzedResults.push({
      filepath,
      valid: false,
      errors
    });
  }

  return analyzedResults.sort((a, b) => a.filepath.localeCompare(b.filepath));
}

function detectCheckpointDirectiveErrors(ast: MlldNode[]): AnalysisError[] {
  const errors: AnalysisError[] = [];
  const firstSeen = new Map<string, { line?: number; column?: number }>();

  const readLocation = (value: Record<string, unknown>): { line?: number; column?: number } => {
    const location =
      value.location && typeof value.location === 'object'
        ? (value.location as Record<string, unknown>)
        : undefined;
    const start =
      location?.start && typeof location.start === 'object'
        ? (location.start as Record<string, unknown>)
        : undefined;
    return {
      line: typeof start?.line === 'number' ? start.line : undefined,
      column: typeof start?.column === 'number' ? start.column : undefined
    };
  };

  const readLiteralCheckpointName = (rawName: unknown): string | null => {
    if (typeof rawName === 'string') {
      return rawName.trim();
    }
    if (rawName && typeof rawName === 'object') {
      const literal = rawName as Record<string, unknown>;
      if (literal.type === 'Literal' && typeof literal.value === 'string') {
        return literal.value.trim();
      }
    }
    return null;
  };

  const readCheckpointContext = (value: Record<string, unknown>): string | undefined => {
    const meta =
      value.meta && typeof value.meta === 'object'
        ? (value.meta as Record<string, unknown>)
        : undefined;
    return typeof meta?.checkpointContext === 'string' ? meta.checkpointContext : undefined;
  };

  const visit = (node: unknown, insideExeBody: boolean): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child, insideExeBody);
      }
      return;
    }

    const value = node as Record<string, unknown>;
    const isDirective = value.type === 'Directive';
    const isCheckpoint = isDirective && value.kind === 'checkpoint';
    const isExeDirective = isDirective && value.kind === 'exe';

    if (isCheckpoint) {
      const { line, column } = readLocation(value);
      const values =
        value.values && typeof value.values === 'object'
          ? (value.values as Record<string, unknown>)
          : undefined;

      const literalCheckpointName = readLiteralCheckpointName(values?.name);
      const checkpointContext = readCheckpointContext(value);
      const validCheckpointContext =
        checkpointContext === undefined || checkpointContext === 'top-level-when-direct';
      const isPlacementValid = !insideExeBody && validCheckpointContext;

      if (!isPlacementValid) {
        const displayName =
          typeof literalCheckpointName === 'string' && literalCheckpointName.length > 0
            ? `"${literalCheckpointName}"`
            : '<dynamic>';
        errors.push({
          message: `checkpoint ${displayName} is only allowed at top level or as a direct => result of a top-level when`,
          line,
          column
        });
      }

      if (literalCheckpointName !== null) {
        if (!literalCheckpointName) {
          errors.push({
            message: 'checkpoint directive requires a non-empty name',
            line,
            column
          });
        } else {
          const existing = firstSeen.get(literalCheckpointName);
          if (existing) {
            const suffix =
              existing.line !== undefined
                ? ` (first declared at line ${existing.line}${existing.column !== undefined ? `:${existing.column}` : ''})`
                : '';
            errors.push({
              message: `duplicate checkpoint "${literalCheckpointName}"${suffix}`,
              line,
              column
            });
          } else {
            firstSeen.set(literalCheckpointName, { line, column });
          }
        }
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const childInsideExeBody = isExeDirective && key === 'values' ? true : insideExeBody;
      visit(child, childInsideExeBody);
    }
  };

  visit(ast, false);
  return errors;
}

/**
 * Analyze an mlld module without executing it
 */
export async function analyze(filepath: string, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const result: AnalyzeResult = {
    filepath: path.resolve(filepath),
    valid: true
  };

  const isTemplate = isTemplateFile(filepath);

  try {
    const content = await fs.readFile(filepath, 'utf8');

    let ast: MlldNode[];
    try {
      const startRule = inferStartRule(filepath);

      if (isTemplate && filepath.toLowerCase().endsWith('.att')) {
        // Mask ```mlld``` fences before parsing .att files (matches runtime behavior)
        const { maskedContent, literalBlocks } = maskPlainMlldTemplateFences(content);
        ast = restorePlainMlldTemplateFences(parseSync(maskedContent, { startRule }), literalBlocks);
      } else if (isTemplate) {
        ast = parseSync(content, { startRule });
      } else {
        // Use strict mode for .mld files, markdown mode for .mld.md files
        const mode = filepath.endsWith('.mld.md') ? 'markdown' : 'strict';
        ast = parseSync(content, { mode });
      }
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

    if (isTemplate) {
      // Template-specific analysis
      const templateType = filepath.toLowerCase().endsWith('.mtt') ? 'mtt' : 'att';
      const templateVars = collectTemplateVariables(ast);
      const forIterators = collectTemplateForIterators(ast);

      const templateInfo: TemplateInfo = {
        type: templateType,
        variables: templateVars,
      };

      if (options.checkVariables !== false && templateVars.length > 0) {
        const discoveredParams = await discoverTemplateParams(filepath, options.knownTemplateParams);
        if (discoveredParams.size > 0) {
          templateInfo.discoveredParams = [...discoveredParams];
        }
        const warnings = detectUndefinedTemplateVariables(templateVars, discoveredParams, forIterators);
        if (warnings.length > 0) {
          result.warnings = warnings;
        }
      }

      // Detect @for in .att text nodes (should be /for ... /end)
      if (templateType === 'att') {
        const strictForWarnings = detectTemplateStrictForSyntax(ast);
        if (strictForWarnings.length > 0) {
          result.antiPatterns = [...(result.antiPatterns ?? []), ...strictForWarnings];
        }
      }

      result.template = templateInfo;
    } else {
      // Module-specific extraction
      const executables = extractExecutables(ast);
      const exports = extractExports(ast);
      const imports = extractImports(ast);
      const guards = extractGuards(ast);
      const needs = extractNeeds(content, ast);
      const checkpointErrors = detectCheckpointDirectiveErrors(ast);

      if (executables.length > 0) result.executables = executables;
      if (exports.length > 0) result.exports = exports;
      if (imports.length > 0) result.imports = imports;
      if (guards.length > 0) result.guards = guards;
      if (needs) result.needs = needs;
      if (checkpointErrors.length > 0) {
        result.valid = false;
        result.errors = checkpointErrors;
        return result;
      }

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
          ...detectDeprecatedJsonTransformAntiPatterns(ast),
          ...detectExeParameterShadowingWarnings(ast),
          ...detectHyphenatedIdentifiersInTemplates(ast),
        ].filter(warning => !suppressedWarningCodes.has(warning.code));
        if (antiPatterns.length > 0) {
          result.antiPatterns = antiPatterns;
        }
      }
    }

    if (options.ast) result.ast = ast;

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

  const fileType = result.template ? `template (.${result.template.type})` : 'module';

  if (!result.valid) {
    console.log(chalk.red(`Invalid ${fileType}`));
    if (result.errors) {
      for (const err of result.errors) {
        const loc = err.line ? ` (line ${err.line}${err.column ? `:${err.column}` : ''})` : '';
        console.log(chalk.red(`  ${err.message}${loc}`));
      }
    }
    return;
  }

  console.log(chalk.green(`Valid ${fileType}`));
  console.log();

  const label = (s: string) => chalk.dim(s.padEnd(12));

  if (result.template) {
    const vars = result.template.variables.filter(v => v.type === 'variable');
    const fns = result.template.variables.filter(v => v.type === 'function');
    if (vars.length > 0) {
      console.log(`${label('variables')} ${vars.map(v => `@${v.name}`).join(', ')}`);
    }
    if (fns.length > 0) {
      console.log(`${label('functions')} ${fns.map(v => `@${v.name}()`).join(', ')}`);
    }
    if (result.template.discoveredParams && result.template.discoveredParams.length > 0) {
      console.log(`${label('params')} ${result.template.discoveredParams.join(', ')} ${chalk.dim('(from exe declarations)')}`);
    }
  }

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
    const builtinShadowWarnings = result.redefinitions.filter(
      redef => redef.reason === 'builtin-conflict' || redef.reason === 'soft-reserved-conflict'
    );
    const hardErrors = result.redefinitions.filter(
      redef => redef.reason !== 'builtin-conflict' && redef.reason !== 'soft-reserved-conflict'
    );

    if (builtinShadowWarnings.length > 0) {
      console.log();
      console.log(chalk.yellow(`Info (${builtinShadowWarnings.length}):`));
      for (const redef of builtinShadowWarnings) {
        const loc = redef.line ? ` (line ${redef.line}${redef.column ? `:${redef.column}` : ''})` : '';
        const desc = redef.reason === 'soft-reserved-conflict'
          ? 'shadows a conventionally reserved name'
          : 'shadows a built-in transform in this scope';
        console.log(chalk.yellow(`  @${redef.variable}${loc} - ${desc}`));
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

const MLLD_FILE_EXTENSIONS = '**/*.{mld,mld.md,att,mtt}';

async function resolveFilePaths(inputs: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const input of inputs) {
    const resolved = path.resolve(input);
    let stat: import('fs').Stats;
    try {
      stat = await fs.stat(resolved);
    } catch {
      files.push(resolved);
      continue;
    }

    if (stat.isDirectory()) {
      const matched = await glob(MLLD_FILE_EXTENSIONS, {
        cwd: resolved,
        absolute: true,
        nodir: true,
      });
      files.push(...matched.sort());
    } else {
      files.push(resolved);
    }
  }

  return files;
}

function hasErrors(result: AnalyzeResult): boolean {
  if (!result.valid) return true;
  const hardRedefinitions = (result.redefinitions ?? []).filter(
    redef => redef.reason !== 'builtin-conflict' && redef.reason !== 'soft-reserved-conflict'
  );
  return hardRedefinitions.length > 0;
}

function hasWarnings(result: AnalyzeResult): boolean {
  return (
    (result.warnings?.length ?? 0) +
    (result.antiPatterns?.length ?? 0) +
    (result.redefinitions?.filter(redef => redef.reason === 'builtin-conflict' || redef.reason === 'soft-reserved-conflict').length ?? 0)
  ) > 0;
}

export async function analyzeCommand(filepath: string, options: AnalyzeOptions = {}): Promise<void> {
  if (!filepath) {
    console.error(chalk.red('File path is required'));
    console.log('Usage: mlld analyze <filepath> [--format json|text]');
    process.exit(1);
  }

  try {
    if (options.deep) {
      const results = await analyzeDeep([filepath], options);

      if (results.length === 1) {
        displayResult(results[0], options.format || 'text');
      } else if ((options.format || 'text') === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else if (options.verbose) {
        for (const deepResult of results) {
          displayResult(deepResult, 'text');
        }

        console.log();
        const passed = results.filter(r => !hasErrors(r)).length;
        const failed = results.length - passed;
        const summary = `${results.length} files: ${passed} passed${failed > 0 ? `, ${failed} failed` : ''}`;
        console.log(failed > 0 ? chalk.red(summary) : chalk.green(summary));
      } else {
        const basePath = path.dirname(path.resolve(filepath));
        console.log();
        for (const deepResult of results) {
          displayResultCompact(deepResult, basePath);
        }

        console.log();
        const passed = results.filter(r => !hasErrors(r)).length;
        const failed = results.length - passed;
        const withWarnings = results.filter(r => !hasErrors(r) && hasWarnings(r)).length;
        let summary = `${results.length} files: ${passed} passed`;
        if (failed > 0) summary += `, ${failed} failed`;
        if (withWarnings > 0) summary += `, ${withWarnings} with warnings`;
        console.log(failed > 0 ? chalk.red(summary) : withWarnings > 0 ? chalk.yellow(summary) : chalk.green(summary));
      }

      if (results.some(result => hasErrors(result))) {
        process.exit(1);
      }
      if (options.errorOnWarnings && results.some(result => hasWarnings(result))) {
        process.exit(1);
      }
      return;
    }

    const result = await analyze(filepath, options);
    displayResult(result, options.format || 'text');

    if (hasErrors(result)) {
      process.exit(1);
    }

    if (options.errorOnWarnings && hasWarnings(result)) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

function displayResultCompact(result: AnalyzeResult, basePath: string): void {
  const relPath = path.relative(basePath, result.filepath);

  if (!result.valid) {
    console.log(chalk.red(`  ✗ ${relPath}`));
    if (result.errors) {
      for (const err of result.errors) {
        const loc = err.line ? ` (line ${err.line}${err.column ? `:${err.column}` : ''})` : '';
        console.log(chalk.red(`      ${err.message}${loc}`));
      }
    }
    return;
  }

  if (!hasWarnings(result)) {
    console.log(chalk.green(`  ✓ ${relPath}`));
    return;
  }

  // Has warnings — show the file then its issues
  console.log(chalk.yellow(`  ⚠ ${relPath}`));

  if (result.warnings && result.warnings.length > 0) {
    for (const warn of result.warnings) {
      const loc = warn.line ? ` (line ${warn.line}${warn.column ? `:${warn.column}` : ''})` : '';
      console.log(chalk.yellow(`      @${warn.variable}${loc} - undefined variable`));
      if (warn.suggestion) {
        console.log(chalk.dim(`        hint: ${warn.suggestion}`));
      }
    }
  }

  if (result.redefinitions) {
    const softWarnings = result.redefinitions.filter(
      r => r.reason === 'builtin-conflict' || r.reason === 'soft-reserved-conflict'
    );
    for (const redef of softWarnings) {
      const loc = redef.line ? ` (line ${redef.line}${redef.column ? `:${redef.column}` : ''})` : '';
      const desc = redef.reason === 'soft-reserved-conflict'
        ? 'shadows reserved name'
        : 'shadows built-in';
      console.log(chalk.yellow(`      @${redef.variable}${loc} - ${desc}`));
    }
  }

  if (result.antiPatterns && result.antiPatterns.length > 0) {
    for (const warning of result.antiPatterns) {
      const loc = warning.line ? ` (line ${warning.line}${warning.column ? `:${warning.column}` : ''})` : '';
      console.log(chalk.yellow(`      ${warning.message}${loc}`));
      if (warning.suggestion) {
        console.log(chalk.dim(`        hint: ${warning.suggestion}`));
      }
    }
  }
}

export async function analyzeMultiple(filepaths: string[], options: AnalyzeOptions = {}): Promise<void> {
  const files = await resolveFilePaths(filepaths);

  if (files.length === 0) {
    console.error(chalk.red('No mlld files found'));
    process.exit(1);
  }

  if (files.length === 1 && !options.deep) {
    await analyzeCommand(files[0], options);
    return;
  }

  const format = options.format || 'text';
  const allResults: AnalyzeResult[] = [];

  if (options.deep) {
    const deepResults = await analyzeDeep(files, options);
    allResults.push(...deepResults);
  } else {
    // Build cross-directory template param map for better template variable resolution
    const knownTemplateParams = await buildTemplateParamMap(files);
    const analyzeOptions = { ...options, knownTemplateParams };

    for (const file of files) {
      try {
        const result = await analyze(file, analyzeOptions);
        allResults.push(result);
      } catch (error: any) {
        allResults.push({
          filepath: path.resolve(file),
          valid: false,
          errors: [{ message: error.message }],
        });
      }
    }
  }

  const anyErrors = allResults.some(result => hasErrors(result));
  const anyWarnings = allResults.some(result => hasWarnings(result));

  if (format === 'json') {
    console.log(JSON.stringify(allResults, null, 2));
  } else if (options.verbose) {
    for (const result of allResults) {
      displayResult(result, 'text');
    }

    console.log();
    const passed = allResults.filter(r => !hasErrors(r)).length;
    const failed = allResults.length - passed;
    const summary = `${allResults.length} files: ${passed} passed${failed > 0 ? `, ${failed} failed` : ''}`;
    console.log(failed > 0 ? chalk.red(summary) : chalk.green(summary));
  } else {
    // Concise output: green checkmarks for clean files, details only for issues
    const basePath = path.resolve(filepaths[0]);
    console.log();

    for (const result of allResults) {
      displayResultCompact(result, basePath);
    }

    console.log();
    const passed = allResults.filter(r => !hasErrors(r)).length;
    const failed = allResults.length - passed;
    const withWarnings = allResults.filter(r => !hasErrors(r) && hasWarnings(r)).length;
    let summary = `${allResults.length} files: ${passed} passed`;
    if (failed > 0) summary += `, ${failed} failed`;
    if (withWarnings > 0) summary += `, ${withWarnings} with warnings`;
    console.log(failed > 0 ? chalk.red(summary) : withWarnings > 0 ? chalk.yellow(summary) : chalk.green(summary));
  }

  if (anyErrors) {
    process.exit(1);
  }
  if (options.errorOnWarnings && anyWarnings) {
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
Usage: mlld validate <filepath|directory> [options]

Validate mlld syntax and analyze module/template structure without executing.
Supports .mld, .mld.md, .att (@ templates), and .mtt (mustache templates).
When given a directory, recursively validates all mlld files.

Options:
  --verbose             Show full details for all files (default: concise for directories)
  --format <format>     Output format: json or text (default: text)
  --deep                Follow imports/templates recursively (recommended for entry scripts)
  --ast                 Include the parsed AST in output (requires --format json)
  --no-check-variables  Skip undefined variable checking
  --error-on-warnings   Exit with code 1 if warnings are found
  -h, --help            Show this help message

Examples:
  mlld validate module.mld                     # Validate a module
  mlld validate template.att                   # Validate a template
  mlld validate ./my-project/                  # Validate all files recursively
  mlld validate ./my-project/ --verbose        # Full details for all files
  mlld validate llm/run/review/index.mld --deep
  mlld validate module.mld --format json       # JSON output
  mlld validate module.mld --error-on-warnings # Fail on warnings
        `);
        return;
      }

      if (args.length === 0) {
        console.error(chalk.red('File path or directory is required'));
        console.log('Usage: mlld validate <filepath|directory> [options]');
        process.exit(1);
      }

      const format = (flags.format || 'text') as 'json' | 'text';
      const ast = flags.ast === true;
      const deep = flags.deep === true;
      const checkVariables = flags['no-check-variables'] !== true && flags.noCheckVariables !== true;
      const errorOnWarnings = flags['error-on-warnings'] === true || flags.errorOnWarnings === true;
      const verbose = flags.verbose === true;

      if (!['json', 'text'].includes(format)) {
        console.error(chalk.red('Invalid format. Must be: json or text'));
        process.exit(1);
      }

      if (ast && format !== 'json') {
        console.error(chalk.red('--ast requires --format json'));
        process.exit(1);
      }

      const options: AnalyzeOptions = {
        format,
        ast,
        checkVariables,
        errorOnWarnings,
        verbose,
        deep,
        strictTemplateVariables: deep
      };

      // Detect if any arg is a directory or if multiple args
      let isMulti = args.length > 1;
      if (!isMulti) {
        try {
          const stat = await fs.stat(path.resolve(args[0]));
          isMulti = stat.isDirectory();
        } catch {
          // File doesn't exist yet — let analyzeCommand handle the error
        }
      }

      if (isMulti) {
        await analyzeMultiple(args, options);
      } else {
        await analyzeCommand(args[0], options);
      }
    }
  };
}

// Keep analyze as an alias
export const createAnalyzeCommand = createValidateCommand;
