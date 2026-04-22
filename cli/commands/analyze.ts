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
import {
  getWithClauseField,
  listWithClauseFields
} from '@interpreter/utils/with-clause';
import { getStaticObjectKey } from '@interpreter/utils/object-compat';
import { validateExecutableAuthorizationMetadata } from '@interpreter/eval/exe/definition-helpers';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { BUILTIN_POLICY_RULES, isBuiltinPolicyRuleName } from '@core/policy/builtin-rules';
import {
  stripPolicyAuthorizableField,
  validatePolicyAuthorizations,
  type AuthorizationToolContext,
  type PolicyAuthorizationIssue
} from '@core/policy/authorizations';
import { isRoleDisplayModeName } from '@core/records/display-mode';
import { matchesLabelPattern } from '@core/policy/fact-labels';
import { normalizeNamedOperationRef } from '@core/policy/operation-labels';
import {
  buildToolInputSchemaFromRecordDefinition,
  computeAllowWholeObjectInput
} from '@core/tools/input-schema';
import { cloneToolInputSchema } from '@core/types/tools';
import * as yaml from 'js-yaml';
import type {
  MlldNode,
  ImportDirectiveNode,
  ExportDirectiveNode,
  GuardDirectiveNode,
  ExecutableDirectiveNode,
  RunDirective,
  ExecDirective,
  VariableReferenceNode
} from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import {
  canUseRecordForOutput,
  canUseRecordForInput,
  type RecordDefinition,
  type RecordPolicySetTarget
} from '@core/types/record';
import type {
  BoxDirectiveNode
} from '@core/types/box';
import type {
  ShelfDefinition,
  ShelfScopeSlotBinding,
  ShelfScopeSlotRef
} from '@core/types/shelf';
import type {
  SessionDefinition,
  SessionSlotType
} from '@core/types/session';
import { buildRecordDefinitionFromDirective } from '@core/validation/record-definition';
import { buildSessionDefinitionFromDirective } from '@core/validation/session-definition';
import { buildShelfDefinitionFromDirective } from '@core/validation/shelf-definition';
import {
  analyzeStaticPolicyAuthorizationIntent,
  type StaticPolicyCallIssue
} from '@core/validation/policy-call';
import {
  validateShelfScopeBindingConflicts,
  validateShelfScopeBindingTargets,
  type ValidatableShelfScopeBinding
} from '@core/validation/shelf-scope';
import {
  analyzeReturnChannels,
  type ReturnChannelAnalysis
} from '@core/validation/return-channels';

export interface AnalyzeOptions {
  format?: 'json' | 'text';
  ast?: boolean;
  checkVariables?: boolean;
  errorOnWarnings?: boolean;
  verbose?: boolean;
  knownTemplateParams?: Map<string, Set<string>>;
  deep?: boolean;
  strictTemplateVariables?: boolean;
  context?: string[];
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
  controlArgs?: string[];
  updateArgs?: string[];
  exactPayloadArgs?: string[];
  sourceArgs?: string[];
  correlateControlArgs?: boolean;
  outputRecord?: ExecutableOutputRecordInfo;
}

export interface ExecutableOutputRecordInfo {
  kind: 'static' | 'dynamic';
  name?: string;
  ref?: string;
}

export interface ImportInfo {
  from: string;
  names?: string[];
}

export interface GuardInfo {
  name: string;
  timing: string;
  filter: string;
  privileged?: boolean;
  arms?: GuardArmInfo[];
  label?: string;
}

export interface GuardArmInfo {
  condition: string;
  action: 'allow' | 'deny' | 'retry' | 'resume' | 'prompt' | 'env';
  reason?: string;
  line?: number;
  column?: number;
}

export interface RecordFieldInfo {
  name: string;
  kind: 'input' | 'computed';
  classification: 'fact' | 'data';
  optional: boolean;
  valueType?: string;
}

export interface RecordInfo {
  name: string;
  key?: string;
  validate?: string;
  rootMode?: string;
  display?: 'open' | 'legacy' | 'named';
  whenCount?: number;
  fields?: RecordFieldInfo[];
}

export interface ShelfSlotInfo {
  name: string;
  record: string;
  cardinality: 'singular' | 'collection';
  optional: boolean;
  merge?: 'replace' | 'append' | 'upsert';
  from?: string;
}

export interface ShelfInfo {
  name: string;
  slots: ShelfSlotInfo[];
}

export interface SessionSlotInfo {
  name: string;
  kind: 'primitive' | 'record';
  type: string;
  optional: boolean;
  isArray: boolean;
}

export interface SessionInfo {
  name: string;
  declarationId: string;
  slots: SessionSlotInfo[];
}

export interface PolicyInfo {
  name: string;
  rules?: string[];
  operations?: Record<string, string[]>;
  locked?: boolean;
  refs?: string[];
}

export type PolicyCallSourceKind = 'inline' | 'top_level_var' | 'field_access' | 'unknown';

export type PolicyCallSkipReason =
  | 'dynamic-source-intent'
  | 'dynamic-source-tools'
  | 'dynamic-source-task'
  | 'unsupported-expression'
  | 'unresolved-top-level-binding';

export interface PolicyCallDiagnostic {
  reason: string;
  message: string;
  tool?: string;
  arg?: string;
  element?: number;
}

export interface PolicyCallInfo {
  callee: '@policy.build' | '@policy.validate';
  location: {
    line?: number;
    column?: number;
  };
  status: 'analyzed' | 'skipped';
  skipReason?: PolicyCallSkipReason;
  intentSource: PolicyCallSourceKind;
  toolsSource: PolicyCallSourceKind;
  taskSource: PolicyCallSourceKind;
  diagnostics?: PolicyCallDiagnostic[];
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
  | 'hyphenated-identifier-in-template'
  | 'for-when-static-condition'
  | 'direct-text-data-on-exec-result'
  | 'privileged-wildcard-allow'
  | 'guard-unreachable-arm'
  | 'unknown-policy-rule'
  | 'privileged-guard-without-policy-operation'
  | 'guard-context-missing-exe'
  | 'guard-context-missing-op-label'
  | 'guard-context-missing-arg'
  | 'policy-operations-unknown-label'
  | 'policy-authorizations-deny-unknown-tool'
  | 'policy-authorizations-can-authorize-unknown-tool'
  | 'policy-label-flow-unknown-target'
  | 'policy-authorizations-empty-entry'
  | 'policy-authorizations-unconstrained-tool'
  | 'legacy-authorizable-field'
  | 'thin-arrow-exe-not-surfaced'
  | 'strict-tool-return-without-record'
  | 'mixed-tool-return-for-scope';

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
  policies?: PolicyInfo[];
  policyCalls?: PolicyCallInfo[];
  records?: RecordInfo[];
  shelves?: ShelfInfo[];
  sessions?: SessionInfo[];
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

const EXECUTABLE_WITH_CLAUSE_KEYS = new Set([
  'auth',
  'controlArgs',
  'correlateControlArgs',
  'delayMs',
  'description',
  'display',
  'exactPayloadArgs',
  'format',
  'guards',
  'parallel',
  'pipeline',
  'policy',
  'profile',
  'sourceArgs',
  'stdin',
  'stream',
  'streamFormat',
  'tools',
  'trust',
  'updateArgs',
  'using'
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
  'cast',
  'yaml', 'html', 'text',
  // Pipeline context aliases
  'p',
  // Implicit for-loop locals
  'item', 'index', 'key'
]);

const DEPRECATED_JSON_BASE_NAMES = new Set(['json', 'JSON']);
const VALIDATE_CONFIG_FILENAMES = ['mlld-config.json'];
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
  'hyphenated-identifier-in-template',
  'for-when-static-condition',
  'privileged-wildcard-allow',
  'guard-unreachable-arm',
  'unknown-policy-rule',
  'privileged-guard-without-policy-operation',
  'guard-context-missing-exe',
  'guard-context-missing-op-label',
  'guard-context-missing-arg',
  'policy-operations-unknown-label',
  'policy-authorizations-deny-unknown-tool',
  'policy-authorizations-can-authorize-unknown-tool',
  'policy-label-flow-unknown-target',
  'policy-authorizations-empty-entry',
  'policy-authorizations-unconstrained-tool',
  'legacy-authorizable-field'
]);
const GENERIC_EXE_PARAMETER_SUGGESTIONS = new Map<string, string>([
  ['result', 'status'],
  ['output', 'finalOutput'],
  ['response', 'modelResponse'],
  ['data', 'inputData'],
  ['value', 'inputValue']
]);
const BUILTIN_POLICY_OPERATION_TARGETS = [
  'advice',
  'dangerous',
  'destructive',
  'exfil',
  'filesystem',
  'fs:r',
  'fs:rw',
  'fs:w',
  'llm',
  'moderate',
  'net:r',
  'net:rw',
  'net:w',
  'network',
  'op:append',
  'op:cmd',
  'op:js',
  'op:log',
  'op:node',
  'op:output',
  'op:prose',
  'op:py',
  'op:sh',
  'op:show',
  'op:stream',
  'paid',
  'privileged',
  'safe',
  'tool:r',
  'tool:rw',
  'tool:w'
] as const;


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

function parseResolverPrefixVariables(configData: unknown): Set<string> {
  const known = new Set<string>();
  if (!configData || typeof configData !== 'object' || Array.isArray(configData)) {
    return known;
  }

  const config = configData as {
    resolvers?: { prefixes?: unknown };
    resolverPrefixes?: unknown;
  };

  const prefixes: unknown[] = [];
  if (Array.isArray(config.resolvers?.prefixes)) {
    prefixes.push(...config.resolvers.prefixes);
  }
  if (Array.isArray(config.resolverPrefixes)) {
    prefixes.push(...config.resolverPrefixes);
  }

  for (const entry of prefixes) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const prefixValue = (entry as { prefix?: unknown }).prefix;
    if (typeof prefixValue !== 'string') {
      continue;
    }

    const trimmedPrefix = prefixValue.trim();
    if (!trimmedPrefix.startsWith('@')) {
      continue;
    }

    const withoutAt = trimmedPrefix.slice(1);
    const firstSegment = withoutAt.split('/')[0]?.trim() ?? '';
    if (!firstSegment) {
      continue;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(firstSegment)) {
      continue;
    }

    known.add(firstSegment);
  }

  return known;
}

async function loadResolverPrefixVariables(moduleFilepath: string): Promise<Set<string>> {
  const configPath = await findNearestValidateConfigPath(moduleFilepath);
  if (!configPath) {
    return new Set();
  }

  try {
    const configRaw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(configRaw) as unknown;
    return parseResolverPrefixVariables(parsed);
  } catch {
    return new Set();
  }
}

/**
 * Detect undefined variable references in AST
 */
function shouldIgnoreVariableReferenceWarning(node: any, sourceText?: string): boolean {
  if (!sourceText || !node?.location?.start || !node?.location?.end) {
    return false;
  }

  const startOffset = node.location.start.offset;
  const endOffset = node.location.end.offset;
  if (typeof startOffset !== 'number' || typeof endOffset !== 'number') {
    return false;
  }

  const prevChar = startOffset > 0 ? sourceText[startOffset - 1] : '';
  const nextChar = endOffset < sourceText.length ? sourceText[endOffset] : '';
  const charAfterNext = endOffset + 1 < sourceText.length ? sourceText[endOffset + 1] : '';

  // Ignore @scope/package-style references.
  if (nextChar === '/' && /[A-Za-z0-9._-]/.test(charAfterNext)) {
    return true;
  }

  // Ignore @ tokens embedded in text literals (e.g., user@example.com).
  if (/[A-Za-z0-9._]/.test(prevChar)) {
    return true;
  }

  return false;
}

function detectUndefinedVariables(
  ast: MlldNode[],
  sourceText?: string,
  additionalKnownVariables: ReadonlySet<string> = new Set()
): UndefinedVariableWarning[] {
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

    // hook @name before/after ... = [...]
    if (node.type === 'Directive' && node.kind === 'hook') {
      const hookNameNode = node.values?.name?.[0];
      if (hookNameNode?.identifier) {
        declared.add(hookNameNode.identifier);
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

    // record @name = ...
    if (node.type === 'Directive' && node.kind === 'record') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        declared.add(identNode.identifier);
      }
    }

    // shelf @name = ...
    if (node.type === 'Directive' && node.kind === 'shelf') {
      const identNode = node.values?.identifier?.[0];
      if (identNode?.identifier) {
        declared.add(identNode.identifier);
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

      if (shouldIgnoreVariableReferenceWarning(node, sourceText)) {
        return;
      }

      // Skip if already declared, builtin, or already warned
      if (
        declared.has(name) ||
        BUILTIN_VARIABLES.has(name) ||
        additionalKnownVariables.has(name) ||
        seen.has(name)
      ) {
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

function readExecInvocationName(node: unknown): string | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const invocation = node as Record<string, unknown>;
  const commandRef =
    invocation.commandRef && typeof invocation.commandRef === 'object'
      ? (invocation.commandRef as Record<string, unknown>)
      : undefined;

  const explicitName = typeof commandRef?.name === 'string' ? commandRef.name.trim() : '';
  if (explicitName) {
    return explicitName;
  }

  const rawIdentifier = typeof commandRef?.rawIdentifier === 'string' ? commandRef.rawIdentifier.trim() : '';
  if (rawIdentifier) {
    return rawIdentifier;
  }

  if (Array.isArray(commandRef?.identifier)) {
    const identifierFromParts = commandRef.identifier
      .map(part => {
        if (!part || typeof part !== 'object') {
          return '';
        }
        const typedPart = part as Record<string, unknown>;
        if (typeof typedPart.content === 'string') {
          return typedPart.content;
        }
        if (typeof typedPart.identifier === 'string') {
          return typedPart.identifier;
        }
        return '';
      })
      .join('')
      .trim();
    if (identifierFromParts) {
      return identifierFromParts;
    }
  }

  if (typeof commandRef?.identifier === 'string') {
    const identifier = commandRef.identifier.trim();
    if (identifier) {
      return identifier;
    }
  }

  return null;
}

function readExecInvocationQualifiedName(node: unknown): string | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const invocation = node as Record<string, unknown>;
  const commandRef =
    invocation.commandRef && typeof invocation.commandRef === 'object'
      ? (invocation.commandRef as Record<string, unknown>)
      : undefined;

  const objectReference =
    commandRef?.objectReference && typeof commandRef.objectReference === 'object'
      ? (commandRef.objectReference as Record<string, unknown>)
      : undefined;
  if (Array.isArray(commandRef?.identifier) && commandRef.identifier.length > 0) {
    const firstIdentifier = commandRef.identifier[0];
    if (
      firstIdentifier &&
      typeof firstIdentifier === 'object' &&
      (firstIdentifier as Record<string, unknown>).type === 'VariableReference' &&
      typeof (firstIdentifier as Record<string, unknown>).identifier === 'string' &&
      Array.isArray((firstIdentifier as Record<string, unknown>).fields) &&
      (firstIdentifier as Record<string, unknown>).fields.length > 0
    ) {
      const typedIdentifier = firstIdentifier as Record<string, unknown>;
      const fieldSuffix = (typedIdentifier.fields as unknown[])
        .map(field => getFieldAccessorName(field))
        .filter((field): field is string => typeof field === 'string' && field.length > 0)
        .join('.');
      if (fieldSuffix) {
        return `${typedIdentifier.identifier}.${fieldSuffix}`;
      }
    }
  }

  if (
    objectReference?.type === 'VariableReference'
    && typeof objectReference.identifier === 'string'
    && Array.isArray(objectReference.fields)
    && objectReference.fields.length > 0
  ) {
    const fieldSuffix = objectReference.fields
      .map(field => getFieldAccessorName(field))
      .filter((field): field is string => typeof field === 'string' && field.length > 0)
      .join('.');
    if (fieldSuffix) {
      return `${objectReference.identifier}.${fieldSuffix}`;
    }
  }

  return readExecInvocationName(node);
}

function readExecInvocationArgs(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') {
    return [];
  }
  const invocation = node as Record<string, unknown>;
  const commandRef =
    invocation.commandRef && typeof invocation.commandRef === 'object'
      ? (invocation.commandRef as Record<string, unknown>)
      : undefined;
  if (!commandRef || !Array.isArray(commandRef.args)) {
    return [];
  }
  return commandRef.args;
}

function detectPassThroughOptionalParameterWarnings(ast: MlldNode[]): UndefinedVariableWarning[] {
  interface ExeDefinition {
    name: string;
    params: string[];
    node: MlldNode;
  }

  interface ExeInvocation {
    name: string;
    argsCount: number;
    line?: number;
  }

  const executableDefinitions = new Map<string, ExeDefinition>();
  const invocations: ExeInvocation[] = [];

  const visitAnyNode = (node: unknown, callback: (typedNode: Record<string, unknown>) => void): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visitAnyNode(item, callback);
      }
      return;
    }

    const typedNode = node as Record<string, unknown>;
    if (typeof typedNode.type === 'string') {
      callback(typedNode);
    }

    for (const child of Object.values(typedNode)) {
      visitAnyNode(child, callback);
    }
  };

  visitAnyNode(ast, (node) => {
    if (node.type === 'Directive' && node.kind === 'exe') {
      const values =
        node.values && typeof node.values === 'object'
          ? (node.values as Record<string, unknown>)
          : undefined;
      const identifierNodes = Array.isArray(values?.identifier) ? values.identifier : [];
      const firstIdentifier =
        identifierNodes.length > 0 && identifierNodes[0] && typeof identifierNodes[0] === 'object'
          ? (identifierNodes[0] as Record<string, unknown>)
          : undefined;
      const name = typeof firstIdentifier?.identifier === 'string' ? firstIdentifier.identifier : '';
      if (typeof name !== 'string' || !name) {
        return;
      }
      const params = Array.isArray(values?.params)
        ? values.params
            .map((param: any) => (typeof param?.name === 'string' ? param.name : ''))
            .filter((paramName: string) => paramName.length > 0)
        : [];
      executableDefinitions.set(name, { name, params, node: node as unknown as MlldNode });
      return;
    }

    if (node.type === 'ExecInvocation') {
      const name = readExecInvocationName(node);
      if (!name) {
        return;
      }
      invocations.push({
        name,
        argsCount: readExecInvocationArgs(node).length,
        line:
          node.location && typeof node.location === 'object'
            ? ((node.location as any).start?.line as number | undefined)
            : undefined
      });
    }
  });

  const maybeOmittedParamsByExe = new Map<string, Map<string, number[]>>();
  for (const [exeName, definition] of executableDefinitions.entries()) {
    if (definition.params.length === 0) {
      continue;
    }

    const callsites = invocations.filter(invocation => invocation.name === exeName);
    if (callsites.length === 0) {
      // Without callsites in this module we cannot prove omission.
      continue;
    }

    const omittedByParam = new Map<string, number[]>();
    for (const callsite of callsites) {
      if (callsite.argsCount >= definition.params.length) {
        continue;
      }

      for (let index = callsite.argsCount; index < definition.params.length; index += 1) {
        const paramName = definition.params[index];
        if (!paramName) {
          continue;
        }
        const lines = omittedByParam.get(paramName) ?? [];
        if (typeof callsite.line === 'number') {
          lines.push(callsite.line);
        }
        omittedByParam.set(paramName, lines);
      }
    }

    if (omittedByParam.size > 0) {
      maybeOmittedParamsByExe.set(exeName, omittedByParam);
    }
  }

  const warnings: UndefinedVariableWarning[] = [];
  const seen = new Set<string>();

  for (const [exeName, omittedByParam] of maybeOmittedParamsByExe.entries()) {
    const definition = executableDefinitions.get(exeName);
    if (!definition) {
      continue;
    }

    visitAnyNode(definition.node, (node) => {
      if (node.type !== 'ExecInvocation') {
        return;
      }

      const targetName = readExecInvocationName(node) ?? 'unknown';
      const invocationArgs = readExecInvocationArgs(node);
      for (const arg of invocationArgs) {
        if (!arg || typeof arg !== 'object') {
          continue;
        }
        const variableArg = arg as Record<string, unknown>;
        if (variableArg.type !== 'VariableReference' || typeof variableArg.identifier !== 'string') {
          continue;
        }

        const paramName = variableArg.identifier;
        if (!omittedByParam.has(paramName)) {
          continue;
        }

        const line = (variableArg.location as any)?.start?.line as number | undefined;
        const column = (variableArg.location as any)?.start?.column as number | undefined;
        const dedupeKey = `${exeName}:${targetName}:${paramName}:${line ?? 0}:${column ?? 0}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);

        const omittedLines = omittedByParam.get(paramName) ?? [];
        const uniqueLines = Array.from(new Set(omittedLines));
        const callerHint =
          uniqueLines.length > 0
            ? ` (omitted at callsite line${uniqueLines.length === 1 ? '' : 's'} ${uniqueLines.slice(0, 3).join(', ')}${uniqueLines.length > 3 ? ', ...' : ''})`
            : '';

        warnings.push({
          variable: paramName,
          line,
          column,
          suggestion:
            `@${paramName} is a trailing parameter on @${exeName} and may be undefined${callerHint}. ` +
            `Passing it to @${targetName} can fail at runtime; provide the argument at callsites or add a fallback before calling @${targetName}.`
        });
      }
    });
  }

  return warnings;
}

function dedupeUndefinedVariableWarnings(
  warnings: readonly UndefinedVariableWarning[]
): UndefinedVariableWarning[] {
  const byKey = new Map<string, UndefinedVariableWarning>();
  for (const warning of warnings) {
    const key = `${warning.variable}:${warning.line ?? 0}:${warning.column ?? 0}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, warning);
      continue;
    }

    if (!existing.suggestion && warning.suggestion) {
      byKey.set(key, { ...existing, suggestion: warning.suggestion });
    }
  }
  return Array.from(byKey.values());
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

    // Increase depth when entering blocks
    const blockKeys = new Set(['action', 'then', 'else', 'body']);
    const hasBlock = node.body || node.children || node.values?.action || node.values?.then || node.values?.else;
    const newDepth = hasBlock ? depth + 1 : depth;

    // Recurse into structural properties
    if (node.body) walkWithScope(node.body, newDepth);
    if (node.children) walkWithScope(node.children, newDepth);
    if (node.values) {
      for (const key in node.values) {
        // Skip identifier to avoid double-counting
        if (key !== 'identifier') {
          // Block-body keys create a new scope
          const scopeDepth = blockKeys.has(key) ? newDepth : depth;
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

    if (node.type === 'Directive' && node.kind === 'hook') {
      const hookNameNode = node.values?.name?.[0];
      if (hookNameNode?.identifier) {
        declared.add(hookNameNode.identifier);
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
      const identifier = typeof maybeRef.identifier === 'string' ? maybeRef.identifier : '';
      if (identifier === 'json' || identifier === 'JSON') {
        pushWarning(identifier, maybeRef.location);
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

    if (maybeRef.type === 'ExecInvocation') {
      const commandRef = maybeRef.commandRef;
      const rawIdentifier =
        commandRef && typeof commandRef === 'object' && typeof commandRef.rawIdentifier === 'string'
          ? commandRef.rawIdentifier
          : '';
      const fallbackName =
        commandRef && typeof commandRef === 'object' && typeof commandRef.name === 'string'
          ? commandRef.name
          : '';
      const candidate = rawIdentifier || fallbackName;
      if (candidate) {
        pushWarning(candidate, maybeRef.location ?? commandRef?.location);
      }
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

function isNoneOrWildcardConditionNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }
  const literal = node as { type?: string; valueType?: string };
  return literal.type === 'Literal' && (literal.valueType === 'none' || literal.valueType === 'wildcard');
}

function isNoneOrWildcardCondition(condition: unknown): boolean {
  if (!Array.isArray(condition) || condition.length !== 1) {
    return false;
  }
  const first = condition[0];
  if (Array.isArray(first)) {
    return first.length === 1 && isNoneOrWildcardConditionNode(first[0]);
  }
  return isNoneOrWildcardConditionNode(first);
}

function collectVariableReferences(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectVariableReferences(item, out);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  if (record.type === 'VariableReference' && typeof record.identifier === 'string' && record.identifier.trim().length > 0) {
    out.add(record.identifier);
  }

  for (const nested of Object.values(record)) {
    collectVariableReferences(nested, out);
  }
}

function getFirstForWhenCondition(whenExpression: any): { condition: unknown; line?: number; column?: number } | null {
  if (!whenExpression || whenExpression.type !== 'WhenExpression' || !Array.isArray(whenExpression.conditions)) {
    return null;
  }

  for (const entry of whenExpression.conditions) {
    if (!entry || typeof entry !== 'object' || !('condition' in entry)) {
      continue;
    }
    const condition = (entry as { condition?: unknown }).condition;
    if (!condition || isNoneOrWildcardCondition(condition)) {
      continue;
    }
    const conditionLocation =
      (Array.isArray(condition) && condition.length > 0
        ? (Array.isArray(condition[0]) ? condition[0]?.[0] : condition[0])
        : null) as any;
    return {
      condition,
      line: conditionLocation?.location?.start?.line ?? whenExpression.location?.start?.line,
      column: conditionLocation?.location?.start?.column ?? whenExpression.location?.start?.column
    };
  }

  return null;
}

/**
 * Detect direct .text or .data access on variables assigned from exec invocations.
 * These should typically use .mx.text or .mx.data to access wrapper metadata.
 */
function detectDirectTextDataOnExecResult(ast: MlldNode[]): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const execAssignedVars = new Set<string>();

  // Pass 1: collect variable names assigned from ExecInvocation
  function collectExecVars(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) collectExecVars(child);
      return;
    }

    // var @x = @fn(...)
    if (node.type === 'Directive' && node.kind === 'var') {
      const name = node.values?.identifier?.[0]?.identifier;
      const value = node.values?.value;
      if (name && hasExecInvocation(value)) {
        execAssignedVars.add(name);
      }
    }

    // let @x = @fn(...)
    if (node.type === 'LetAssignment') {
      const name = node.identifier;
      const value = node.value;
      if (name && hasExecInvocation(value)) {
        execAssignedVars.add(name);
      }
    }

    for (const val of Object.values(node as Record<string, unknown>)) {
      collectExecVars(val);
    }
  }

  function hasExecInvocation(value: any): boolean {
    if (!value) return false;
    if (Array.isArray(value)) {
      return value.length === 1 && value[0]?.type === 'ExecInvocation';
    }
    return value?.type === 'ExecInvocation';
  }

  // Pass 2: find @var.text or @var.data where var is exec-assigned
  function findDirectAccess(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) findDirectAccess(child);
      return;
    }

    if (node.type === 'VariableReference' && Array.isArray(node.fields) && node.fields.length >= 1) {
      const name = node.identifier;
      const firstField = node.fields[0];
      if (
        execAssignedVars.has(name) &&
        firstField?.type === 'field' &&
        (firstField.value === 'text' || firstField.value === 'data')
      ) {
        const fieldName = firstField.value;
        const loc = firstField.location ?? node.location;
        warnings.push({
          code: 'direct-text-data-on-exec-result',
          message: `@${name}.${fieldName} accesses raw data directly — use @${name}.mx.${fieldName} for wrapper metadata.`,
          line: loc?.start?.line,
          column: loc?.start?.column,
          suggestion: `Replace @${name}.${fieldName} with @${name}.mx.${fieldName}. Direct .${fieldName} access on exec results fails when the value is a JSON string.`,
        });
      }
    }

    for (const val of Object.values(node as Record<string, unknown>)) {
      findDirectAccess(val);
    }
  }

  collectExecVars(ast);
  if (execAssignedVars.size > 0) {
    findDirectAccess(ast);
  }
  return warnings;
}

function detectForWhenStaticConditionWarnings(ast: MlldNode[]): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const seen = new Set<string>();

  walkAST(ast, (node: any) => {
    let loopVariableNames: string[] = [];
    let whenExpression: any = null;

    if (node.type === 'ForExpression') {
      const variableName = node.variable?.identifier;
      const keyVariableName = node.keyVariable?.identifier;
      loopVariableNames = [variableName, keyVariableName].filter(
        (name): name is string => typeof name === 'string' && name.trim().length > 0
      );
      if (Array.isArray(node.expression) && node.expression.length === 1 && node.expression[0]?.type === 'WhenExpression') {
        whenExpression = node.expression[0];
      }
    } else if (node.type === 'Directive' && node.kind === 'for') {
      const variableName = node.values?.variable?.[0]?.identifier;
      const keyVariableName = node.values?.key?.[0]?.identifier;
      loopVariableNames = [variableName, keyVariableName].filter(
        (name): name is string => typeof name === 'string' && name.trim().length > 0
      );
      if (Array.isArray(node.values?.action) && node.values.action.length === 1 && node.values.action[0]?.type === 'WhenExpression') {
        whenExpression = node.values.action[0];
      }
    }

    if (loopVariableNames.length === 0 || !whenExpression) {
      return;
    }

    const firstCondition = getFirstForWhenCondition(whenExpression);
    if (!firstCondition) {
      return;
    }

    const referencedVariables = new Set<string>();
    collectVariableReferences(firstCondition.condition, referencedVariables);

    const referencesLoopVariable = loopVariableNames.some(name => referencedVariables.has(name));
    if (referencesLoopVariable) {
      return;
    }

    const line = firstCondition.line ?? node.location?.start?.line;
    const column = firstCondition.column ?? node.location?.start?.column;
    const dedupeKey = `${loopVariableNames.sort().join(',')}:${line ?? 0}:${column ?? 0}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    const target = loopVariableNames.map(name => `@${name}`).join(' or ');
    warnings.push({
      code: 'for-when-static-condition',
      message: `for...when condition does not reference ${target}, so the same condition is evaluated for every iteration.`,
      line,
      column,
      suggestion: 'If you want to gate the whole loop, pre-filter first: var @items = @cond ? @list : []. To silence this warning, set validate.suppressWarnings to include "for-when-static-condition".'
    });
  });

  return warnings;
}

function extractSourceSegment(
  sourceText: string,
  location?: { start?: { offset?: number }; end?: { offset?: number } } | null
): string | undefined {
  const start = location?.start?.offset;
  const end = location?.end?.offset;

  if (typeof start !== 'number' || typeof end !== 'number' || end < start) {
    return undefined;
  }

  const text = sourceText.slice(start, end).trim();
  return text.length > 0 ? text : undefined;
}

function fallbackNodeSignature(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return String(node);
  }

  const { location, nodeId, ...rest } = node as Record<string, unknown>;
  return JSON.stringify(rest);
}

function getFieldAccessorName(field: unknown): string | null {
  if (!field || typeof field !== 'object') {
    return null;
  }

  const typedField = field as Record<string, unknown>;
  const direct =
    (typeof typedField.value === 'string' && typedField.value) ||
    (typeof typedField.name === 'string' && typedField.name) ||
    (typeof typedField.identifier === 'string' && typedField.identifier);

  if (direct) {
    return direct;
  }

  if (
    (typedField.type === 'stringIndex' || typedField.type === 'bracketAccess') &&
    typeof typedField.value === 'string'
  ) {
    return typedField.value;
  }

  return null;
}

function isMxFieldReference(node: unknown, pathSegments: string[]): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  const typedNode = node as Record<string, unknown>;
  if (typedNode.type !== 'VariableReference' || typedNode.identifier !== 'mx' || !Array.isArray(typedNode.fields)) {
    return false;
  }

  const fieldNames = typedNode.fields
    .map(field => getFieldAccessorName(field))
    .filter((value): value is string => typeof value === 'string');

  return pathSegments.every((segment, index) => fieldNames[index] === segment);
}

function extractStringLiteralValue(node: unknown): string | null {
  if (typeof node === 'string') {
    return node;
  }

  if (Array.isArray(node)) {
    if (node.length === 1) {
      return extractStringLiteralValue(node[0]);
    }
    const parts = node
      .map(part => extractStringLiteralValue(part))
      .filter((part): part is string => typeof part === 'string');
    return parts.length === node.length ? parts.join('') : null;
  }

  if (!node || typeof node !== 'object') {
    return null;
  }

  const typedNode = node as Record<string, unknown>;
  if (typedNode.type === 'Literal' && typeof typedNode.value === 'string') {
    return typedNode.value;
  }
  if (typedNode.type === 'Text' && typeof typedNode.content === 'string') {
    return typedNode.content;
  }
  return null;
}

function flattenConditionConjunctions(node: unknown): unknown[] {
  if (
    node &&
    typeof node === 'object' &&
    (node as Record<string, unknown>).type === 'BinaryExpression' &&
    (node as Record<string, unknown>).operator === '&&'
  ) {
    const typedNode = node as Record<string, unknown>;
    return [
      ...flattenConditionConjunctions(typedNode.left),
      ...flattenConditionConjunctions(typedNode.right)
    ];
  }

  return [node];
}

function extractGuardConditionSignatures(condition: unknown, sourceText: string): string[] {
  const root =
    Array.isArray(condition) && condition.length === 1
      ? condition[0]
      : condition;

  if (!root) {
    return [];
  }

  return flattenConditionConjunctions(root).map(node =>
    extractSourceSegment(sourceText, (node as any)?.location) ?? fallbackNodeSignature(node)
  );
}

function extractGuardConditionText(condition: unknown, sourceText: string): string {
  if (!Array.isArray(condition) || condition.length === 0) {
    return '*';
  }

  const first = condition[0] as any;
  const last = condition[condition.length - 1] as any;
  const start = first?.location?.start?.offset;
  const end = last?.location?.end?.offset;
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    const text = sourceText.slice(start, end).trim();
    if (text) {
      return text;
    }
  }

  return extractSourceSegment(sourceText, first?.location) ?? fallbackNodeSignature(condition);
}

function extractStaticValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const isSingleAstWrapper =
      value.length === 1 &&
      value[0] !== null &&
      typeof value[0] === 'object' &&
      !Array.isArray(value[0]) &&
      'type' in (value[0] as Record<string, unknown>);

    if (isSingleAstWrapper) {
      return extractStaticValue(value[0]);
    }

    const parts = value.map(part => extractStaticValue(part));
    if (parts.every(part => part !== undefined)) {
      return parts;
    }
    return undefined;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const typedValue = value as Record<string, unknown>;

  if (Array.isArray(typedValue.content)) {
    const extractedContent = extractStaticValue(typedValue.content);
    if (
      typeof extractedContent === 'string' ||
      typeof extractedContent === 'number' ||
      typeof extractedContent === 'boolean'
    ) {
      return extractedContent;
    }
    if (Array.isArray(extractedContent)) {
      const stringParts = extractedContent.filter(
        (part): part is string => typeof part === 'string'
      );
      if (stringParts.length === extractedContent.length) {
        return stringParts.join('');
      }
    }
  }

  if (typedValue.type === 'Literal') {
    return typedValue.value;
  }

  if (typedValue.type === 'Text') {
    return typeof typedValue.content === 'string' ? typedValue.content : undefined;
  }

  if (typedValue.type === 'VariableReference' && typeof typedValue.identifier === 'string') {
    return `@${typedValue.identifier}`;
  }

  if (typedValue.type === 'array' && Array.isArray(typedValue.items)) {
    return typedValue.items
      .map(item => extractStaticValue(item))
      .filter(item => item !== undefined);
  }

  if (typedValue.type === 'object' && Array.isArray(typedValue.entries)) {
    const result: Record<string, unknown> = {};
    for (const entry of typedValue.entries as Array<Record<string, unknown>>) {
      if (entry.type === 'pair' || entry.type === 'conditionalPair') {
        const key = getStaticObjectKey(entry.key);
        if (key === undefined) {
          continue;
        }
        const extracted = extractStaticValue(entry.value);
        if (extracted !== undefined) {
          result[key] = extracted;
        }
      }
    }
    return result;
  }

  if (typedValue.type === 'ObjectExpression' && typedValue.properties && typeof typedValue.properties === 'object') {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(typedValue.properties as Record<string, unknown>)) {
      const extracted = extractStaticValue(entryValue);
      if (extracted !== undefined) {
        result[entryKey] = extracted;
      }
    }
    return result;
  }

  return undefined;
}

function extractStaticObjectKeys(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    const isSingleAstWrapper =
      value.length === 1 &&
      value[0] !== null &&
      typeof value[0] === 'object' &&
      !Array.isArray(value[0]) &&
      'type' in (value[0] as Record<string, unknown>);

    if (isSingleAstWrapper) {
      return extractStaticObjectKeys(value[0]);
    }
    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const typedValue = value as Record<string, unknown>;
  if (typedValue.type === 'object' && Array.isArray(typedValue.entries)) {
    const keys: string[] = [];
    for (const entry of typedValue.entries as Array<Record<string, unknown>>) {
      if (entry.type !== 'pair' && entry.type !== 'conditionalPair') {
        continue;
      }
      const key = getStaticObjectKey(entry.key);
      if (key === undefined) {
        return null;
      }
      keys.push(key);
    }
    return keys;
  }

  if (typedValue.type === 'ObjectExpression' && typedValue.properties && typeof typedValue.properties === 'object') {
    return Object.keys(typedValue.properties as Record<string, unknown>);
  }

  return null;
}

function getObjectEntryValue(node: unknown, key: string): unknown {
  if (Array.isArray(node) && node.length === 1) {
    return getObjectEntryValue(node[0], key);
  }
  if (!node || typeof node !== 'object') {
    return undefined;
  }

  const typedNode = node as Record<string, unknown>;
  if (typedNode.type === 'object' && Array.isArray(typedNode.entries)) {
    for (const entry of typedNode.entries as Array<Record<string, unknown>>) {
      if (
        (entry.type === 'pair' || entry.type === 'conditionalPair')
        && getStaticObjectKey(entry.key) === key
      ) {
        return entry.value;
      }
    }
    return undefined;
  }

  if (typedNode.type === 'ObjectExpression' && typedNode.properties && typeof typedNode.properties === 'object') {
    return (typedNode.properties as Record<string, unknown>)[key];
  }

  return undefined;
}

function getFirstObjectEntryValue(node: unknown, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = getObjectEntryValue(node, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function getNodeObjectType(node: unknown): string | undefined {
  return node && typeof node === 'object'
    ? (node as Record<string, unknown>).type as string | undefined
    : undefined;
}

function unwrapSingleNodeArray(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function hasStaticAuthorizableIntent(value: unknown): boolean {
  const unwrapped = unwrapSingleNodeArray(value);
  if (!isPlainObject(unwrapped)) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(unwrapped, 'can_authorize')
    || Object.prototype.hasOwnProperty.call(unwrapped, 'authorizable')
  ) {
    return true;
  }

  return isPlainObject(unwrapped.authorizations)
    && (
      Object.prototype.hasOwnProperty.call(unwrapped.authorizations, 'can_authorize')
      || Object.prototype.hasOwnProperty.call(unwrapped.authorizations, 'authorizable')
    );
}

function getObjectNodeEntries(node: unknown): Array<Record<string, unknown>> {
  const unwrapped = unwrapSingleNodeArray(node);
  if (!unwrapped || typeof unwrapped !== 'object') {
    return [];
  }

  const typedNode = unwrapped as Record<string, unknown>;
  if (typedNode.type === 'object' && Array.isArray(typedNode.entries)) {
    return typedNode.entries as Array<Record<string, unknown>>;
  }

  if (typedNode.type === 'ObjectExpression' && typedNode.properties && typeof typedNode.properties === 'object') {
    return Object.entries(typedNode.properties as Record<string, unknown>).map(([entryKey, entryValue]) => ({
      type: 'pair',
      key: entryKey,
      value: entryValue
    }));
  }

  return [];
}

function getObjectEntryLocation(node: unknown, key: string): { line?: number; column?: number } {
  for (const entry of getObjectNodeEntries(node)) {
    if (
      (entry.type === 'pair' || entry.type === 'conditionalPair')
      && getStaticObjectKey(entry.key) === key
    ) {
      return {
        line: (entry as any)?.location?.start?.line ?? (entry.value as any)?.location?.start?.line,
        column: (entry as any)?.location?.start?.column ?? (entry.value as any)?.location?.start?.column
      };
    }
  }

  return {
    line: (unwrapSingleNodeArray(node) as any)?.location?.start?.line,
    column: (unwrapSingleNodeArray(node) as any)?.location?.start?.column
  };
}

function getFirstObjectEntryLocation(node: unknown, ...keys: string[]): { line?: number; column?: number } {
  for (const key of keys) {
    const location = getObjectEntryLocation(node, key);
    if (location.line !== undefined || location.column !== undefined) {
      return location;
    }
  }
  return {};
}

interface StaticStringEntry {
  value: string;
  line?: number;
  column?: number;
}

function extractStaticStringEntries(node: unknown): StaticStringEntry[] {
  if (
    node &&
    typeof node === 'object' &&
    (node as Record<string, unknown>).type === 'array' &&
    Array.isArray((node as Record<string, unknown>).items)
  ) {
    return ((node as Record<string, unknown>).items as unknown[])
      .flatMap(item => {
        const extracted = extractStaticValue(item);
        if (typeof extracted !== 'string' || extracted.trim().length === 0) {
          return [];
        }

        return [{
          value: extracted.trim(),
          line: (item as any)?.location?.start?.line,
          column: (item as any)?.location?.start?.column
        }];
      });
  }

  const extracted = extractStaticValue(node);
  if (!Array.isArray(extracted)) {
    return [];
  }

  return extracted
    .flatMap(value => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        return [];
      }

      return [{
        value: value.trim(),
        line: (node as any)?.location?.start?.line,
        column: (node as any)?.location?.start?.column
      }];
    });
}

function containsDynamicStaticValueReference(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(entry => containsDynamicStaticValueReference(entry));
  }

  if (!node || typeof node !== 'object') {
    return false;
  }

  const typedNode = node as Record<string, unknown>;
  const nodeType = typeof typedNode.type === 'string' ? typedNode.type : null;
  if (
    nodeType &&
    nodeType !== 'Literal' &&
    nodeType !== 'Text' &&
    nodeType !== 'array' &&
    nodeType !== 'object' &&
    nodeType !== 'pair' &&
    nodeType !== 'conditionalPair'
  ) {
    return true;
  }

  return Object.values(typedNode).some(value => containsDynamicStaticValueReference(value));
}

function formatVariableReference(
  ref: { identifier?: string; fields?: unknown[] } | undefined
): string {
  if (!ref?.identifier) {
    return '@<unknown>';
  }

  const suffix = (ref.fields ?? [])
    .map(field => {
      if (!field || typeof field !== 'object') {
        return '';
      }

      const typedField = field as Record<string, unknown>;
      if (typedField.type === 'field' && typeof typedField.value === 'string') {
        return `.${typedField.value}`;
      }
      if (typedField.type === 'numericField' && typeof typedField.value === 'number') {
        return `.${typedField.value}`;
      }
      if (typedField.type === 'arrayIndex' && typeof typedField.value === 'number') {
        return `[${typedField.value}]`;
      }
      if (typedField.type === 'bracketAccess') {
        return `[${JSON.stringify(typedField.value)}]`;
      }
      if (typedField.type === 'variableIndex' && typeof typedField.value === 'string') {
        return `[@${typedField.value}]`;
      }

      return '';
    })
    .join('');

  return `@${ref.identifier}${suffix}`;
}

function extractStaticVariableReference(value: unknown): string | undefined {
  const unwrapped = unwrapSingleNodeArray(value);
  if (!unwrapped || typeof unwrapped !== 'object') {
    return undefined;
  }

  const typedNode = unwrapped as Record<string, unknown>;
  if (typedNode.type !== 'VariableReference' || typeof typedNode.identifier !== 'string') {
    return undefined;
  }

  return formatVariableReference(typedNode as { identifier?: string; fields?: unknown[] });
}

function isStaticToolEntryReference(value: unknown): boolean {
  return extractStaticVariableReference(value) !== undefined;
}

function extractStaticBareToolExecutableReference(value: unknown): string | undefined {
  const explicit = extractStaticValue(getObjectEntryValue(value, 'mlld'));
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const reference = extractStaticVariableReference(value);
  if (!reference) {
    return undefined;
  }

  const trimmed = reference.trim();
  const bareName = trimmed.replace(/^@/, '');
  if (!bareName || /[.\[]/.test(bareName)) {
    return undefined;
  }

  return trimmed;
}

function isStaticInlineToolCatalogEntry(value: unknown): boolean {
  const unwrapped = unwrapSingleNodeArray(value);
  if (!unwrapped || typeof unwrapped !== 'object') {
    return false;
  }

  const nodeType = (unwrapped as Record<string, unknown>).type;
  return nodeType === 'object' || nodeType === 'ObjectExpression';
}

function extractStaticExecutableArgList(
  raw: unknown,
  paramNames: readonly string[],
  fieldName: 'controlArgs' | 'updateArgs' | 'exactPayloadArgs' | 'sourceArgs'
): {
  value?: string[];
  error?: string;
} {
  if (raw === undefined) {
    return {};
  }

  const value = extractStaticValue(raw);
  if (value === undefined) {
    return {};
  }

  if (!Array.isArray(value)) {
    return {
      error: `Executable ${fieldName} must be an array of parameter names`
    };
  }

  const knownParams = new Set(paramNames);
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return {
        error: `Executable ${fieldName} entries must be strings`
      };
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      return {
        error: `Executable ${fieldName} entries must be non-empty strings`
      };
    }
    if (!knownParams.has(trimmed)) {
      return {
        error: `Executable ${fieldName} entry '${trimmed}' is not a declared parameter`
      };
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return { value: normalized };
}

function extractStaticExecutableBoolean(
  raw: unknown,
  fieldName: 'correlateControlArgs'
): {
  value?: boolean;
  error?: string;
} {
  if (raw === undefined) {
    return {};
  }

  const value = extractStaticValue(raw);
  if (value === undefined) {
    return {};
  }

  if (typeof value !== 'boolean') {
    return {
      error: `Executable ${fieldName} must be a boolean`
    };
  }

  return { value };
}

function extractExecutableOutputRecordInfo(
  exeNode: Record<string, any>
): ExecutableOutputRecordInfo | undefined {
  const outputRecordNode = exeNode.values?.outputRecord?.[0];
  if (outputRecordNode?.type === 'ExeOutputRecord') {
    if (outputRecordNode.kind === 'static' && typeof outputRecordNode.name === 'string') {
      return {
        kind: 'static',
        name: outputRecordNode.name
      };
    }
    if (outputRecordNode.kind === 'dynamic') {
      return {
        kind: 'dynamic',
        ref: formatVariableReference(outputRecordNode.ref)
      };
    }
  }

  const rawOutputRecord = exeNode.raw?.outputRecord;
  if (typeof rawOutputRecord === 'string' && rawOutputRecord.trim().length > 0) {
    return {
      kind: 'static',
      name: rawOutputRecord.trim()
    };
  }

  return undefined;
}

function collectExecutableDefinitionDiagnostics(ast: MlldNode[]): AnalysisError[] {
  const errors: AnalysisError[] = [];
  const seen = new Set<string>();

  const pushError = (message: string, line?: number, column?: number): void => {
    const key = `${line ?? 0}:${column ?? 0}:${message}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    errors.push({ message, line, column });
  };

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'exe') {
      return;
    }

    const exeNode = node as any;
    const paramNames = Array.isArray(exeNode.values?.params)
      ? exeNode.values.params
          .filter((param: any) => param?.type === 'Parameter' && typeof param.name === 'string')
          .map((param: any) => param.name)
      : [];

    for (const entry of listWithClauseFields(exeNode.values?.withClause)) {
      if (EXECUTABLE_WITH_CLAUSE_KEYS.has(entry.key)) {
        continue;
      }
      const location = entry.location as Record<string, any> | undefined;
      pushError(
        `Unknown executable with-clause field '${entry.key}'`,
        location?.start?.line ?? exeNode.location?.start?.line,
        location?.start?.column ?? exeNode.location?.start?.column
      );
    }

    const metadataLine = exeNode.location?.start?.line;
    const metadataColumn = exeNode.location?.start?.column;
    const rawControlArgs = getWithClauseField(exeNode.values?.withClause, 'controlArgs');
    const rawUpdateArgs = getWithClauseField(exeNode.values?.withClause, 'updateArgs');
    const rawExactPayloadArgs = getWithClauseField(exeNode.values?.withClause, 'exactPayloadArgs');
    const rawSourceArgs = getWithClauseField(exeNode.values?.withClause, 'sourceArgs');
    const rawCorrelateControlArgs = getWithClauseField(exeNode.values?.withClause, 'correlateControlArgs');

    const controlArgs = extractStaticExecutableArgList(rawControlArgs, paramNames, 'controlArgs');
    const updateArgs = extractStaticExecutableArgList(rawUpdateArgs, paramNames, 'updateArgs');
    const exactPayloadArgs = extractStaticExecutableArgList(rawExactPayloadArgs, paramNames, 'exactPayloadArgs');
    const sourceArgs = extractStaticExecutableArgList(rawSourceArgs, paramNames, 'sourceArgs');
    const correlateControlArgs = extractStaticExecutableBoolean(rawCorrelateControlArgs, 'correlateControlArgs');

    for (const issue of [controlArgs.error, updateArgs.error, exactPayloadArgs.error, sourceArgs.error, correlateControlArgs.error]) {
      if (issue) {
        pushError(issue, metadataLine, metadataColumn);
      }
    }

    try {
      validateExecutableAuthorizationMetadata({
        controlArgs: controlArgs.value,
        updateArgs: updateArgs.value,
        exactPayloadArgs: exactPayloadArgs.value
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushError(message, metadataLine, metadataColumn);
    }
  });

  return errors;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toAnalysisError(issue: { message: string; location?: { line?: number; column?: number } }): AnalysisError {
  return {
    message: issue.message,
    line: issue.location?.line,
    column: issue.location?.column
  };
}

function recordInfoFromDefinition(definition: RecordDefinition): RecordInfo {
  return {
    name: definition.name,
    ...(definition.key ? { key: definition.key } : {}),
    validate: definition.validate,
    rootMode: definition.rootMode,
    display: definition.display.kind,
    ...(Array.isArray(definition.when) ? { whenCount: definition.when.length } : {}),
    fields: definition.fields.map(field => ({
      name: field.name,
      kind: field.kind,
      classification: field.classification,
      optional: field.optional,
      ...(field.valueType ? { valueType: field.valueType } : {})
    }))
  };
}

function shelfInfoFromDefinition(definition: ShelfDefinition): ShelfInfo {
  return {
    name: definition.name,
    slots: Object.values(definition.slots).map(slot => ({
      name: slot.name,
      record: slot.record,
      cardinality: slot.cardinality,
      optional: slot.optional,
      merge: slot.merge,
      ...(slot.from ? { from: slot.from } : {})
    }))
  };
}

function sessionTypeToSummary(type: SessionSlotType): string {
  const base = type.kind === 'record' ? `@${type.name}` : type.name;
  return `${base}${type.isArray ? '[]' : ''}${type.optional ? '?' : ''}`;
}

function sessionInfoFromDefinition(definition: SessionDefinition): SessionInfo {
  return {
    name: definition.canonicalName,
    declarationId: definition.id,
    slots: Object.values(definition.slots).map(slot => ({
      name: slot.name,
      kind: slot.type.kind,
      type: sessionTypeToSummary(slot.type),
      optional: slot.type.optional,
      isArray: slot.type.isArray
    }))
  };
}

function extractRecordsAndDiagnostics(
  ast: MlldNode[],
  filePath: string
): {
  records: RecordInfo[];
  errors: AnalysisError[];
  definitions: Map<string, RecordDefinition>;
  declaredNames: Set<string>;
} {
  const records: RecordInfo[] = [];
  const errors: AnalysisError[] = [];
  const definitions = new Map<string, RecordDefinition>();
  const declaredNames = new Set<string>();

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'record') {
      return;
    }

    const directive = node as any;
    const identifierNode = directive.values?.identifier?.[0];
    const name =
      identifierNode?.type === 'VariableReference'
        ? identifierNode.identifier
        : directive.raw?.identifier;

    if (typeof name === 'string' && name.trim().length > 0) {
      declaredNames.add(name.trim());
    }

    const buildResult = buildRecordDefinitionFromDirective(directive, { filePath });
    if (buildResult.definition) {
      records.push(recordInfoFromDefinition(buildResult.definition));
      definitions.set(buildResult.definition.name, buildResult.definition);
    } else {
      errors.push(...buildResult.issues.map(toAnalysisError));
    }
  });

  return { records, errors, definitions, declaredNames };
}

function extractShelvesAndDiagnostics(
  ast: MlldNode[],
  filePath: string,
  knownRecords: ReadonlyMap<string, Pick<RecordDefinition, 'key'> | RecordDefinition>
): {
  shelves: ShelfInfo[];
  errors: AnalysisError[];
  definitions: Map<string, ShelfDefinition>;
} {
  const shelves: ShelfInfo[] = [];
  const errors: AnalysisError[] = [];
  const definitions = new Map<string, ShelfDefinition>();

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'shelf') {
      return;
    }

    const directive = node as any;
    const buildResult = buildShelfDefinitionFromDirective(directive, {
      filePath,
      records: knownRecords
    });
    if (buildResult.definition) {
      shelves.push(shelfInfoFromDefinition(buildResult.definition));
      definitions.set(buildResult.definition.name, buildResult.definition);
    } else {
      errors.push(...buildResult.issues.map(toAnalysisError));
    }
  });

  return { shelves, errors, definitions };
}

function extractSessionsAndDiagnostics(
  ast: MlldNode[],
  filePath: string,
  knownRecords: ReadonlyMap<string, RecordDefinition>
): {
  sessions: SessionInfo[];
  errors: AnalysisError[];
  definitions: Map<string, SessionDefinition>;
} {
  const sessions: SessionInfo[] = [];
  const errors: AnalysisError[] = [];
  const definitions = new Map<string, SessionDefinition>();

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'var' || (node as any).meta?.isSessionLabel !== true) {
      return;
    }

    const directive = node as any;
    const buildResult = buildSessionDefinitionFromDirective(directive, {
      filePath,
      resolveRecord: name => knownRecords.get(name)
    });
    if (buildResult.definition) {
      sessions.push(sessionInfoFromDefinition(buildResult.definition));
      definitions.set(buildResult.definition.canonicalName, buildResult.definition);
    } else {
      errors.push(...buildResult.issues.map(toAnalysisError));
    }
  });

  return { sessions, errors, definitions };
}

function collectExecutableOutputRecordDiagnostics(
  ast: MlldNode[],
  recordDefinitions: ReadonlyMap<string, RecordDefinition>,
  declaredRecordNames: ReadonlySet<string>
): AnalysisError[] {
  const errors: AnalysisError[] = [];

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'exe') {
      return;
    }

    const exeNode = node as any;
    const outputRecord = extractExecutableOutputRecordInfo(exeNode);
    if (!outputRecord || outputRecord.kind !== 'static' || !outputRecord.name) {
      return;
    }

    if (recordDefinitions.has(outputRecord.name) || declaredRecordNames.has(outputRecord.name)) {
      return;
    }

    errors.push({
      message: `Executable '@${exeNode.raw?.identifier ?? outputRecord.name}' references unknown record '@${outputRecord.name}'`,
      line: exeNode.location?.start?.line,
      column: exeNode.location?.start?.column
    });
  });

  return errors;
}

function collectCastDiagnostics(
  ast: MlldNode[],
  recordDefinitions: ReadonlyMap<string, RecordDefinition>,
  declaredRecordNames: ReadonlySet<string>
): AnalysisError[] {
  const errors: AnalysisError[] = [];
  const declaredNames = new Set<string>();

  walkAST(ast, (node: any) => {
    if (node.type === 'Directive' && (node.kind === 'var' || node.kind === 'exe' || node.kind === 'record' || node.kind === 'shelf')) {
      const identifierNode = node.values?.identifier?.[0];
      if (identifierNode?.identifier) {
        declaredNames.add(identifierNode.identifier);
      }
    }

    if (node.type === 'Directive' && node.kind === 'import') {
      if (Array.isArray(node.values?.imports)) {
        for (const imported of node.values.imports) {
          if (typeof imported?.identifier === 'string') {
            declaredNames.add(imported.identifier);
          }
          if (typeof imported?.alias === 'string') {
            declaredNames.add(imported.alias);
          }
        }
      }
    }

    if (node.type === 'LetAssignment' && typeof node.identifier === 'string') {
      declaredNames.add(node.identifier);
    }
  });

  walkAST(ast, node => {
    if (node.type !== 'ExecInvocation') {
      return;
    }

    const invocationName = readExecInvocationName(node);
    if (invocationName !== 'cast') {
      return;
    }

    const args = readExecInvocationArgs(node);
    if (args.length < 2) {
      return;
    }

    const recordArg = args[1];
    const staticRecordName =
      recordArg &&
      typeof recordArg === 'object' &&
      (recordArg as Record<string, unknown>).type === 'VariableReference' &&
      typeof (recordArg as Record<string, unknown>).identifier === 'string' &&
      (!Array.isArray((recordArg as Record<string, unknown>).fields)
        || ((recordArg as Record<string, unknown>).fields as unknown[]).length === 0)
        ? (() => {
            const identifier = ((recordArg as Record<string, unknown>).identifier as string).trim();
            if (declaredNames.has(identifier) && !recordDefinitions.has(identifier) && !declaredRecordNames.has(identifier)) {
              return undefined;
            }
            return identifier;
          })()
        : (() => {
            const extracted = extractStaticValue(recordArg);
            return typeof extracted === 'string'
              ? extracted.trim().replace(/^@/, '')
              : undefined;
          })();

    if (!staticRecordName) {
      return;
    }

    if (recordDefinitions.has(staticRecordName) || declaredRecordNames.has(staticRecordName)) {
      return;
    }

    errors.push({
      message: `Builtin @cast references unknown record '@${staticRecordName}'`,
      line: (node as any).location?.start?.line,
      column: (node as any).location?.start?.column
    });
  });

  return errors;
}

/**
 * Collect the set of exe names that are statically wired as toolbridge
 * wrappers through `var tools @name = { foo: { mlld: @exe } }` collections.
 * These are the exes whose strict tool-return channel (`->` / `=->`) will
 * actually be consumed by the runtime (see exec-invocation `isToolbridgeWrapper`).
 */
function collectSurfacedToolExeNames(ast: MlldNode[]): Set<string> {
  const surfaced = new Set<string>();

  walkAST(ast, node => {
    const directiveNode = node as any;
    if (
      directiveNode.type !== 'Directive' ||
      directiveNode.kind !== 'var' ||
      directiveNode.meta?.isToolsCollection !== true
    ) {
      return;
    }

    const toolObjectNode = Array.isArray(directiveNode.values?.value)
      ? directiveNode.values.value[0]
      : undefined;
    if (
      !toolObjectNode ||
      typeof toolObjectNode !== 'object' ||
      (toolObjectNode as any).type !== 'object'
    ) {
      return;
    }

    const entries = (toolObjectNode as any).entries as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(entries)) {
      return;
    }

    for (const entry of entries) {
      if ((entry.type !== 'pair' && entry.type !== 'conditionalPair')) {
        continue;
      }

      const mlldValue = extractStaticBareToolExecutableReference(entry.value);
      if (typeof mlldValue !== 'string') {
        continue;
      }
      const execName = mlldValue.trim().replace(/^@/, '');
      if (execName) {
        surfaced.add(execName);
      }
    }
  });

  return surfaced;
}

/**
 * Warn on statically suspicious uses of thin-arrow exe return channels
 * (`->` writes tool-only results; `=->` writes both canonical and tool
 * results). Three checks:
 *
 * 1. `thin-arrow-exe-not-surfaced` — an exe emits a tool-return channel
 *    but is never wired as a toolbridge wrapper via `var tools`, so the
 *    runtime will never select the tool slot.
 * 2. `strict-tool-return-without-record` — an exe enters strict tool-return
 *    mode but declares no static `=> record` coercion, so tool output
 *    bypasses schema-based trust-tier classification.
 * 3. `mixed-tool-return-for-scope` — an exe has tool-return sites both
 *    inside and outside a `for` body, so the empty-result resolution to
 *    `null`/`[]` (which only fires when every tool reach is inside a
 *    `for` body) silently will not apply.
 */
function detectThinArrowReturnAntiPatterns(
  ast: MlldNode[],
  surfacedExeNames: ReadonlySet<string>
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  walkAST(ast, node => {
    if (node.type !== 'Directive' || (node as any).kind !== 'exe') {
      return;
    }

    const exeNode = node as any;
    const exeName: string | undefined = exeNode.values?.identifier?.[0]?.identifier;
    if (!exeName) {
      return;
    }

    const analysis: ReturnChannelAnalysis = analyzeReturnChannels(exeNode.values);
    if (!analysis.strict) {
      return;
    }

    const firstToolSite = analysis.toolSites[0];
    const line = firstToolSite?.location?.line ?? exeNode.location?.start?.line;
    const column = firstToolSite?.location?.column ?? exeNode.location?.start?.column;

    if (!surfacedExeNames.has(exeName)) {
      warnings.push({
        code: 'thin-arrow-exe-not-surfaced',
        message: `Executable @${exeName}() uses a tool-return channel (-> or =->) but is not statically wired as a toolbridge wrapper, so the runtime will never read the tool slot.`,
        line,
        column,
        suggestion: `Surface @${exeName} through a 'var tools' collection (e.g. { ${exeName}: { mlld: @${exeName}, ... } }), drop the thin-arrow returns in favor of '=>', or add "validate.suppressWarnings": ["thin-arrow-exe-not-surfaced"] if this exe is wrapped by an external caller.`
      });
    }

    const outputRecord = extractExecutableOutputRecordInfo(exeNode);
    if (!outputRecord || (outputRecord.kind === 'static' && !outputRecord.name)) {
      warnings.push({
        code: 'strict-tool-return-without-record',
        message: `Executable @${exeName}() emits tool-return channels but has no static '=> record @schema' coercion, so tool output bypasses field-level trust classification.`,
        line,
        column,
        suggestion: `Declare an output record (e.g. 'exe @${exeName}(...) = ... => record @${exeName}Result') so strict tool returns carry fact/data labels.`
      });
    }

    const toolSitesInFor = analysis.toolSites.filter(site => site.inForBody);
    const toolSitesOutsideFor = analysis.toolSites.filter(site => !site.inForBody);
    if (toolSitesInFor.length > 0 && toolSitesOutsideFor.length > 0) {
      const mixedSite = toolSitesOutsideFor[0];
      warnings.push({
        code: 'mixed-tool-return-for-scope',
        message: `Executable @${exeName}() has tool-return channels both inside and outside a 'for' body. The runtime only resolves empty strict-mode tool results to null/[] when every tool reach is inside a 'for' body, so that fallback will not apply here.`,
        line: mixedSite?.location?.line ?? line,
        column: mixedSite?.location?.column ?? column,
        suggestion: `Move every tool-return ('->' or '=->') inside the 'for' body, or drop the for-scoped tool returns in favor of canonical '=>' returns.`
      });
    }
  });

  return warnings;
}

function extractDirectShelfSlotRef(
  node: unknown,
  filePath: string
): { ref: ShelfScopeSlotRef; location?: ReturnType<typeof astLocationToSourceLocation> } | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }

  const typedNode = node as VariableReferenceNode;
  if (typedNode.type !== 'VariableReference' || typeof typedNode.identifier !== 'string') {
    return undefined;
  }

  if (!Array.isArray(typedNode.fields) || typedNode.fields.length !== 1) {
    return undefined;
  }

  const [field] = typedNode.fields;
  if (field?.type !== 'field' || typeof field.value !== 'string') {
    return undefined;
  }

  return {
    ref: {
      shelfName: typedNode.identifier,
      slotName: field.value
    },
    location: astLocationToSourceLocation(typedNode.location, filePath)
  };
}

function isShelfScopeValueReference(node: unknown): node is VariableReferenceNode {
  return Boolean(
    node &&
    typeof node === 'object' &&
    (node as VariableReferenceNode).type === 'VariableReference'
  );
}

function collectBoxShelfScopeDiagnostics(
  ast: MlldNode[],
  filePath: string,
  shelfDefinitions: ReadonlyMap<string, ShelfDefinition>
): AnalysisError[] {
  const errors: AnalysisError[] = [];

  const push = (message: string, location?: { line?: number; column?: number }): void => {
    errors.push({
      message,
      line: location?.line,
      column: location?.column
    });
  };

  const collectBindingsFromEntries = (
    entries: unknown,
    label: 'read' | 'write'
  ): {
    bindings: ValidatableShelfScopeBinding[];
    readAliases: Record<string, true>;
  } => {
    const bindings: ValidatableShelfScopeBinding[] = [];
    const readAliases: Record<string, true> = {};
    const arrayEntries =
      isPlainObject(entries) && entries.type === 'array' && Array.isArray(entries.items)
        ? entries.items
        : entries;

    if (arrayEntries === undefined) {
      return { bindings, readAliases };
    }

    if (!isPlainObject(arrayEntries) && !Array.isArray(arrayEntries)) {
      push(
        `box.shelf.${label} must be an array`,
        astLocationToSourceLocation((arrayEntries as any)?.location, filePath)
      );
      return { bindings, readAliases };
    }

    if (!Array.isArray(arrayEntries)) {
      push(
        `box.shelf.${label} must be an array`,
        astLocationToSourceLocation((arrayEntries as any)?.location, filePath)
      );
      return { bindings, readAliases };
    }

    for (const entry of arrayEntries) {
      if (isPlainObject(entry) && entry.type === 'aliasedValue') {
        const alias = typeof entry.alias === 'string' ? entry.alias.trim() : '';
        const directRef = extractDirectShelfSlotRef(entry.value, filePath);

        if (alias.length > 0 && directRef) {
          bindings.push({
            ref: directRef.ref,
            alias,
            location: directRef.location
          });
          continue;
        }

        if (label === 'read' && alias.length > 0) {
          readAliases[alias] = true;
          continue;
        }

        if (label === 'write' && alias.length > 0 && isShelfScopeValueReference(entry.value)) {
          continue;
        }

        if (label === 'write') {
          const location = astLocationToSourceLocation((entry as any).location, filePath);
          push('box.shelf.write aliases must resolve to shelf slot references', location);
        }
        continue;
      }

      if (isPlainObject(entry) && entry.type === 'object') {
        const aliasNode = getObjectEntryValue(entry, 'alias');
        const valueNode = getObjectEntryValue(entry, 'value');
        const alias = extractStaticValue(aliasNode);
        const directRef = extractDirectShelfSlotRef(valueNode, filePath);

        if (typeof alias === 'string' && alias.trim().length > 0) {
          if (directRef) {
            bindings.push({
              ref: directRef.ref,
              alias: alias.trim(),
              location: directRef.location
            });
            continue;
          }

          if (label === 'read') {
            readAliases[alias.trim()] = true;
            continue;
          }

          if (label === 'write' && isShelfScopeValueReference(valueNode)) {
            continue;
          }
        }

        if (
          label === 'write' &&
          valueNode &&
          !extractDirectShelfSlotRef(valueNode, filePath) &&
          !isShelfScopeValueReference(valueNode)
        ) {
          const location = astLocationToSourceLocation((entry as any).location, filePath);
          push('box.shelf.write aliases must resolve to shelf slot references', location);
        }
        continue;
      }

      const directRef = extractDirectShelfSlotRef(entry, filePath);
      if (directRef) {
        bindings.push({
          ref: directRef.ref,
          location: directRef.location
        });
        continue;
      }

      if (isPlainObject(entry) && entry.type === 'VariableReference') {
        continue;
      }

      push(
        `box.shelf.${label} entries must be shelf slot references${label === 'read' ? ' or aliased values' : ''}`,
        astLocationToSourceLocation((entry as any)?.location, filePath)
      );
    }

    return { bindings, readAliases };
  };

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'box') {
      return;
    }

    const boxNode = node as BoxDirectiveNode;
    const configNode = Array.isArray(boxNode.values?.config) ? boxNode.values.config[0] : undefined;
    const shelfNode = getObjectEntryValue(configNode, 'shelf');
    if (shelfNode === undefined) {
      return;
    }

    if (!isPlainObject(shelfNode) || shelfNode.type !== 'object') {
      push(
        'box.shelf must be an object',
        astLocationToSourceLocation((shelfNode as any)?.location, filePath)
      );
      return;
    }

    const readNode = getObjectEntryValue(shelfNode, 'read');
    const writeNode = getObjectEntryValue(shelfNode, 'write');
    const readResult = collectBindingsFromEntries(readNode, 'read');
    const writeResult = collectBindingsFromEntries(writeNode, 'write');

    errors.push(
      ...validateShelfScopeBindingTargets(
        [...readResult.bindings, ...writeResult.bindings],
        shelfDefinitions
      ).map(toAnalysisError),
      ...validateShelfScopeBindingConflicts(
        readResult.bindings,
        writeResult.bindings,
        readResult.readAliases
      ).map(toAnalysisError)
    );
  });

  return errors;
}

function extractStaticSessionReferenceName(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const isSingleAstWrapper =
      value.length === 1 &&
      value[0] !== null &&
      typeof value[0] === 'object' &&
      !Array.isArray(value[0]) &&
      'type' in (value[0] as Record<string, unknown>);

    if (isSingleAstWrapper) {
      return extractStaticSessionReferenceName(value[0]);
    }
    return undefined;
  }

  if (!isPlainObject(value)) {
    return undefined;
  }

  const typedValue = value as Record<string, unknown>;
  if (
    typedValue.type === 'VariableReference' &&
    typeof typedValue.identifier === 'string' &&
    (!Array.isArray(typedValue.fields) || typedValue.fields.length === 0)
  ) {
    const trimmed = typedValue.identifier.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  const extracted = extractStaticValue(value);
  if (typeof extracted === 'string' && extracted.startsWith('@')) {
    const trimmed = extracted.slice(1).trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

function extractExecutableDirectiveMap(ast: MlldNode[]): Map<string, ExecutableDirectiveNode> {
  const definitions = new Map<string, ExecutableDirectiveNode>();

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'exe') {
      return;
    }

    const executableNode = node as ExecutableDirectiveNode & {
      values?: { identifier?: Array<{ identifier?: string }> };
      raw?: { identifier?: string };
    };
    const identifierNode = executableNode.values?.identifier?.[0];
    const name =
      typeof identifierNode?.identifier === 'string' && identifierNode.identifier.trim().length > 0
        ? identifierNode.identifier.trim()
        : executableNode.raw?.identifier?.trim();
    if (!name) {
      return;
    }
    definitions.set(name, executableNode);
  });

  return definitions;
}

function isStaticallyRejectedSessionUpdater(directive: ExecutableDirectiveNode): boolean {
  const typedDirective = directive as ExecutableDirectiveNode & {
    subtype?: string;
    values?: {
      lang?: Array<{ content?: string }>;
      securityLabels?: string[];
    };
    meta?: {
      language?: string;
      securityLabels?: string[];
    };
  };

  const labels =
    typedDirective.values?.securityLabels ??
    typedDirective.meta?.securityLabels ??
    [];
  if (Array.isArray(labels) && labels.includes('llm')) {
    return true;
  }

  if (typedDirective.subtype === 'exeCode') {
    const language =
      typedDirective.values?.lang?.[0]?.content ??
      typedDirective.meta?.language;
    const normalizedLanguage =
      typeof language === 'string'
        ? language.trim().toLowerCase()
        : '';
    if (
      normalizedLanguage === 'js' ||
      normalizedLanguage === 'javascript' ||
      normalizedLanguage === 'node' ||
      normalizedLanguage === 'nodejs'
    ) {
      return false;
    }
  }

  if (typedDirective.subtype === 'exeData') {
    return false;
  }

  return typedDirective.subtype === 'exeCommand'
    || typedDirective.subtype === 'exeTemplate'
    || typedDirective.subtype === 'exeTemplateFile'
    || typedDirective.subtype === 'exeResolver'
    || typedDirective.subtype === 'exeProse'
    || typedDirective.subtype === 'exeProseFile'
    || typedDirective.subtype === 'exeProseTemplate';
}

function collectSessionScopedRuntimeDiagnostics(
  ast: MlldNode[],
  filePath: string,
  sessionDefinitions: ReadonlyMap<string, SessionDefinition>
): AnalysisError[] {
  const errors: AnalysisError[] = [];
  const seen = new Set<string>();
  const executableDirectives = extractExecutableDirectiveMap(ast);

  const push = (message: string, location?: { line?: number; column?: number }): void => {
    const key = `${location?.line ?? 0}:${location?.column ?? 0}:${message}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    errors.push({
      message,
      line: location?.line,
      column: location?.column
    });
  };

  const resolveStaticSessionDefinition = (
    raw: unknown,
    location?: { line?: number; column?: number }
  ): SessionDefinition | undefined => {
    if (raw === undefined) {
      return undefined;
    }
    const sessionName = extractStaticSessionReferenceName(raw);
    if (!sessionName) {
      return undefined;
    }
    const definition = sessionDefinitions.get(sessionName);
    if (!definition) {
      push(`session must reference a declared session schema; unknown session '@${sessionName}'`, location);
      return undefined;
    }
    return definition;
  };

  const validateStaticSeedKeys = (
    rawSeed: unknown,
    sessionDefinition: SessionDefinition | undefined
  ): void => {
    if (!sessionDefinition || rawSeed === undefined) {
      return;
    }

    const seedInputs = Array.isArray(rawSeed) ? rawSeed : [rawSeed];
    for (const seedInput of seedInputs) {
      const node =
        Array.isArray(seedInput) &&
        seedInput.length === 1 &&
        seedInput[0] &&
        typeof seedInput[0] === 'object'
          ? seedInput[0]
          : seedInput;

      if (!isPlainObject(node) || node.type !== 'object' || !Array.isArray(node.entries)) {
        continue;
      }

      for (const entry of node.entries as Array<Record<string, unknown>>) {
        if (entry.type !== 'pair' && entry.type !== 'conditionalPair') {
          continue;
        }
        const key = getStaticObjectKey(entry.key);
        if (!key || sessionDefinition.slots[key]) {
          continue;
        }
        const location = astLocationToSourceLocation((entry as any).location, filePath);
        push(
          `Seed input references unknown session slot '${key}' on @${sessionDefinition.canonicalName}.`,
          location
        );
      }
    }
  };

  const validateOverride = (rawOverride: unknown): boolean => {
    if (rawOverride === undefined) {
      return false;
    }

    const staticValue = extractStaticValue(rawOverride);
    if (staticValue === undefined) {
      return false;
    }

    if (staticValue === null || staticValue === false) {
      return false;
    }

    if (typeof staticValue === 'string' && staticValue.trim() === 'session') {
      return true;
    }

    const location = astLocationToSourceLocation((rawOverride as any)?.location, filePath);
    push(
      'override must be the string "session" when overriding a wrapper-attached session.',
      location
    );
    return false;
  };

  walkAST(ast, node => {
    if (node.type === 'Directive' && node.kind === 'exe') {
      const executableNode = node as ExecutableDirectiveNode;
      const sessionNode = getWithClauseField(executableNode.values?.withClause, 'session');
      const seedNode = getWithClauseField(executableNode.values?.withClause, 'seed');
      const sessionDefinition = resolveStaticSessionDefinition(
        sessionNode,
        astLocationToSourceLocation(executableNode.location, filePath)
      );
      if (seedNode !== undefined && !sessionDefinition) {
        push(
          'seed requires an attached session',
          astLocationToSourceLocation(executableNode.location, filePath)
        );
      }
      validateStaticSeedKeys(seedNode, sessionDefinition);
      return;
    }

    if (node.type !== 'ExecInvocation') {
      return;
    }

    const invocation = node as any;
    const invocationLocation = astLocationToSourceLocation(invocation.location, filePath);
    const invocationSessionNode = getWithClauseField(invocation.withClause, 'session');
    const invocationSeedNode = getWithClauseField(invocation.withClause, 'seed');
    const overrideSession = validateOverride(
      getWithClauseField(invocation.withClause, 'override')
    );
    const invocationSession = resolveStaticSessionDefinition(invocationSessionNode, invocationLocation);

    const executableName =
      typeof invocation.commandRef?.name === 'string' && invocation.commandRef.name.trim().length > 0
        ? invocation.commandRef.name.trim()
        : undefined;
    const executableDirective =
      executableName !== undefined
        ? executableDirectives.get(executableName)
        : undefined;
    const wrapperSession = executableDirective
      ? resolveStaticSessionDefinition(
          getWithClauseField(executableDirective.values?.withClause, 'session'),
          astLocationToSourceLocation(executableDirective.location, filePath)
        )
      : undefined;

    if (
      wrapperSession &&
      invocationSession &&
      wrapperSession.id !== invocationSession.id &&
      !overrideSession
    ) {
      push(
        `session key conflicts; use override: 'session' to replace`,
        invocationLocation
      );
    }

    const effectiveSession =
      invocationSession && (!wrapperSession || overrideSession || wrapperSession.id === invocationSession.id)
        ? invocationSession
        : wrapperSession;

    if (invocationSeedNode !== undefined && !effectiveSession) {
      push('seed requires an attached session', invocationLocation);
    }
    validateStaticSeedKeys(invocationSeedNode, effectiveSession);

    if (invocation.commandRef?.name === 'update' && Array.isArray(invocation.commandRef?.args)) {
      const objectIdentifier = invocation.commandRef?.objectReference?.identifier;
      if (typeof objectIdentifier === 'string' && sessionDefinitions.has(objectIdentifier)) {
        const updater = invocation.commandRef.args[1];
        const updaterName = extractStaticSessionReferenceName(updater);
        if (updaterName) {
          const updaterDirective = executableDirectives.get(updaterName);
          if (updaterDirective && isStaticallyRejectedSessionUpdater(updaterDirective)) {
            push(
              '@session.update requires a pure local executable (js, node, or mlld data/when executable).',
              astLocationToSourceLocation((updater as any)?.location, filePath) ?? invocationLocation
            );
          }
        }
      }
    }
  });

  return errors;
}

function extractPolicies(ast: MlldNode[]): PolicyInfo[] {
  const policies: PolicyInfo[] = [];

  walkAST(ast, (node) => {
    if (node.type !== 'Directive' || node.kind !== 'policy') {
      return;
    }

    const policyNode = node as any;
    const name = extractText(policyNode.values?.name) || policyNode.raw?.name;
    if (!name) {
      return;
    }

    const info: PolicyInfo = { name };
    const expr = policyNode.values?.expr;

    if (expr?.type === 'union' && Array.isArray(expr.args)) {
      const refs = expr.args
        .map((arg: any) => (typeof arg?.name === 'string' ? arg.name : ''))
        .filter((ref: string) => ref.length > 0);
      if (refs.length > 0) {
        info.refs = refs;
      }
      policies.push(info);
      return;
    }

    const rulesNode = getObjectEntryValue(getObjectEntryValue(expr, 'defaults'), 'rules');
    if (rulesNode && typeof rulesNode === 'object' && (rulesNode as any).type === 'array' && Array.isArray((rulesNode as any).items)) {
      const rules = (rulesNode as any).items
        .map((item: unknown) => extractStaticValue(item))
        .filter((rule: unknown): rule is string => typeof rule === 'string' && rule.trim().length > 0);
      if (rules.length > 0) {
        info.rules = rules;
      }
    }

    const operationsNode = getObjectEntryValue(expr, 'operations');
    if (operationsNode && typeof operationsNode === 'object' && (operationsNode as any).type === 'object' && Array.isArray((operationsNode as any).entries)) {
      const normalizedOperations: Record<string, string[]> = {};
      for (const entry of (operationsNode as any).entries as Array<Record<string, unknown>>) {
        if ((entry.type !== 'pair' && entry.type !== 'conditionalPair') || typeof entry.key !== 'string') {
          continue;
        }

        const extractedLabels = extractStaticValue(entry.value);
        if (!Array.isArray(extractedLabels)) {
          continue;
        }

        const labels = extractedLabels.filter(
          (label): label is string => typeof label === 'string' && label.trim().length > 0
        );
        if (labels.length > 0) {
          normalizedOperations[entry.key] = labels;
        }
      }

      if (Object.keys(normalizedOperations).length > 0) {
        info.operations = normalizedOperations;
      }
    }

    const lockedValue = extractStaticValue(getObjectEntryValue(expr, 'locked'));
    info.locked = lockedValue === true;

    policies.push(info);
  });

  return policies;
}

function parseContextPaths(rawContext: unknown): string[] | undefined {
  if (Array.isArray(rawContext)) {
    const values = rawContext
      .flatMap(value => typeof value === 'string' ? value.split(',') : [])
      .map(value => value.trim())
      .filter(value => value.length > 0);
    return values.length > 0 ? values : undefined;
  }

  if (typeof rawContext !== 'string') {
    return undefined;
  }

  const values = rawContext
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);

  return values.length > 0 ? values : undefined;
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function findClosestBuiltinPolicyRule(ruleName: string): string | null {
  let bestRule: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const builtinRule of BUILTIN_POLICY_RULES) {
    const distance = levenshteinDistance(ruleName, builtinRule);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRule = builtinRule;
    }
  }

  return bestDistance <= 6 ? bestRule : null;
}

function collectDeclaredPolicyOperationCategories(
  policies: readonly PolicyInfo[]
): Set<string> {
  const categories = new Set<string>();
  for (const policy of policies) {
    if (!policy.operations) {
      continue;
    }
    for (const category of Object.keys(policy.operations)) {
      const normalized = category.trim();
      if (normalized.length > 0) {
        categories.add(normalized);
      }
    }
  }
  return categories;
}

function collectKnownPolicyOperationTargets(
  contextExecutables: ReadonlyMap<string, ValidationContextExecutable>,
  declaredCategories: ReadonlySet<string>
): Set<string> {
  const targets = new Set<string>();

  for (const category of declaredCategories) {
    targets.add(category);
  }

  for (const executable of contextExecutables.values()) {
    for (const label of executable.labels) {
      const normalized = label.trim();
      if (normalized.length > 0) {
        targets.add(normalized);
      }
    }

    const namedRef = normalizeNamedOperationRef(executable.name);
    if (namedRef) {
      targets.add(namedRef);
    }
  }

  for (const builtinTarget of BUILTIN_POLICY_OPERATION_TARGETS) {
    targets.add(builtinTarget);
  }

  return targets;
}

function hasKnownPolicyTargetMatch(
  target: string,
  knownTargets: ReadonlySet<string>
): boolean {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return false;
  }

  const normalizedTarget = normalizeNamedOperationRef(trimmedTarget) ?? trimmedTarget;
  for (const knownTarget of knownTargets) {
    if (
      matchesLabelPattern(normalizedTarget, knownTarget)
      || matchesLabelPattern(knownTarget, normalizedTarget)
    ) {
      return true;
    }
  }

  return false;
}

function findClosestKnownPolicyTarget(
  target: string,
  knownTargets: ReadonlySet<string>
): string | null {
  let bestTarget: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const knownTarget of knownTargets) {
    const distance = levenshteinDistance(target, knownTarget);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTarget = knownTarget;
    }
  }

  return bestDistance <= 6 ? bestTarget : null;
}

function findClosestKnownToolName(
  toolName: string,
  contextExecutables: ReadonlyMap<string, ValidationContextExecutable>
): string | null {
  let bestToolName: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of contextExecutables.keys()) {
    const distance = levenshteinDistance(toolName, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestToolName = candidate;
    }
  }

  return bestDistance <= 6 ? bestToolName : null;
}

function detectUnknownPolicyRuleWarnings(ast: MlldNode[]): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  walkAST(ast, (node) => {
    if (node.type !== 'Directive' || node.kind !== 'policy') {
      return;
    }

    const policyNode = node as any;
    const rulesNode = getObjectEntryValue(getObjectEntryValue(policyNode.values?.expr, 'defaults'), 'rules');
    if (!rulesNode || typeof rulesNode !== 'object' || (rulesNode as any).type !== 'array' || !Array.isArray((rulesNode as any).items)) {
      return;
    }

    for (const item of (rulesNode as any).items as unknown[]) {
      const ruleName = extractStaticValue(item);
      if (typeof ruleName !== 'string' || isBuiltinPolicyRuleName(ruleName)) {
        continue;
      }

      const closestRule = findClosestBuiltinPolicyRule(ruleName);
      warnings.push({
        code: 'unknown-policy-rule',
        message: closestRule
          ? `Unknown built-in rule "${ruleName}" — did you mean "${closestRule}"?`
          : `Unknown built-in rule "${ruleName}".`,
        line: (item as any)?.location?.start?.line,
        column: (item as any)?.location?.start?.column,
        suggestion: closestRule
          ? `Replace "${ruleName}" with "${closestRule}" if that was the intended built-in policy rule.`
          : `Use one of: ${BUILTIN_POLICY_RULES.join(', ')}`
      });
    }
  });

  return warnings;
}

function detectPrivilegedWildcardAllowWarnings(ast: MlldNode[]): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  walkAST(ast, (node) => {
    if (node.type !== 'Directive' || node.kind !== 'guard') {
      return;
    }

    const guardNode = node as GuardDirectiveNode;
    if (guardNode.meta?.privileged !== true) {
      return;
    }

    const guardName = extractText(guardNode.values?.name) || guardNode.raw?.name || 'anonymous guard';
    const guardBlock = guardNode.values?.guard?.[0];
    if (!guardBlock || !Array.isArray(guardBlock.rules)) {
      return;
    }

    for (const rule of guardBlock.rules as Array<Record<string, unknown>>) {
      if (rule.type !== 'GuardRule' || rule.isWildcard !== true || (rule.action as any)?.decision !== 'allow') {
        continue;
      }

      warnings.push({
        code: 'privileged-wildcard-allow',
        message: `Privileged guard ${guardName} has unconditional allow — this overrides policy for all matching operations.`,
        line: (rule as any)?.location?.start?.line,
        column: (rule as any)?.location?.start?.column,
        suggestion: 'Replace * => allow with a narrower condition or an explicit deny fallback.'
      });
    }
  });

  return warnings;
}

function detectUnreachableGuardArmWarnings(ast: MlldNode[], sourceText: string): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  walkAST(ast, (node) => {
    if (node.type !== 'Directive' || node.kind !== 'guard') {
      return;
    }

    const guardNode = node as GuardDirectiveNode;
    const guardName = extractText(guardNode.values?.name) || guardNode.raw?.name || 'anonymous guard';
    const guardBlock = guardNode.values?.guard?.[0];
    if (!guardBlock || !Array.isArray(guardBlock.rules)) {
      return;
    }

    const seenConjunctions: Array<{ line?: number; conjuncts: Set<string> }> = [];
    let wildcardLine: number | undefined;

    for (const entry of guardBlock.rules as Array<Record<string, unknown>>) {
      if (entry.type !== 'GuardRule') {
        continue;
      }

      const line = (entry as any)?.location?.start?.line as number | undefined;
      const column = (entry as any)?.location?.start?.column as number | undefined;

      if (wildcardLine !== undefined) {
        warnings.push({
          code: 'guard-unreachable-arm',
          message: `Guard arm in ${guardName} is unreachable because an earlier wildcard arm already matches everything.`,
          line,
          column,
          suggestion: `Move this arm before the wildcard arm declared at line ${wildcardLine}.`
        });
        continue;
      }

      if (entry.isWildcard === true) {
        wildcardLine = line;
        continue;
      }

      const conjuncts = extractGuardConditionSignatures(entry.condition, sourceText);
      if (conjuncts.length === 0) {
        continue;
      }

      const conjunctSet = new Set(conjuncts);
      const coveringArm = seenConjunctions.find(previous =>
        Array.from(previous.conjuncts).every(signature => conjunctSet.has(signature))
      );

      if (coveringArm) {
        warnings.push({
          code: 'guard-unreachable-arm',
          message: `Guard arm in ${guardName} is unreachable because an earlier condition already covers it.`,
          line,
          column,
          suggestion: coveringArm.line
            ? `The broader arm was declared at line ${coveringArm.line}. Reorder the arms or narrow the earlier condition.`
            : 'Reorder the arms or narrow the earlier condition.'
        });
        continue;
      }

      seenConjunctions.push({ line, conjuncts: conjunctSet });
    }
  });

  return warnings;
}

function collectPolicyOperationLabels(policies: readonly PolicyInfo[]): Set<string> {
  const labels = new Set<string>();
  for (const policy of policies) {
    if (!policy.operations) {
      continue;
    }
    for (const operationLabels of Object.values(policy.operations)) {
      for (const label of operationLabels) {
        labels.add(label);
      }
    }
  }
  return labels;
}

function detectPrivilegedGuardWithoutPolicyOperationWarnings(
  ast: MlldNode[],
  policies: readonly PolicyInfo[]
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const declaredOperationLabels = collectPolicyOperationLabels(policies);

  if (declaredOperationLabels.size === 0) {
    return warnings;
  }

  walkAST(ast, (node) => {
    if (node.type !== 'Directive' || node.kind !== 'guard') {
      return;
    }

    const guardNode = node as GuardDirectiveNode;
    if (guardNode.meta?.privileged !== true || guardNode.meta?.filterKind !== 'operation') {
      return;
    }

    const filterValue = guardNode.meta?.filterValue;
    if (!filterValue || declaredOperationLabels.has(filterValue)) {
      return;
    }

    const guardName = extractText(guardNode.values?.name) || guardNode.raw?.name || 'anonymous guard';
    warnings.push({
      code: 'privileged-guard-without-policy-operation',
      message: `Privileged guard ${guardName} filters on op:${filterValue}, but no policy in this module declares that operation label.`,
      line: guardNode.location?.start?.line,
      column: guardNode.location?.start?.column,
      suggestion: `Add "${filterValue}" to a policy.operations category or remove the privileged override if no policy-managed operation needs it.`
    });
  });

  return warnings;
}

function detectPolicyDeclarationWarnings(
  ast: MlldNode[],
  policies: readonly PolicyInfo[],
  contextExecutables: ReadonlyMap<string, ValidationContextExecutable>
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const seen = new Set<string>();
  const declaredCategories = collectDeclaredPolicyOperationCategories(policies);
  const knownTargets = collectKnownPolicyOperationTargets(contextExecutables, declaredCategories);
  const canValidateOperationMappings = contextExecutables.size > 0;
  const canValidateLabelTargets = contextExecutables.size > 0 || declaredCategories.size > 0;

  const pushWarning = (warning: AntiPatternWarning): void => {
    const key = `${warning.code}:${warning.line ?? 0}:${warning.column ?? 0}:${warning.message}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    warnings.push(warning);
  };

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'policy') {
      return;
    }

    const policyNode = node as any;
    const policyName = extractText(policyNode.values?.name) || policyNode.raw?.name || 'anonymous policy';
    const expr = policyNode.values?.expr;
    if (!expr || expr.type !== 'object') {
      return;
    }

    const operationsNode = getObjectEntryValue(expr, 'operations');
    if (
      canValidateOperationMappings &&
      operationsNode &&
      typeof operationsNode === 'object' &&
      (operationsNode as any).type === 'object' &&
      Array.isArray((operationsNode as any).entries)
    ) {
      for (const entry of (operationsNode as any).entries as Array<Record<string, unknown>>) {
        if ((entry.type !== 'pair' && entry.type !== 'conditionalPair') || typeof entry.key !== 'string') {
          continue;
        }

        for (const labelEntry of extractStaticStringEntries(entry.value)) {
          if (hasKnownPolicyTargetMatch(labelEntry.value, knownTargets)) {
            continue;
          }

          const closestTarget = findClosestKnownPolicyTarget(labelEntry.value, knownTargets);
          pushWarning({
            code: 'policy-operations-unknown-label',
            message: `Policy @${policyName} maps operations.${entry.key} to "${labelEntry.value}", but no executable or operation label in the validation context matches it.`,
            line: labelEntry.line,
            column: labelEntry.column,
            suggestion: closestTarget
              ? `Use "${closestTarget}" if that was the intended operation label, or add context that defines "${labelEntry.value}".`
              : `Add a validation context that defines "${labelEntry.value}", or update operations.${entry.key}.`
          });
        }
      }
    }

    const labelsNode = getObjectEntryValue(expr, 'labels');
    if (
      canValidateLabelTargets &&
      labelsNode &&
      typeof labelsNode === 'object' &&
      (labelsNode as any).type === 'object' &&
      Array.isArray((labelsNode as any).entries)
    ) {
      for (const labelEntry of (labelsNode as any).entries as Array<Record<string, unknown>>) {
        if ((labelEntry.type !== 'pair' && labelEntry.type !== 'conditionalPair') || typeof labelEntry.key !== 'string') {
          continue;
        }

        const ruleValue = labelEntry.value;
        for (const ruleKind of ['deny', 'allow'] as const) {
          const targetNode = getObjectEntryValue(ruleValue, ruleKind);
          if (targetNode === undefined) {
            continue;
          }

          for (const targetEntry of extractStaticStringEntries(targetNode)) {
            if (hasKnownPolicyTargetMatch(targetEntry.value, knownTargets)) {
              continue;
            }

            const closestTarget = findClosestKnownPolicyTarget(targetEntry.value, knownTargets);
            if (!closestTarget && !canValidateOperationMappings) {
              continue;
            }

            pushWarning({
              code: 'policy-label-flow-unknown-target',
              message: `Policy @${policyName} labels.${labelEntry.key}.${ruleKind} references "${targetEntry.value}", but no declared operation category or validation-context label matches it.`,
              line: targetEntry.line,
              column: targetEntry.column,
              suggestion: closestTarget
                ? `Use "${closestTarget}" if that was the intended target, or add context that defines "${targetEntry.value}".`
                : `Add a declared operation category or validation context that defines "${targetEntry.value}", or update labels.${labelEntry.key}.${ruleKind}.`
            });
          }
        }
      }
    }
  });

  return warnings;
}

interface ValidationContextExecutable extends AuthorizationToolContext {
  labels: Set<string>;
}

const TOOL_CATALOG_FIELDS = new Set([
  'mlld',
  'inputs',
  'returns',
  'labels',
  'can_authorize',
  'description',
  'instructions',
  'bind',
]);

const LEGACY_TOOL_CATALOG_FIELD_REPLACEMENTS: Record<string, string> = {
  controlArgs: "Declare control args as `facts:` fields in the tool's input record (`inputs:`).",
  sourceArgs: "Declare source args as `facts:` fields in the tool's input record (`inputs:`).",
  updateArgs: "Declare update fields in the input record's `update:` section.",
  exactPayloadArgs: "Declare exact-match fields in the input record's `exact:` section.",
  correlateControlArgs: 'Declare `correlate: true` on the input record.',
  expose: "The input record's field list (`facts:` + `data:`) replaces `expose:`.",
  optional: 'Mark optional fields with `?` in the input record (for example, `cc: array?`).',
  kind: 'Use routing labels in `labels:` (for example, `resolve:r`, `execute:w`).',
  risk: 'Use risk labels in `labels:` (for example, `exfil:send`, `destructive`).',
  semantics: 'Renamed to `description:`.',
  operation: 'Split into top-level fields: `inputs:`, `labels:`, `can_authorize:`, `description:`, `instructions:`.',
  payloadRecord: 'Unified into the `inputs:` record (`data:` section).',
  payloadArgs: 'Declare payload args as `data:` fields in the input record (`inputs:`).',
  authorizable: 'Renamed to `can_authorize:`.'
};

function hasWriteSurfaceLabel(labels: ReadonlySet<string> | readonly string[]): boolean {
  for (const label of labels) {
    if (typeof label === 'string' && /(^|:)w$/i.test(label)) {
      return true;
    }
  }
  return false;
}

function hasReadSurfaceLabel(labels: ReadonlySet<string> | readonly string[]): boolean {
  for (const label of labels) {
    if (typeof label === 'string' && /(^|:)r$/i.test(label)) {
      return true;
    }
  }
  return false;
}

function hasUpdateWriteLabel(labels: ReadonlySet<string> | readonly string[]): boolean {
  for (const label of labels) {
    if (typeof label === 'string' && label.trim().toLowerCase() === 'update:w') {
      return true;
    }
  }
  return false;
}

function shouldUseWholeObjectInputForStaticTool(options: {
  toolValue: unknown;
  recordDefinition: RecordDefinition;
  executableParamNames: readonly string[];
  bindKeys: readonly string[];
}): boolean {
  const { bindKeys, executableParamNames, recordDefinition, toolValue } = options;
  const allowWholeObjectInput = computeAllowWholeObjectInput({
    direct: extractStaticValue(getObjectEntryValue(toolValue, 'direct')),
    inputs: extractStaticValue(getObjectEntryValue(toolValue, 'inputs'))
  });
  if (!allowWholeObjectInput || bindKeys.length !== 0 || executableParamNames.length !== 1) {
    return false;
  }

  const singleParamName = executableParamNames[0];
  if (typeof singleParamName !== 'string' || singleParamName.length === 0) {
    return false;
  }

  const fieldSet = new Set(recordDefinition.fields.map(field => field.name));
  return !fieldSet.has(singleParamName);
}

function buildRecordDefinitionsMapFromAst(ast: MlldNode[]): Map<string, RecordDefinition> {
  const definitions = new Map<string, RecordDefinition>();

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'record') {
      return;
    }

    const buildResult = buildRecordDefinitionFromDirective(node as any);
    if (buildResult.definition) {
      definitions.set(buildResult.definition.name, buildResult.definition);
    }
  });

  return definitions;
}

function buildSessionDefinitionsMapFromAst(
  ast: MlldNode[],
  filePath: string,
  recordDefinitions: ReadonlyMap<string, RecordDefinition>
): Map<string, SessionDefinition> {
  const definitions = new Map<string, SessionDefinition>();

  walkAST(ast, node => {
    if (node.type !== 'Directive' || node.kind !== 'var' || (node as any).meta?.isSessionLabel !== true) {
      return;
    }

    const buildResult = buildSessionDefinitionFromDirective(node as any, {
      filePath,
      resolveRecord: name => recordDefinitions.get(name)
    });
    if (buildResult.definition) {
      definitions.set(buildResult.definition.canonicalName, buildResult.definition);
    }
  });

  return definitions;
}

async function buildAvailableRecordDefinitionsForValidation(
  filepath: string,
  ast: MlldNode[],
  localDefinitions: ReadonlyMap<string, RecordDefinition>
): Promise<Map<string, RecordDefinition>> {
  const definitions = new Map(localDefinitions);
  const projectRoot = await resolveProjectRootForDeepValidation([filepath]);
  const visited = new Set<string>();

  const visitModule = async (modulePath: string): Promise<void> => {
    const normalizedPath = path.resolve(modulePath);
    if (visited.has(normalizedPath)) {
      return;
    }
    visited.add(normalizedPath);

    const moduleAst = await parseModuleAstForDeepTraversal(normalizedPath);
    if (!moduleAst) {
      return;
    }

    for (const [recordName, recordDefinition] of buildRecordDefinitionsMapFromAst(moduleAst)) {
      if (!definitions.has(recordName)) {
        definitions.set(recordName, recordDefinition);
      }
    }

    for (const importInfo of extractImports(moduleAst)) {
      if (typeof importInfo.from !== 'string' || importInfo.from.trim().length === 0) {
        continue;
      }
      const resolvedImport = await resolveModuleImportForDeepValidation(
        importInfo.from,
        normalizedPath,
        projectRoot
      );
      if (resolvedImport) {
        await visitModule(resolvedImport);
      }
    }
  };

  for (const importInfo of extractImports(ast)) {
    if (typeof importInfo.from !== 'string' || importInfo.from.trim().length === 0) {
      continue;
    }
    const resolvedImport = await resolveModuleImportForDeepValidation(
      importInfo.from,
      filepath,
      projectRoot
    );
    if (resolvedImport) {
      await visitModule(resolvedImport);
    }
  }

  return definitions;
}

async function buildAvailableSessionDefinitionsForValidation(
  filepath: string,
  ast: MlldNode[],
  localDefinitions: ReadonlyMap<string, SessionDefinition>,
  recordDefinitions: ReadonlyMap<string, RecordDefinition>
): Promise<Map<string, SessionDefinition>> {
  const definitions = new Map(localDefinitions);
  const projectRoot = await resolveProjectRootForDeepValidation([filepath]);
  const visited = new Set<string>();

  const visitModule = async (modulePath: string): Promise<void> => {
    const normalizedPath = path.resolve(modulePath);
    if (visited.has(normalizedPath)) {
      return;
    }
    visited.add(normalizedPath);

    const moduleAst = await parseModuleAstForDeepTraversal(normalizedPath);
    if (!moduleAst) {
      return;
    }

    for (const [sessionName, sessionDefinition] of buildSessionDefinitionsMapFromAst(
      moduleAst,
      normalizedPath,
      recordDefinitions
    )) {
      if (!definitions.has(sessionName)) {
        definitions.set(sessionName, sessionDefinition);
      }
    }

    for (const importInfo of extractImports(moduleAst)) {
      if (typeof importInfo.from !== 'string' || importInfo.from.trim().length === 0) {
        continue;
      }
      const resolvedImport = await resolveModuleImportForDeepValidation(
        importInfo.from,
        normalizedPath,
        projectRoot
      );
      if (resolvedImport) {
        await visitModule(resolvedImport);
      }
    }
  };

  for (const importInfo of extractImports(ast)) {
    if (typeof importInfo.from !== 'string' || importInfo.from.trim().length === 0) {
      continue;
    }
    const resolvedImport = await resolveModuleImportForDeepValidation(
      importInfo.from,
      filepath,
      projectRoot
    );
    if (resolvedImport) {
      await visitModule(resolvedImport);
    }
  }

  return definitions;
}

function cloneValidationContextExecutable(
  source: ValidationContextExecutable,
  name: string
): ValidationContextExecutable {
  return {
    name,
    params: new Set(source.params),
    ...(source.inputSchema ? { inputSchema: cloneToolInputSchema(source.inputSchema) } : {}),
    labels: new Set(source.labels),
    controlArgs: new Set(source.controlArgs),
    hasControlArgsMetadata: source.hasControlArgsMetadata,
    updateArgs: new Set(source.updateArgs),
    hasUpdateArgsMetadata: source.hasUpdateArgsMetadata,
    exactPayloadArgs: new Set(source.exactPayloadArgs)
  };
}

function getOrCreateValidationExecutable(
  byName: Map<string, ValidationContextExecutable>,
  name: string
): ValidationContextExecutable {
  const existing = byName.get(name);
  if (existing) {
    return existing;
  }

  const created: ValidationContextExecutable = {
    name,
    params: new Set<string>(),
    labels: new Set<string>(),
    controlArgs: new Set<string>(),
    hasControlArgsMetadata: false,
    updateArgs: new Set<string>(),
    hasUpdateArgsMetadata: false,
    exactPayloadArgs: new Set<string>()
  };
  byName.set(name, created);
  return created;
}

function mergeValidationContextAst(
  ast: MlldNode[],
  byName: Map<string, ValidationContextExecutable>
): void {
  const recordDefinitions = buildRecordDefinitionsMapFromAst(ast);

  for (const executable of extractExecutables(ast)) {
    const target = getOrCreateValidationExecutable(byName, executable.name);
    for (const param of executable.params ?? []) {
      target.params.add(param);
    }
    for (const label of executable.labels ?? []) {
      target.labels.add(label);
    }
    if (Array.isArray(executable.controlArgs)) {
      target.hasControlArgsMetadata = true;
      for (const controlArg of executable.controlArgs) {
        target.controlArgs.add(controlArg);
      }
    }
    if (Array.isArray(executable.updateArgs)) {
      target.hasUpdateArgsMetadata = true;
      for (const updateArg of executable.updateArgs) {
        target.updateArgs.add(updateArg);
      }
    }
    if (Array.isArray(executable.exactPayloadArgs)) {
      if (!target.exactPayloadArgs) {
        target.exactPayloadArgs = new Set<string>();
      }
      for (const payloadArg of executable.exactPayloadArgs) {
        target.exactPayloadArgs.add(payloadArg);
      }
    }
  }

  walkAST(ast, (node) => {
    const directiveNode = node as any;
    if (
      directiveNode.type !== 'Directive' ||
      directiveNode.kind !== 'var' ||
      directiveNode.meta?.isToolsCollection !== true
    ) {
      return;
    }

    const toolObjectNode = Array.isArray(directiveNode.values?.value)
      ? directiveNode.values.value[0]
      : undefined;
    if (!toolObjectNode || typeof toolObjectNode !== 'object' || (toolObjectNode as any).type !== 'object') {
      return;
    }

    for (const entry of (toolObjectNode as any).entries as Array<Record<string, unknown>>) {
      if ((entry.type !== 'pair' && entry.type !== 'conditionalPair') || typeof entry.key !== 'string') {
        continue;
      }

      const toolValue = entry.value;
      const mlldValue = extractStaticBareToolExecutableReference(toolValue);
      if (typeof mlldValue !== 'string' || mlldValue.trim().length === 0) {
        continue;
      }

      const execName = mlldValue.trim().replace(/^@/, '');
      if (!execName) {
        continue;
      }

      const executableTarget = byName.get(execName);
      if (!executableTarget) {
        continue;
      }

      const target = getOrCreateValidationExecutable(byName, entry.key);
      for (const paramName of executableTarget.params) {
        target.params.add(paramName);
      }
      for (const label of executableTarget.labels) {
        target.labels.add(label);
      }
      if (executableTarget.hasControlArgsMetadata) {
        target.hasControlArgsMetadata = true;
        for (const controlArg of executableTarget.controlArgs) {
          target.controlArgs.add(controlArg);
        }
      }
      if (executableTarget.hasUpdateArgsMetadata) {
        target.hasUpdateArgsMetadata = true;
        for (const updateArg of executableTarget.updateArgs) {
          target.updateArgs.add(updateArg);
        }
      }
      if (executableTarget.exactPayloadArgs) {
        if (!target.exactPayloadArgs) {
          target.exactPayloadArgs = new Set<string>();
        }
        for (const payloadArg of executableTarget.exactPayloadArgs) {
          target.exactPayloadArgs.add(payloadArg);
        }
      }

      const labelsValue = extractStaticValue(getObjectEntryValue(toolValue, 'labels'));
      if (Array.isArray(labelsValue)) {
        for (const label of labelsValue) {
          if (typeof label === 'string' && label.trim().length > 0) {
            target.labels.add(label.trim());
          }
        }
      }

      const bindNode = getObjectEntryValue(toolValue, 'bind');
      const resolvedBindKeys = extractStaticObjectKeys(bindNode) ?? [];
      const boundKeys =
        resolvedBindKeys
          .filter(key => executableTarget.params.has(key));

      const inputsValue = extractStaticValue(getObjectEntryValue(toolValue, 'inputs'));
      if (typeof inputsValue === 'string' && inputsValue.trim().length > 0) {
        const recordName = inputsValue.trim().replace(/^@/, '');
        const recordDefinition = recordDefinitions.get(recordName);
        if (recordDefinition && canUseRecordForInput(recordDefinition)) {
          const executableParamNames = [...executableTarget.params];
          const wholeObjectInput = shouldUseWholeObjectInputForStaticTool({
            toolValue,
            recordDefinition,
            executableParamNames,
            bindKeys: resolvedBindKeys
          });
          const inputSchema = buildToolInputSchemaFromRecordDefinition({
            recordDefinition,
            executableParamNames,
            ...(wholeObjectInput ? { wholeObjectInput: true } : {})
          });

          target.inputSchema = inputSchema;
          target.params = new Set(inputSchema.visibleParams.filter(param => !boundKeys.includes(param)));
          target.controlArgs.clear();
          target.hasControlArgsMetadata = false;

          const writeSurface = hasWriteSurfaceLabel(target.labels);
          const readSurface = hasReadSurfaceLabel(target.labels);
          if (writeSurface || !readSurface) {
            target.hasControlArgsMetadata = true;
            for (const factField of inputSchema.factFields) {
              if (target.params.has(factField)) {
                target.controlArgs.add(factField);
              }
            }
          }

          if (inputSchema.updateFields.length > 0) {
            target.updateArgs = new Set(
              inputSchema.updateFields.filter(argName => target.params.has(argName))
            );
            target.hasUpdateArgsMetadata = target.updateArgs.size > 0;
          } else {
            target.updateArgs = new Set(
              [...target.updateArgs].filter(argName => target.params.has(argName))
            );
            if (target.updateArgs.size === 0) {
              target.hasUpdateArgsMetadata = false;
            }
          }

          if (inputSchema.exactFields.length > 0) {
            target.exactPayloadArgs = new Set(
              inputSchema.exactFields.filter(argName => target.params.has(argName))
            );
          } else {
            target.exactPayloadArgs = new Set(
              [...target.exactPayloadArgs].filter(argName => target.params.has(argName))
            );
          }
        }
      }

    }
  });
}

async function buildValidationContextExecutables(
  currentFilepath: string,
  ast: MlldNode[],
  contextPaths: readonly string[] | undefined
): Promise<Map<string, ValidationContextExecutable>> {
  const byName = new Map<string, ValidationContextExecutable>();
  mergeValidationContextAst(ast, byName);

  if (!contextPaths || contextPaths.length === 0) {
    return byName;
  }

  const resolvedContextFiles = await resolveFilePaths([...contextPaths]);
  for (const contextFile of resolvedContextFiles) {
    const resolvedPath = path.resolve(contextFile);
    if (resolvedPath === path.resolve(currentFilepath) || isTemplateFile(resolvedPath)) {
      continue;
    }

    try {
      const content = await fs.readFile(resolvedPath, 'utf8');
      const mode = resolvedPath.endsWith('.mld.md') ? 'markdown' : 'strict';
      mergeValidationContextAst(parseSync(content, { mode }), byName);
    } catch {
      // Ignore invalid context files here; validate() will already report their own failures separately.
    }
  }

  return byName;
}

function collectToolCatalogDiagnostics(
  ast: MlldNode[],
  executables: readonly ExecutableInfo[],
  recordDefinitions: ReadonlyMap<string, RecordDefinition>
): {
  errors: AnalysisError[];
  warnings: AntiPatternWarning[];
} {
  const errors: AnalysisError[] = [];
  const warnings: AntiPatternWarning[] = [];
  const seen = new Set<string>();
  const seenWarnings = new Set<string>();
  const executableByName = new Map(executables.map(executable => [executable.name, executable]));

  const pushError = (message: string, line?: number, column?: number): void => {
    const key = `${line ?? 0}:${column ?? 0}:${message}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    errors.push({ message, line, column });
  };

  const pushWarning = (warning: AntiPatternWarning): void => {
    const key = `${warning.code}:${warning.line ?? 0}:${warning.column ?? 0}:${warning.message}`;
    if (seenWarnings.has(key)) {
      return;
    }
    seenWarnings.add(key);
    warnings.push(warning);
  };

  walkAST(ast, node => {
    const directiveNode = node as any;
    if (
      directiveNode.type !== 'Directive'
      || directiveNode.kind !== 'var'
      || directiveNode.meta?.isToolsCollection !== true
    ) {
      return;
    }

    const toolObjectNode = Array.isArray(directiveNode.values?.value)
      ? directiveNode.values.value[0]
      : undefined;
    if (!toolObjectNode || typeof toolObjectNode !== 'object' || (toolObjectNode as any).type !== 'object') {
      return;
    }

    for (const entry of (toolObjectNode as any).entries as Array<Record<string, unknown>>) {
      if ((entry.type !== 'pair' && entry.type !== 'conditionalPair') || typeof entry.key !== 'string') {
        continue;
      }

      const toolName = entry.key;
      const toolValue = entry.value;
      const entryLine = (entry.location as any)?.start?.line ?? directiveNode.location?.start?.line;
      const entryColumn = (entry.location as any)?.start?.column ?? directiveNode.location?.start?.column;

      if (!isStaticInlineToolCatalogEntry(toolValue)) {
        if (isStaticToolEntryReference(toolValue)) {
          continue;
        }
        pushError(`Tool '${toolName}' must be an object`, entryLine, entryColumn);
        continue;
      }

      for (const fieldEntry of getObjectNodeEntries(toolValue)) {
        if (fieldEntry.type !== 'pair' && fieldEntry.type !== 'conditionalPair') {
          continue;
        }
        const fieldName = getStaticObjectKey(fieldEntry.key);
        if (!fieldName || TOOL_CATALOG_FIELDS.has(fieldName)) {
          continue;
        }
        const fieldLine = (fieldEntry.location as any)?.start?.line ?? entryLine;
        const fieldColumn = (fieldEntry.location as any)?.start?.column ?? entryColumn;
        const replacement = LEGACY_TOOL_CATALOG_FIELD_REPLACEMENTS[fieldName];
        if (replacement) {
          pushError(
            `Tool '${toolName}' uses removed field '${fieldName}'. ${replacement}`,
            fieldLine,
            fieldColumn
          );
          continue;
        }
        pushWarning({
          code: 'tool-catalog-unknown-field',
          message: `Tool '${toolName}' has unrecognized field '${fieldName}'. Unrecognized fields are preserved but not validated.`,
          line: fieldLine,
          column: fieldColumn,
          suggestion: 'Unrecognized fields are preserved but not validated.'
        });
      }

      const rawMlldValue = extractStaticValue(getObjectEntryValue(toolValue, 'mlld'));
      if (typeof rawMlldValue !== 'string' || rawMlldValue.trim().length === 0) {
        pushError(`Tool '${toolName}' is missing 'mlld' reference`, entryLine, entryColumn);
        continue;
      }

      const executableName = rawMlldValue.trim().replace(/^@/, '');
      const executable = executableByName.get(executableName);

      const descriptionValue = extractStaticValue(getObjectEntryValue(toolValue, 'description'));
      if (descriptionValue !== undefined && typeof descriptionValue !== 'string') {
        pushError(`Tool '${toolName}' description must be a string`, entryLine, entryColumn);
      }

      const instructionsValue = extractStaticValue(getObjectEntryValue(toolValue, 'instructions'));
      if (instructionsValue !== undefined && typeof instructionsValue !== 'string') {
        pushError(`Tool '${toolName}' instructions must be a string`, entryLine, entryColumn);
      }

      const labelsValue = extractStaticValue(getObjectEntryValue(toolValue, 'labels'));
      if (
        labelsValue !== undefined
        && (
          !Array.isArray(labelsValue)
          || labelsValue.some(label => typeof label !== 'string' || label.trim().length === 0)
        )
      ) {
        pushError(`Tool '${toolName}' labels must be an array of strings`, entryLine, entryColumn);
      }

      const canAuthorizeNode = getObjectEntryValue(toolValue, 'can_authorize');
      const canAuthorizeValue = extractStaticValue(canAuthorizeNode);
      if (canAuthorizeValue !== undefined) {
        const roleEntries =
          canAuthorizeValue === false
            ? []
            : typeof canAuthorizeValue === 'string'
              ? [canAuthorizeValue]
              : Array.isArray(canAuthorizeValue)
                ? canAuthorizeValue
                : null;
        if (roleEntries === null) {
          pushError(
            `Tool '${toolName}' can_authorize must be false, a role:* string, or an array of role:* strings`,
            entryLine,
            entryColumn
          );
        } else {
          const invalidRoles = roleEntries.filter(
            role => typeof role !== 'string' || !/^role:[a-z][a-z0-9_-]*$/i.test(role.trim())
          );
          if (invalidRoles.length > 0) {
            pushError(
              `Tool '${toolName}' can_authorize entries must match role:*: ${invalidRoles.join(', ')}`,
              entryLine,
              entryColumn
            );
          }
        }
      }

      const bindNode = getObjectEntryValue(toolValue, 'bind');
      const bindValue = extractStaticValue(bindNode);
      const bindKeys = extractStaticObjectKeys(bindNode);
      if (bindValue !== undefined && !isPlainObject(bindValue) && bindKeys === null) {
        pushError(`Tool '${toolName}' bind must be an object`, entryLine, entryColumn);
      }

      const resolvedBindKeys = bindKeys ?? (isPlainObject(bindValue) ? Object.keys(bindValue) : []);
      if (executable && resolvedBindKeys.length > 0) {
        const invalidBindKeys = resolvedBindKeys.filter(
          key => !(executable.params ?? []).includes(key)
        );
        if (invalidBindKeys.length > 0) {
          pushError(
            `Tool '${toolName}' bind keys must match parameters of '@${executableName}': ${invalidBindKeys.join(', ')}`,
            entryLine,
            entryColumn
          );
        }
      }

      const rawInputsValue = extractStaticValue(getObjectEntryValue(toolValue, 'inputs'));
      if (rawInputsValue === undefined) {
        continue;
      }

      if (typeof rawInputsValue !== 'string' || rawInputsValue.trim().length === 0) {
        pushError(`Tool '${toolName}' inputs must be a record reference`, entryLine, entryColumn);
        continue;
      }

      const recordName = rawInputsValue.trim().replace(/^@/, '');
      const recordDefinition = recordDefinitions.get(recordName);
      if (!recordDefinition) {
        pushError(
          `Tool '${toolName}' inputs reference unknown record '@${recordName}'`,
          entryLine,
          entryColumn
        );
        continue;
      }

      if (!canUseRecordForInput(recordDefinition)) {
        pushError(
          `Tool '${toolName}' inputs must reference an input-capable record`,
          entryLine,
          entryColumn
        );
        continue;
      }

      if (recordDefinition.validate === 'demote') {
        pushError(
          `Tool '${toolName}' inputs cannot use record '@${recordName}' with validate: "demote"`,
          entryLine,
          entryColumn
        );
      }

      if (!executable) {
        continue;
      }

      const executableParamNames = executable.params ?? [];
      const wholeObjectInput = shouldUseWholeObjectInputForStaticTool({
        toolValue,
        recordDefinition,
        executableParamNames,
        bindKeys: resolvedBindKeys
      });
      const schema = buildToolInputSchemaFromRecordDefinition({
        recordDefinition,
        executableParamNames,
        ...(wholeObjectInput ? { wholeObjectInput: true } : {})
      });
      const fieldNames = schema.fields.map(field => field.name);
      const fieldSet = new Set(fieldNames);
      const effectiveLabels = new Set<string>([
        ...(executable.labels ?? []),
        ...(
          Array.isArray(labelsValue)
            ? labelsValue
              .filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
              .map(label => label.trim())
            : []
        )
      ]);

      const boundFieldOverlap = resolvedBindKeys.filter(key => fieldSet.has(key));
      if (boundFieldOverlap.length > 0) {
        pushError(
          `Tool '${toolName}' bind cannot include input-record fields: ${boundFieldOverlap.join(', ')}`,
          entryLine,
          entryColumn
        );
      }

      const invalidParams = wholeObjectInput
        ? []
        : recordDefinition.fields
          .map(field => field.name)
          .filter(name => !(executable.params ?? []).includes(name));
      if (invalidParams.length > 0) {
        pushError(
          `Tool '${toolName}' inputs for '@${executableName}' reference unknown parameters: ${invalidParams.join(', ')}`,
          entryLine,
          entryColumn
        );
      }

      if (!wholeObjectInput) {
        const covered = new Set([
          ...recordDefinition.fields.map(field => field.name),
          ...resolvedBindKeys
        ]);
        const orphanParams = (executable.params ?? []).filter(name => !covered.has(name));
        if (orphanParams.length > 0) {
          pushError(
            `Tool '${toolName}' must cover all parameters of '@${executableName}' via inputs or bind: ${orphanParams.join(', ')}`,
            entryLine,
            entryColumn
          );
        }
      }

      if (schema.updateFields.length > 0 && !hasUpdateWriteLabel(effectiveLabels)) {
        pushError(
          `Tool '${toolName}' inputs require label 'update:w' when record '@${recordName}' declares update fields`,
          entryLine,
          entryColumn
        );
      }

      for (const [fieldName, target] of Object.entries(schema.allowlist)) {
        if (target.kind !== 'reference') {
          continue;
        }

        const targetRecord = recordDefinitions.get(target.name);
        if (!targetRecord) {
          continue;
        }

        if (!canUseRecordForOutput(targetRecord)) {
          pushError(
            `Tool '${toolName}' allowlist target '@${target.name}' for field '${fieldName}' must not be an input record`,
            entryLine,
            entryColumn
          );
          continue;
        }

        const factCount = targetRecord.fields.filter(field => field.classification === 'fact').length;
        if (factCount !== 1) {
          pushError(
            `Tool '${toolName}' allowlist target '@${target.name}' for field '${fieldName}' must resolve to a single-fact record or array`,
            entryLine,
            entryColumn
          );
        }
      }

      for (const [fieldName, target] of Object.entries(schema.blocklist)) {
        if (target.kind !== 'reference') {
          continue;
        }

        const targetRecord = recordDefinitions.get(target.name);
        if (!targetRecord) {
          continue;
        }

        if (!canUseRecordForOutput(targetRecord)) {
          pushError(
            `Tool '${toolName}' blocklist target '@${target.name}' for field '${fieldName}' must not be an input record`,
            entryLine,
            entryColumn
          );
          continue;
        }

        const factCount = targetRecord.fields.filter(field => field.classification === 'fact').length;
        if (factCount !== 1) {
          pushError(
            `Tool '${toolName}' blocklist target '@${target.name}' for field '${fieldName}' must resolve to a single-fact record or array`,
            entryLine,
            entryColumn
          );
        }
      }

    }
  });

  return { errors, warnings };
}

function detectGuardContextWarnings(
  ast: MlldNode[],
  contextExecutables: ReadonlyMap<string, ValidationContextExecutable>
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const seen = new Set<string>();

  const pushWarning = (warning: AntiPatternWarning): void => {
    const key = `${warning.code}:${warning.line ?? 0}:${warning.column ?? 0}:${warning.message}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    warnings.push(warning);
  };

  const findContextExecutableByNamedRef = (
    opRef: string | undefined
  ): ValidationContextExecutable | undefined => {
    const normalizedRef = normalizeNamedOperationRef(opRef);
    if (!normalizedRef) {
      return undefined;
    }
    for (const executable of contextExecutables.values()) {
      if (normalizeNamedOperationRef(executable.name) === normalizedRef) {
        return executable;
      }
    }
    return undefined;
  };

  const visitGuardRuleReferences = (
    value: unknown,
    opNames: Set<string>,
    argNames: Array<{ name: string; line?: number; column?: number }>
  ): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visitGuardRuleReferences(item, opNames, argNames);
      }
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const node = value as Record<string, unknown>;

    if (node.type === 'BinaryExpression' && node.operator === '==') {
      if (isMxFieldReference(node.left, ['op', 'name'])) {
        const compared = extractStringLiteralValue(node.right);
        if (compared) {
          opNames.add(compared);
        }
      } else if (isMxFieldReference(node.right, ['op', 'name'])) {
        const compared = extractStringLiteralValue(node.left);
        if (compared) {
          opNames.add(compared);
        }
      }
    }

    if (node.type === 'VariableReference' && node.identifier === 'mx' && Array.isArray(node.fields)) {
      const fieldNames = node.fields
        .map(field => getFieldAccessorName(field))
        .filter((field): field is string => typeof field === 'string');

      if (fieldNames[0] === 'args' && typeof fieldNames[1] === 'string' && fieldNames[1] !== 'names') {
        argNames.push({
          name: fieldNames[1],
          line: (node as any)?.location?.start?.line,
          column: (node as any)?.location?.start?.column
        });
      }
    }

    for (const nested of Object.values(node)) {
      visitGuardRuleReferences(nested, opNames, argNames);
    }
  };

  walkAST(ast, (node) => {
    if (node.type !== 'Directive' || node.kind !== 'guard') {
      return;
    }

    const guardNode = node as GuardDirectiveNode;
    const guardName = extractText(guardNode.values?.name) || guardNode.raw?.name || 'anonymous guard';

    const namedFilterRef =
      guardNode.meta?.filterKind === 'operation'
        ? normalizeNamedOperationRef(guardNode.meta?.filterValue)
        : undefined;

    if (guardNode.meta?.filterKind === 'function') {
      const functionName = guardNode.meta?.filterValue;
      if (functionName && !contextExecutables.has(functionName)) {
        pushWarning({
          code: 'guard-context-missing-exe',
          message: `Guard ${guardName} references @${functionName}, but no executable with that name exists in the validation context.`,
          line: guardNode.location?.start?.line,
          column: guardNode.location?.start?.column,
          suggestion: `Add @${functionName} to the context files or update the guard filter.`
        });
      }
    } else if (namedFilterRef && !findContextExecutableByNamedRef(namedFilterRef)) {
      pushWarning({
        code: 'guard-context-missing-exe',
        message: `Guard ${guardName} filters on ${namedFilterRef}, but no executable with that name exists in the validation context.`,
        line: guardNode.location?.start?.line,
        column: guardNode.location?.start?.column,
        suggestion: `Add a context module that defines ${namedFilterRef}, or update the guard filter.`
      });
    }

    if (guardNode.meta?.filterKind === 'operation') {
      const filterValue = guardNode.meta?.filterValue;
      if (
        filterValue &&
        !namedFilterRef &&
        contextExecutables.size > 0 &&
        !Array.from(contextExecutables.values()).some(executable => executable.labels.has(filterValue))
      ) {
        pushWarning({
          code: 'guard-context-missing-op-label',
          message: `Guard ${guardName} filters on op:${filterValue}, but no executable in the validation context carries the "${filterValue}" label.`,
          line: guardNode.location?.start?.line,
          column: guardNode.location?.start?.column,
          suggestion: `Add a context module that defines executables labeled "${filterValue}", or update the guard filter.`
        });
      }
    }

    const guardBlock = guardNode.values?.guard?.[0];
    if (!guardBlock || !Array.isArray(guardBlock.rules)) {
      return;
    }

    for (const entry of guardBlock.rules as Array<Record<string, unknown>>) {
      if (entry.type !== 'GuardRule' || !entry.condition) {
        continue;
      }

      const opNames = new Set<string>();
      const argNames: Array<{ name: string; line?: number; column?: number }> = [];
      visitGuardRuleReferences(entry.condition, opNames, argNames);

      for (const opName of opNames) {
        if (!contextExecutables.has(opName)) {
          pushWarning({
            code: 'guard-context-missing-exe',
            message: `Guard ${guardName} references @mx.op.name == "${opName}", but no executable with that name exists in the validation context.`,
            line: (entry as any)?.location?.start?.line,
            column: (entry as any)?.location?.start?.column,
            suggestion: `Add @${opName} to the context files or update the guard condition.`
          });
        }
      }

      const candidateExecutables =
        opNames.size > 0
          ? Array.from(opNames)
              .map(name => contextExecutables.get(name))
              .filter((executable): executable is ValidationContextExecutable => Boolean(executable))
          : namedFilterRef
            ? [findContextExecutableByNamedRef(namedFilterRef)].filter(
                (executable): executable is ValidationContextExecutable => Boolean(executable)
              )
          : guardNode.meta?.filterKind === 'function' && guardNode.meta.filterValue
            ? [contextExecutables.get(guardNode.meta.filterValue)].filter(
                (executable): executable is ValidationContextExecutable => Boolean(executable)
              )
            : [];

      if (candidateExecutables.length === 0) {
        continue;
      }

      for (const argRef of argNames) {
        const argExists = candidateExecutables.some(executable => executable.params.has(argRef.name));
        if (argExists) {
          continue;
        }

        const candidateNames = candidateExecutables.map(executable => `@${executable.name}()`).join(', ');
        pushWarning({
          code: 'guard-context-missing-arg',
          message: `Guard ${guardName} references @mx.args.${argRef.name}, but ${candidateNames} does not declare that parameter.`,
          line: argRef.line,
          column: argRef.column,
          suggestion: `Use a declared parameter name or update the validation context so the guarded executable signature matches the guard.`
        });
      }
    }
  });

  return warnings;
}

function mapPolicyAuthorizationWarningCode(
  issue: PolicyAuthorizationIssue
): AntiPatternWarningCode | null {
  switch (issue.code) {
    case 'authorizations-empty-entry':
      return 'policy-authorizations-empty-entry';
    case 'authorizations-unconstrained-tool':
      return 'policy-authorizations-unconstrained-tool';
    default:
      return null;
  }
}

function normalizeStaticAuthorizableToolName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

function collectStaticAuthorizableDiagnostics(
  authorizationsNode: unknown,
  rawAuthorizations: unknown,
  contextExecutables: ReadonlyMap<string, ValidationContextExecutable>,
  normalizedDeny: readonly string[] | undefined
): {
  errors: AnalysisError[];
  warnings: AntiPatternWarning[];
} {
  const errors: AnalysisError[] = [];
  const warnings: AntiPatternWarning[] = [];

  if (
    !isPlainObject(rawAuthorizations)
    || (
      !Object.prototype.hasOwnProperty.call(rawAuthorizations, 'can_authorize')
      && !Object.prototype.hasOwnProperty.call(rawAuthorizations, 'authorizable')
    )
  ) {
    return { errors, warnings };
  }

  const { line, column } = getFirstObjectEntryLocation(authorizationsNode, 'can_authorize', 'authorizable');
  const denySet = new Set(
    (normalizedDeny ?? [])
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map(entry => entry.trim())
  );
  const rawAuthorizable =
    (rawAuthorizations as Record<string, unknown>).can_authorize
    ?? (rawAuthorizations as Record<string, unknown>).authorizable;

  if (!isPlainObject(rawAuthorizable)) {
    errors.push({
      message: 'policy.authorizations.can_authorize must be an object',
      line,
      column
    });
    return { errors, warnings };
  }

  for (const [roleName, rawTools] of Object.entries(rawAuthorizable)) {
    if (!isRoleDisplayModeName(roleName)) {
      errors.push({
        message: `policy.authorizations.can_authorize key '${roleName}' must use a role:* label`,
        line,
        column
      });
    }

    if (!Array.isArray(rawTools)) {
      errors.push({
        message: `policy.authorizations.can_authorize.${roleName} must be an array`,
        line,
        column
      });
      continue;
    }

    for (const rawTool of rawTools) {
      const toolName = normalizeStaticAuthorizableToolName(rawTool);
      if (!toolName) {
        errors.push({
          message: `policy.authorizations.can_authorize.${roleName} must contain executable refs or tool names`,
          line,
          column
        });
        continue;
      }

      if (denySet.has(toolName)) {
        errors.push({
          message: `Tool '${toolName}' cannot appear under policy.authorizations.can_authorize.${roleName} because it is denied by policy.authorizations.deny`,
          line,
          column
        });
      }

      if (contextExecutables.size > 0 && !contextExecutables.has(toolName)) {
        const closestToolName = findClosestKnownToolName(toolName, contextExecutables);
        warnings.push({
          code: 'policy-authorizations-can-authorize-unknown-tool',
          message: `policy.authorizations.can_authorize.${roleName} references unknown tool '${toolName}'`,
          line,
          column,
          suggestion: closestToolName
            ? `Use "${closestToolName}" if that was the intended tool name, or add validation context that defines "${toolName}".`
            : `Add validation context that defines "${toolName}", or update policy.authorizations.can_authorize.${roleName}.`
        });
      }
    }
  }

  return { errors, warnings };
}

function collectPolicyAuthorizationDiagnostics(
  ast: MlldNode[],
  contextExecutables: ReadonlyMap<string, ValidationContextExecutable>
): {
  errors: AnalysisError[];
  warnings: AntiPatternWarning[];
} {
  const errors: AnalysisError[] = [];
  const warnings: AntiPatternWarning[] = [];
  const seen = new Set<string>();
  const bindings = buildTopLevelStaticBindings(ast);

  for (const node of ast) {
    if (!node || typeof node !== 'object' || node.type !== 'Directive' || node.kind !== 'policy') {
      continue;
    }

    for (const { authorizationsNode, rawAuthorizations } of collectPolicyAuthorizationTargets(
      (node as any).values?.expr,
      bindings
    )) {
      const allowNode = getObjectEntryValue(authorizationsNode, 'allow');
      const denyEntryNode = getObjectEntryValue(authorizationsNode, 'deny');
      const hasDynamicCoreAuthorizations =
        containsDynamicStaticValueReference(allowNode)
        || containsDynamicStaticValueReference(denyEntryNode);

      const validation = hasDynamicCoreAuthorizations
        ? { errors: [], warnings: [], normalized: undefined }
        : validatePolicyAuthorizations(stripPolicyAuthorizableField(rawAuthorizations), contextExecutables, {
            requireKnownTools: contextExecutables.size > 0,
            requireControlArgsMetadata: contextExecutables.size > 0
          });
      const normalizedDeny =
        validation.normalized?.deny
        ?? (
          isPlainObject(rawAuthorizations) && Array.isArray(rawAuthorizations.deny)
            ? rawAuthorizations.deny
              .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
              .map(entry => entry.trim())
            : undefined
        );
      const authorizableDiagnostics = collectStaticAuthorizableDiagnostics(
        authorizationsNode,
        rawAuthorizations,
        contextExecutables,
        normalizedDeny
      );
      const line = (authorizationsNode as any)?.location?.start?.line ?? (node as any)?.location?.start?.line;
      const column =
        (authorizationsNode as any)?.location?.start?.column ?? (node as any)?.location?.start?.column;

      for (const issue of validation.errors) {
        const key = `error:${issue.code}:${line ?? 0}:${column ?? 0}:${issue.message}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        errors.push({
          message: issue.message,
          line,
          column
        });
      }

      for (const issue of authorizableDiagnostics.errors) {
        const key = `error:can_authorize:${issue.line ?? 0}:${issue.column ?? 0}:${issue.message}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        errors.push(issue);
      }

      for (const issue of validation.warnings) {
        const warningCode = mapPolicyAuthorizationWarningCode(issue);
        if (!warningCode) {
          continue;
        }
        const key = `warning:${warningCode}:${line ?? 0}:${column ?? 0}:${issue.message}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        warnings.push({
          code: warningCode,
          message: issue.message,
          line,
          column
        });
      }

      for (const warning of authorizableDiagnostics.warnings) {
        const key = `warning:${warning.code}:${warning.line ?? 0}:${warning.column ?? 0}:${warning.message}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        warnings.push(warning);
      }

      if (contextExecutables.size === 0 || !validation.normalized?.deny || validation.normalized.deny.length === 0) {
        continue;
      }

      const denyEntries = extractStaticStringEntries(denyEntryNode);
      for (const deniedTool of validation.normalized.deny) {
        if (contextExecutables.has(deniedTool)) {
          continue;
        }

        const location = denyEntries.find(entry => entry.value === deniedTool);
        const closestToolName = findClosestKnownToolName(deniedTool, contextExecutables);
        const warningMessage = `policy.authorizations.deny references unknown tool '${deniedTool}'`;
        const key = `warning:policy-authorizations-deny-unknown-tool:${location?.line ?? line ?? 0}:${location?.column ?? column ?? 0}:${warningMessage}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        warnings.push({
          code: 'policy-authorizations-deny-unknown-tool',
          message: warningMessage,
          line: location?.line ?? (denyEntryNode as any)?.location?.start?.line ?? line,
          column: location?.column ?? (denyEntryNode as any)?.location?.start?.column ?? column,
          suggestion: closestToolName
            ? `Use "${closestToolName}" if that was the intended tool name, or add validation context that defines "${deniedTool}".`
            : `Add validation context that defines "${deniedTool}", or update policy.authorizations.deny.`
        });
      }
    }
  }

  return { errors, warnings };
}

type PolicyAuthorizationValidationTarget = {
  authorizationsNode: unknown;
  rawAuthorizations: unknown;
};

interface TopLevelStaticBinding {
  node: unknown;
}

function collectPolicyAuthorizationTargets(
  node: unknown,
  bindings: ReadonlyMap<string, TopLevelStaticBinding>,
  stack: Set<string> = new Set<string>()
): PolicyAuthorizationValidationTarget[] {
  const unwrapped = unwrapSingleNodeArray(node);
  if (!unwrapped || typeof unwrapped !== 'object') {
    return [];
  }

  const nodeType = getNodeObjectType(unwrapped);
  if (nodeType === 'object' || nodeType === 'ObjectExpression') {
    const authorizationsNode = getObjectEntryValue(unwrapped, 'authorizations');
    if (authorizationsNode === undefined) {
      return [];
    }

    const rawAuthorizations = extractStaticValue(authorizationsNode);
    return rawAuthorizations === undefined
      ? []
      : [{ authorizationsNode, rawAuthorizations }];
  }

  const typedNode = unwrapped as Record<string, unknown>;
  if (typedNode.type === 'VariableReference' && typeof typedNode.identifier === 'string') {
    if (Array.isArray(typedNode.pipes) && typedNode.pipes.length > 0) {
      return [];
    }

    const binding = bindings.get(typedNode.identifier);
    if (!binding || stack.has(typedNode.identifier)) {
      return [];
    }

    const bindingNode = applyStaticFieldAccessToNode(
      binding.node,
      typedNode.fields as readonly unknown[] | undefined
    );
    if (bindingNode === undefined) {
      return [];
    }

    const nextStack = new Set(stack);
    nextStack.add(typedNode.identifier);
    return collectPolicyAuthorizationTargets(bindingNode, bindings, nextStack);
  }

  if (typedNode.type === 'union' && Array.isArray(typedNode.args)) {
    const targets: PolicyAuthorizationValidationTarget[] = [];

    for (const arg of typedNode.args as Array<Record<string, unknown>>) {
      if (arg?.type !== 'ref' || typeof arg.name !== 'string') {
        continue;
      }
      if (stack.has(arg.name)) {
        continue;
      }

      const binding = bindings.get(arg.name);
      if (!binding) {
        continue;
      }

      const nextStack = new Set(stack);
      nextStack.add(arg.name);
      targets.push(...collectPolicyAuthorizationTargets(binding.node, bindings, nextStack));
    }

    return targets;
  }

  return [];
}

type StaticResolutionFailure =
  | 'dynamic'
  | 'unsupported'
  | 'unresolved-binding';

type StaticResolutionResult =
  | { ok: true; value: unknown }
  | { ok: false; failure: StaticResolutionFailure };

function buildTopLevelStaticBindings(ast: MlldNode[]): Map<string, TopLevelStaticBinding> {
  const bindings = new Map<string, TopLevelStaticBinding>();

  for (const node of ast) {
    if (!node || typeof node !== 'object' || node.type !== 'Directive') {
      continue;
    }

    if (node.kind === 'var') {
      const name = (node as any).values?.identifier?.[0]?.identifier;
      const valueNode = (node as any).values?.value;
      if (typeof name === 'string' && valueNode !== undefined) {
        bindings.set(name, { node: valueNode });
      }
      continue;
    }

    if (node.kind === 'policy') {
      const name = extractText((node as any).values?.name) || (node as any).raw?.name;
      const exprNode = (node as any).values?.expr;
      if (typeof name === 'string' && exprNode !== undefined) {
        bindings.set(name.replace(/^@/, ''), { node: exprNode });
      }
    }
  }

  return bindings;
}

function getStaticObjectEntryNode(node: unknown, key: string): unknown {
  if (Array.isArray(node) && node.length === 1) {
    return getStaticObjectEntryNode(node[0], key);
  }
  return getObjectEntryValue(node, key);
}

function applyStaticFieldAccessToNode(
  node: unknown,
  fields: readonly unknown[] | undefined
): unknown {
  let current = unwrapSingleNodeArray(node);

  for (const field of fields ?? []) {
    const accessor = readStaticFieldAccessor(field);
    if (typeof accessor !== 'string') {
      return undefined;
    }

    current = getStaticObjectEntryNode(current, accessor);
    if (current === undefined) {
      return undefined;
    }
  }

  return current;
}

function getStaticAuthorizableIntentFieldNode(
  node: unknown,
  bindings: ReadonlyMap<string, TopLevelStaticBinding>,
  stack: Set<string> = new Set<string>()
): unknown {
  const unwrapped = unwrapSingleNodeArray(node);
  if (!unwrapped || typeof unwrapped !== 'object') {
    return undefined;
  }

  const typedNode = unwrapped as Record<string, unknown>;
  if (typedNode.type === 'VariableReference' && typeof typedNode.identifier === 'string') {
    if (Array.isArray(typedNode.pipes) && typedNode.pipes.length > 0) {
      return undefined;
    }

    const binding = bindings.get(typedNode.identifier);
    if (!binding || stack.has(typedNode.identifier)) {
      return undefined;
    }

    const bindingNode = applyStaticFieldAccessToNode(
      binding.node,
      typedNode.fields as readonly unknown[] | undefined
    );
    if (bindingNode === undefined) {
      return undefined;
    }

    const nextStack = new Set(stack);
    nextStack.add(typedNode.identifier);
    return getStaticAuthorizableIntentFieldNode(bindingNode, bindings, nextStack);
  }

  const authorizationsNode = getStaticObjectEntryNode(unwrapped, 'authorizations');
  const containerNode = authorizationsNode ?? unwrapped;
  return getFirstObjectEntryValue(containerNode, 'can_authorize', 'authorizable');
}

function readStaticFieldAccessor(field: unknown): string | number | undefined {
  if (!field || typeof field !== 'object') {
    return undefined;
  }

  const typedField = field as Record<string, unknown>;
  if (typedField.type === 'field' && typeof typedField.value === 'string') {
    return typedField.value;
  }
  if (typedField.type === 'numericField' && typeof typedField.value === 'number') {
    return typedField.value;
  }
  if (typedField.type === 'arrayIndex' && typeof typedField.value === 'number') {
    return typedField.value;
  }
  if (
    typedField.type === 'bracketAccess'
    && (typeof typedField.value === 'string' || typeof typedField.value === 'number')
  ) {
    return typedField.value;
  }
  return undefined;
}

function applyStaticFieldAccess(
  value: unknown,
  fields: readonly unknown[] | undefined
): StaticResolutionResult {
  let current = value;

  for (const field of fields ?? []) {
    const accessor = readStaticFieldAccessor(field);
    if (accessor === undefined) {
      return { ok: false, failure: 'unsupported' };
    }

    if (current === null || current === undefined) {
      return { ok: false, failure: 'unresolved-binding' };
    }

    if (typeof accessor === 'number') {
      if (Array.isArray(current)) {
        if (accessor < 0 || accessor >= current.length) {
          return { ok: false, failure: 'unresolved-binding' };
        }
        current = current[accessor];
        continue;
      }

      if (typeof current === 'object' && current !== null && accessor in (current as Record<number, unknown>)) {
        current = (current as Record<number, unknown>)[accessor];
        continue;
      }

      return { ok: false, failure: 'unresolved-binding' };
    }

    if (typeof current === 'object' && current !== null && accessor in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[accessor];
      continue;
    }

    return { ok: false, failure: 'unresolved-binding' };
  }

  return { ok: true, value: current };
}

function resolveStaticExpression(
  node: unknown,
  bindings: ReadonlyMap<string, TopLevelStaticBinding>,
  stack: Set<string> = new Set<string>(),
  currentObjectKey?: string
): StaticResolutionResult {
  if (node === null || node === undefined) {
    return { ok: true, value: node };
  }

  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return { ok: true, value: node };
  }

  if (Array.isArray(node)) {
    const isSingleAstWrapper =
      node.length === 1 &&
      node[0] !== null &&
      typeof node[0] === 'object' &&
      !Array.isArray(node[0]) &&
      'type' in (node[0] as Record<string, unknown>);

    if (isSingleAstWrapper) {
      return resolveStaticExpression(node[0], bindings, stack, currentObjectKey);
    }

    const resolvedParts: unknown[] = [];
    for (const part of node) {
      const resolved = resolveStaticExpression(part, bindings, stack, currentObjectKey);
      if (!resolved.ok) {
        return resolved;
      }
      resolvedParts.push(resolved.value);
    }

    if (resolvedParts.every(part => typeof part === 'string')) {
      return { ok: true, value: resolvedParts.join('') };
    }

    return { ok: true, value: resolvedParts };
  }

  if (typeof node !== 'object') {
    return { ok: false, failure: 'dynamic' };
  }

  const typedNode = node as Record<string, unknown>;

  if (Array.isArray(typedNode.content)) {
    const resolvedContent = resolveStaticExpression(typedNode.content, bindings, stack, currentObjectKey);
    if (resolvedContent.ok) {
      return resolvedContent;
    }
  }

  if (typedNode.type === 'Literal') {
    return { ok: true, value: typedNode.value };
  }

  if (typedNode.type === 'Text') {
    return typeof typedNode.content === 'string'
      ? { ok: true, value: typedNode.content }
      : { ok: false, failure: 'unsupported' };
  }

  if (typedNode.type === 'VariableReference' && typeof typedNode.identifier === 'string') {
    if (Array.isArray(typedNode.pipes) && typedNode.pipes.length > 0) {
      return { ok: false, failure: 'dynamic' };
    }

    if (
      currentObjectKey === 'mlld'
      || currentObjectKey === 'inputs'
    ) {
      return { ok: true, value: `@${typedNode.identifier}` };
    }

    if (
      currentObjectKey === 'bind'
      && (!Array.isArray(typedNode.fields) || typedNode.fields.length === 0)
    ) {
      return { ok: true, value: true };
    }

    const binding = bindings.get(typedNode.identifier);
    if (!binding) {
      return { ok: false, failure: 'unresolved-binding' };
    }

    if (stack.has(typedNode.identifier)) {
      return { ok: false, failure: 'dynamic' };
    }

    const nextStack = new Set(stack);
    nextStack.add(typedNode.identifier);

    const resolvedBinding = resolveStaticExpression(binding.node, bindings, nextStack);
    if (!resolvedBinding.ok) {
      return resolvedBinding;
    }

    return applyStaticFieldAccess(resolvedBinding.value, typedNode.fields as readonly unknown[] | undefined);
  }

  if (typedNode.type === 'array' && Array.isArray(typedNode.items)) {
    const resolvedItems: unknown[] = [];
    for (const item of typedNode.items) {
      const resolved = resolveStaticExpression(item, bindings, stack, currentObjectKey);
      if (!resolved.ok) {
        return resolved;
      }
      resolvedItems.push(resolved.value);
    }
    return { ok: true, value: resolvedItems };
  }

  if (typedNode.type === 'object' && Array.isArray(typedNode.entries)) {
    if (currentObjectKey === 'bind') {
      const result: Record<string, unknown> = {};
      for (const entry of typedNode.entries as Array<Record<string, unknown>>) {
        if ((entry.type !== 'pair' && entry.type !== 'conditionalPair') || typeof entry.key !== 'string') {
          return { ok: false, failure: 'unsupported' };
        }
        result[entry.key] = true;
      }
      return { ok: true, value: result };
    }

    const result: Record<string, unknown> = {};
    for (const entry of typedNode.entries as Array<Record<string, unknown>>) {
      if ((entry.type !== 'pair' && entry.type !== 'conditionalPair') || typeof entry.key !== 'string') {
        return { ok: false, failure: 'unsupported' };
      }

      const resolved = resolveStaticExpression(entry.value, bindings, stack, entry.key);
      if (!resolved.ok) {
        return resolved;
      }
      result[entry.key] = resolved.value;
    }
    return { ok: true, value: result };
  }

  if (typedNode.type === 'ObjectExpression' && typedNode.properties && typeof typedNode.properties === 'object') {
    if (currentObjectKey === 'bind') {
      return {
        ok: true,
        value: Object.fromEntries(
          Object.keys(typedNode.properties as Record<string, unknown>).map(key => [key, true])
        )
      };
    }

    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(typedNode.properties as Record<string, unknown>)) {
      const resolved = resolveStaticExpression(entryValue, bindings, stack, entryKey);
      if (!resolved.ok) {
        return resolved;
      }
      result[entryKey] = resolved.value;
    }
    return { ok: true, value: result };
  }

  return { ok: false, failure: 'dynamic' };
}

function resolveStaticPolicySetTargetMembers(
  target: RecordPolicySetTarget,
  bindings: ReadonlyMap<string, TopLevelStaticBinding>
): readonly unknown[] | undefined {
  if (target.kind === 'array') {
    return [...target.values];
  }

  const binding = bindings.get(target.name);
  if (!binding) {
    return undefined;
  }

  const resolved = resolveStaticExpression(binding.node, bindings);
  if (!resolved.ok) {
    return undefined;
  }

  if (Array.isArray(resolved.value)) {
    return resolved.value;
  }

  return resolved.value === undefined ? [] : [resolved.value];
}

function classifyPolicyCallSource(node: unknown): PolicyCallSourceKind {
  if (!node || typeof node !== 'object') {
    return 'unknown';
  }

  const typedNode = node as Record<string, unknown>;
  if (typedNode.type === 'VariableReference' && typeof typedNode.identifier === 'string') {
    return Array.isArray(typedNode.fields) && typedNode.fields.length > 0
      ? 'field_access'
      : 'top_level_var';
  }

  return 'inline';
}

function mapResolutionFailureToSkipReason(
  failure: StaticResolutionFailure,
  kind: 'intent' | 'tools' | 'task'
): PolicyCallSkipReason {
  if (failure === 'unsupported') {
    return 'unsupported-expression';
  }
  if (failure === 'unresolved-binding') {
    return 'unresolved-top-level-binding';
  }
  return kind === 'intent'
    ? 'dynamic-source-intent'
    : kind === 'tools'
      ? 'dynamic-source-tools'
      : 'dynamic-source-task';
}

function normalizeStaticStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return null;
    }
    const trimmed = entry.trim();
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized;
}

function buildStaticToolContext(
  toolsValue: unknown,
  contextExecutables: ReadonlyMap<string, ValidationContextExecutable>
): Map<string, ValidationContextExecutable> | null {
  if (!isPlainObject(toolsValue)) {
    return null;
  }

  const byName = new Map<string, ValidationContextExecutable>();

  for (const [toolName, rawToolEntry] of Object.entries(toolsValue)) {
    if (!isPlainObject(rawToolEntry)) {
      return null;
    }

    const mlldValue = rawToolEntry.mlld;
    if (typeof mlldValue !== 'string' || !mlldValue.startsWith('@')) {
      return null;
    }

    const executableName = mlldValue.slice(1).trim();
    const baseExecutable = contextExecutables.get(toolName) ?? contextExecutables.get(executableName);
    if (!baseExecutable) {
      return null;
    }

    const target = cloneValidationContextExecutable(baseExecutable, toolName);

    const labelsValue = rawToolEntry.labels;
    if (labelsValue !== undefined) {
      const labels = normalizeStaticStringList(labelsValue);
      if (!labels) {
        return null;
      }
      for (const label of labels) {
        target.labels.add(label);
      }
    }

    byName.set(toolName, target);
  }

  return byName;
}

function extractDeniedToolsFromStaticPolicy(policyValue: unknown): readonly string[] | undefined {
  if (!isPlainObject(policyValue)) {
    return undefined;
  }

  const authorizations = isPlainObject(policyValue.authorizations)
    ? policyValue.authorizations
    : undefined;
  if (!authorizations || !Array.isArray(authorizations.deny)) {
    return undefined;
  }

  const deny = authorizations.deny
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim());
  return deny.length > 0 ? deny : undefined;
}

function toPolicyCallDiagnostic(
  issue: StaticPolicyCallIssue | PolicyAuthorizationIssue
): PolicyCallDiagnostic {
  if ('reason' in issue) {
    return {
      reason: issue.reason,
      message: issue.message,
      ...(issue.tool ? { tool: issue.tool } : {}),
      ...(issue.arg ? { arg: issue.arg } : {}),
      ...(typeof issue.element === 'number' ? { element: issue.element } : {})
    };
  }

  return {
    reason: issue.code,
    message: issue.message,
    ...(issue.tool ? { tool: issue.tool } : {}),
    ...(issue.arg ? { arg: issue.arg } : {})
  };
}

function collectPolicyCallDiagnostics(
  ast: MlldNode[],
  contextExecutables: ReadonlyMap<string, ValidationContextExecutable>
): {
  errors: AnalysisError[];
  policyCalls: PolicyCallInfo[];
} {
  const errors: AnalysisError[] = [];
  const policyCalls: PolicyCallInfo[] = [];
  const bindings = buildTopLevelStaticBindings(ast);

  walkAST(ast, node => {
    if (node.type !== 'ExecInvocation') {
      return;
    }

    const invocationName = readExecInvocationQualifiedName(node);
    if (invocationName !== 'policy.build' && invocationName !== 'policy.validate') {
      return;
    }

    const invocation = node as Record<string, any>;
    const invocationArgs = readExecInvocationArgs(node);
    const line = invocation.location?.start?.line;
    const column = invocation.location?.start?.column;

    const intentArg = invocationArgs[0];
    const toolsArg = invocationArgs[1];
    const optionsArg = invocationArgs[2];

    const callInfoBase: Omit<PolicyCallInfo, 'status'> = {
      callee: invocationName === 'policy.build' ? '@policy.build' : '@policy.validate',
      location: { line, column },
      intentSource: classifyPolicyCallSource(intentArg),
      toolsSource: classifyPolicyCallSource(toolsArg),
      taskSource: 'unknown'
    };
    const staticAuthorizableIntentNode = getStaticAuthorizableIntentFieldNode(intentArg, bindings);
    const invalidAuthorizableIntentMessage =
      `${callInfoBase.callee} intent cannot include can_authorize; declare policy.authorizations.can_authorize on the base policy instead`;

    const resolvedIntent = resolveStaticExpression(intentArg, bindings);
    if (!resolvedIntent.ok) {
      if (staticAuthorizableIntentNode !== undefined) {
        const diagnostics: PolicyCallDiagnostic[] = [
          {
            reason: 'invalid_authorization',
            message: invalidAuthorizableIntentMessage
          }
        ];

        policyCalls.push({
          ...callInfoBase,
          status: 'analyzed',
          diagnostics
        });
        errors.push({
          message: invalidAuthorizableIntentMessage,
          line: (staticAuthorizableIntentNode as any)?.location?.start?.line ?? line,
          column: (staticAuthorizableIntentNode as any)?.location?.start?.column ?? column
        });
        return;
      }

      policyCalls.push({
        ...callInfoBase,
        status: 'skipped',
        skipReason: mapResolutionFailureToSkipReason(resolvedIntent.failure, 'intent')
      });
      return;
    }

    const resolvedTools = resolveStaticExpression(toolsArg, bindings);
    if (!resolvedTools.ok) {
      policyCalls.push({
        ...callInfoBase,
        status: 'skipped',
        skipReason: mapResolutionFailureToSkipReason(resolvedTools.failure, 'tools')
      });
      return;
    }

    const toolContext = buildStaticToolContext(resolvedTools.value, contextExecutables);
    if (!toolContext) {
      policyCalls.push({
        ...callInfoBase,
        status: 'skipped',
        skipReason: 'dynamic-source-tools'
      });
      return;
    }

    let taskText: string | undefined;
    let taskSource: PolicyCallSourceKind = 'unknown';
    if (optionsArg !== undefined) {
      const optionsValue = resolveStaticExpression(optionsArg, bindings);
      if (!optionsValue.ok || !isPlainObject(optionsValue.value)) {
        policyCalls.push({
          ...callInfoBase,
          status: 'skipped',
          skipReason: mapResolutionFailureToSkipReason(optionsValue.ok ? 'unsupported' : optionsValue.failure, 'task')
        });
        return;
      }

      if (Object.prototype.hasOwnProperty.call(optionsValue.value, 'task')) {
        const taskNode =
          optionsArg && typeof optionsArg === 'object'
            ? getStaticObjectEntryNode(optionsArg, 'task')
            : undefined;
        taskSource = classifyPolicyCallSource(taskNode);
        const resolvedTask = resolveStaticExpression(taskNode, bindings);
        if (!resolvedTask.ok) {
          policyCalls.push({
            ...callInfoBase,
            taskSource,
            status: 'skipped',
            skipReason: mapResolutionFailureToSkipReason(resolvedTask.failure, 'task')
          });
          return;
        }

        if (resolvedTask.value === null || resolvedTask.value === '') {
          taskText = undefined;
        } else if (typeof resolvedTask.value === 'string') {
          taskText = resolvedTask.value;
        } else {
          policyCalls.push({
            ...callInfoBase,
            taskSource,
            status: 'skipped',
            skipReason: 'unsupported-expression'
          });
          return;
        }
      }
    }

    const intentDiagnostics: PolicyCallDiagnostic[] = [];
    if (staticAuthorizableIntentNode !== undefined || hasStaticAuthorizableIntent(resolvedIntent.value)) {
      intentDiagnostics.push({
        reason: 'invalid_authorization',
        message: invalidAuthorizableIntentMessage
      });
    }

    let deniedTools: readonly string[] | undefined;
    const policyNode = getWithClauseField(invocation.withClause, 'policy');
    if (policyNode !== undefined) {
      const resolvedPolicy = resolveStaticExpression(policyNode, bindings);
      if (resolvedPolicy.ok) {
        deniedTools = extractDeniedToolsFromStaticPolicy(resolvedPolicy.value);
      }
    }

    const staticAnalysis = analyzeStaticPolicyAuthorizationIntent({
      rawIntent: resolvedIntent.value,
      toolContext,
      taskText,
      resolvePolicySetTargetMembers: target =>
        resolveStaticPolicySetTargetMembers(target, bindings)
    });
    const authorizationValidation = validatePolicyAuthorizations(
      staticAnalysis.rawAuthorizations,
      toolContext,
      {
        requireKnownTools: true,
        requireControlArgsMetadata: true,
        ...(deniedTools ? { deniedTools } : {})
      }
    );

    const diagnostics = [
      ...intentDiagnostics,
      ...staticAnalysis.issues.map(issue => toPolicyCallDiagnostic(issue)),
      ...authorizationValidation.errors.map(issue => toPolicyCallDiagnostic(issue))
    ];

    policyCalls.push({
      ...callInfoBase,
      taskSource,
      status: 'analyzed',
      ...(diagnostics.length > 0 ? { diagnostics } : {})
    });

    for (const diagnostic of diagnostics) {
      errors.push({
        message: diagnostic.message,
        line,
        column
      });
    }
  });

  return { errors, policyCalls };
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

        const rawLabels = exeNode.values?.securityLabels ?? exeNode.meta?.securityLabels;
        if (Array.isArray(rawLabels)) {
          const labels = rawLabels
            .filter((label: unknown): label is string => typeof label === 'string' && label.trim().length > 0)
            .map((label: string) => label.trim());
          if (labels.length > 0) {
            exec.labels = labels;
          }
        }

        const controlArgs = extractStaticExecutableArgList(
          getWithClauseField(exeNode.values?.withClause, 'controlArgs'),
          exec.params ?? [],
          'controlArgs'
        ).value;
        if (controlArgs && controlArgs.length > 0) {
          exec.controlArgs = controlArgs;
        }

        const updateArgs = extractStaticExecutableArgList(
          getWithClauseField(exeNode.values?.withClause, 'updateArgs'),
          exec.params ?? [],
          'updateArgs'
        ).value;
        if (updateArgs && updateArgs.length > 0) {
          exec.updateArgs = updateArgs;
        }

        const exactPayloadArgs = extractStaticExecutableArgList(
          getWithClauseField(exeNode.values?.withClause, 'exactPayloadArgs'),
          exec.params ?? [],
          'exactPayloadArgs'
        ).value;
        if (exactPayloadArgs && exactPayloadArgs.length > 0) {
          exec.exactPayloadArgs = exactPayloadArgs;
        }

        const sourceArgs = extractStaticExecutableArgList(
          getWithClauseField(exeNode.values?.withClause, 'sourceArgs'),
          exec.params ?? [],
          'sourceArgs'
        ).value;
        if (sourceArgs && sourceArgs.length > 0) {
          exec.sourceArgs = sourceArgs;
        }

        const correlateControlArgs = extractStaticExecutableBoolean(
          getWithClauseField(exeNode.values?.withClause, 'correlateControlArgs'),
          'correlateControlArgs'
        ).value;
        if (correlateControlArgs !== undefined) {
          exec.correlateControlArgs = correlateControlArgs;
        }

        const outputRecord = extractExecutableOutputRecordInfo(exeNode);
        if (outputRecord) {
          exec.outputRecord = outputRecord;
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
function extractGuards(ast: MlldNode[], sourceText: string): GuardInfo[] {
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
          filter: typeof guardNode.raw?.filter === 'string' ? guardNode.raw.filter : '',
          timing: typeof timing === 'string'
            ? timing
            : (guardNode.subtype === 'guardBefore' ? 'before' : 'after')
        };

        if (guardNode.meta?.privileged === true) {
          guard.privileged = true;
        }

        // Extract label if present
        if (guardNode.values?.label) {
          const label = extractText(guardNode.values.label);
          if (label) guard.label = label;
        }

        const guardBlock = guardNode.values?.guard?.[0];
        if (guardBlock && Array.isArray(guardBlock.rules)) {
          const arms: GuardArmInfo[] = [];
          for (const entry of guardBlock.rules as Array<Record<string, unknown>>) {
            if (entry.type !== 'GuardRule' || !entry.action || typeof entry.action !== 'object') {
              continue;
            }

            const action = entry.action as Record<string, unknown>;
            const decision = action.decision;
            if (
              decision !== 'allow' &&
              decision !== 'deny' &&
              decision !== 'retry' &&
              decision !== 'resume' &&
              decision !== 'prompt' &&
              decision !== 'env'
            ) {
              continue;
            }

            arms.push({
              condition: entry.isWildcard === true ? '*' : extractGuardConditionText(entry.condition, sourceText),
              action: decision,
              reason: typeof action.message === 'string' ? action.message : undefined,
              line: (entry as any)?.location?.start?.line,
              column: (entry as any)?.location?.start?.column
            });
          }

          if (arms.length > 0) {
            guard.arms = arms;
          }
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
  const commandNeeds = new Set<string>();

  const addCommandNeed = (commandName: unknown): void => {
    if (typeof commandName !== 'string') {
      return;
    }
    const normalized = commandName.trim();
    if (!normalized) {
      return;
    }
    needs.cmd = needs.cmd || [];
    commandNeeds.add(normalized);
  };

  const addCommandNeedsFromValue = (value: unknown): void => {
    if (!value) {
      return;
    }

    if (typeof value === 'string') {
      addCommandNeed(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        addCommandNeed(entry);
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    if (Array.isArray(record.__commands)) {
      for (const command of record.__commands) {
        addCommandNeed(command);
      }
    }

    const cmdValue = record.cmd;
    if (!cmdValue || typeof cmdValue !== 'object') {
      return;
    }

    const cmdRecord = cmdValue as Record<string, unknown>;
    if (cmdRecord.type === 'list' && Array.isArray(cmdRecord.items)) {
      for (const command of cmdRecord.items) {
        addCommandNeed(command);
      }
      return;
    }

    if (cmdRecord.type === 'map' && cmdRecord.entries && typeof cmdRecord.entries === 'object') {
      for (const command of Object.keys(cmdRecord.entries as Record<string, unknown>)) {
        addCommandNeed(command);
      }
      return;
    }

    if (Array.isArray(cmdRecord.list)) {
      for (const command of cmdRecord.list) {
        addCommandNeed(command);
      }
    }
  };

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
          } else {
            addCommandNeedsFromValue(need);
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
      addCommandNeedsFromValue(needsRecord);
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
  const detectedCommands = detector.detectShellCommands(ast);

  for (const need of runtimeNeeds) {
    addNeed(need);
  }
  for (const command of detectedCommands) {
    addCommandNeed(command);
  }

  if (needs.cmd) {
    needs.cmd = Array.from(commandNeeds).sort();
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
      const guards = extractGuards(ast, content);
      const policies = extractPolicies(ast);
      const recordExtraction = extractRecordsAndDiagnostics(ast, filepath);
      const availableRecordDefinitions = await buildAvailableRecordDefinitionsForValidation(
        filepath,
        ast,
        recordExtraction.definitions
      );
      const sessionExtraction = extractSessionsAndDiagnostics(
        ast,
        filepath,
        availableRecordDefinitions
      );
      const availableSessionDefinitions = await buildAvailableSessionDefinitionsForValidation(
        filepath,
        ast,
        sessionExtraction.definitions,
        availableRecordDefinitions
      );
      const recordsForShelfValidation = new Map<string, Pick<RecordDefinition, 'key'>>();
      for (const [recordName, recordDefinition] of availableRecordDefinitions) {
        recordsForShelfValidation.set(recordName, { key: recordDefinition.key });
      }
      const shelfExtraction = extractShelvesAndDiagnostics(ast, filepath, recordsForShelfValidation);
      const needs = extractNeeds(content, ast);
      const checkpointErrors = detectCheckpointDirectiveErrors(ast);
      const executableDefinitionErrors = collectExecutableDefinitionDiagnostics(ast);
      const toolCatalogDiagnostics = collectToolCatalogDiagnostics(
        ast,
        executables,
        availableRecordDefinitions
      );
      const outputRecordErrors = collectExecutableOutputRecordDiagnostics(
        ast,
        availableRecordDefinitions,
        recordExtraction.declaredNames
      );
      const castErrors = collectCastDiagnostics(
        ast,
        availableRecordDefinitions,
        recordExtraction.declaredNames
      );
      const sessionScopedRuntimeErrors = collectSessionScopedRuntimeDiagnostics(
        ast,
        filepath,
        availableSessionDefinitions
      );
      const boxShelfScopeErrors = collectBoxShelfScopeDiagnostics(
        ast,
        filepath,
        shelfExtraction.definitions
      );
      const contextExecutables = await buildValidationContextExecutables(
        filepath,
        ast,
        options.context
      );
      const policyAuthorizationDiagnostics = collectPolicyAuthorizationDiagnostics(
        ast,
        contextExecutables
      );
      const policyCallDiagnostics = collectPolicyCallDiagnostics(
        ast,
        contextExecutables
      );

      if (executables.length > 0) result.executables = executables;
      if (exports.length > 0) result.exports = exports;
      if (imports.length > 0) result.imports = imports;
      if (guards.length > 0) result.guards = guards;
      if (policies.length > 0) result.policies = policies;
      if (policyCallDiagnostics.policyCalls.length > 0) result.policyCalls = policyCallDiagnostics.policyCalls;
      if (recordExtraction.records.length > 0) result.records = recordExtraction.records;
      if (shelfExtraction.shelves.length > 0) result.shelves = shelfExtraction.shelves;
      if (sessionExtraction.sessions.length > 0) result.sessions = sessionExtraction.sessions;
      if (needs) result.needs = needs;
      if (checkpointErrors.length > 0) {
        result.valid = false;
        result.errors = checkpointErrors;
        return result;
      }
      if (recordExtraction.errors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...recordExtraction.errors
        ];
      }
      if (shelfExtraction.errors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...shelfExtraction.errors
        ];
      }
      if (sessionExtraction.errors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...sessionExtraction.errors
        ];
      }
      if (executableDefinitionErrors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...executableDefinitionErrors
        ];
      }
      if (toolCatalogDiagnostics.errors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...toolCatalogDiagnostics.errors
        ];
      }
      if (outputRecordErrors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...outputRecordErrors
        ];
      }
      if (castErrors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...castErrors
        ];
      }
      if (sessionScopedRuntimeErrors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...sessionScopedRuntimeErrors
        ];
      }
      if (boxShelfScopeErrors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...boxShelfScopeErrors
        ];
      }
      if (policyAuthorizationDiagnostics.errors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...policyAuthorizationDiagnostics.errors
        ];
      }
      if (policyCallDiagnostics.errors.length > 0) {
        result.valid = false;
        result.errors = [
          ...(result.errors ?? []),
          ...policyCallDiagnostics.errors
        ];
      }

      const suppressedWarningCodes = await loadSuppressedWarningCodes(filepath);

      // Check for undefined variables (enabled by default)
      if (options.checkVariables !== false) {
        const resolverPrefixVariables = await loadResolverPrefixVariables(filepath);

        const warnings = dedupeUndefinedVariableWarnings([
          ...detectUndefinedVariables(ast, content, resolverPrefixVariables),
          ...detectPassThroughOptionalParameterWarnings(ast)
        ]);
        if (warnings.length > 0) {
          result.warnings = warnings;
        }

        // Check for variable redefinitions in nested scopes
        const redefinitions = detectVariableRedefinitions(ast);
        if (redefinitions.length > 0) {
          result.redefinitions = redefinitions;
        }
      }

      if (options.checkVariables === false) {
        const redefinitions = detectVariableRedefinitions(ast);
        if (redefinitions.length > 0) {
          result.redefinitions = redefinitions;
        }
      }

      const surfacedToolExeNames = collectSurfacedToolExeNames(ast);
      const antiPatterns = dedupeAntiPatternWarnings([
        ...detectDeprecatedJsonTransformAntiPatterns(ast),
        ...detectExeParameterShadowingWarnings(ast),
        ...detectForWhenStaticConditionWarnings(ast),
        ...detectDirectTextDataOnExecResult(ast),
        ...detectHyphenatedIdentifiersInTemplates(ast),
        ...detectPrivilegedWildcardAllowWarnings(ast),
        ...detectUnreachableGuardArmWarnings(ast, content),
        ...detectUnknownPolicyRuleWarnings(ast),
        ...detectPrivilegedGuardWithoutPolicyOperationWarnings(ast, policies),
        ...detectPolicyDeclarationWarnings(ast, policies, contextExecutables),
        ...(contextExecutables.size > 0 ? detectGuardContextWarnings(ast, contextExecutables) : []),
        ...detectThinArrowReturnAntiPatterns(ast, surfacedToolExeNames),
        ...toolCatalogDiagnostics.warnings,
        ...policyAuthorizationDiagnostics.warnings
      ]).filter(warning => !suppressedWarningCodes.has(warning.code));
      if (antiPatterns.length > 0) {
        result.antiPatterns = antiPatterns;
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
    console.log(`${label('executables')}`);
    for (const executable of result.executables) {
      const params = executable.params && executable.params.length > 0
        ? `(${executable.params.join(', ')})`
        : '()';
      const labels = executable.labels && executable.labels.length > 0
        ? ` ${chalk.dim(`[${executable.labels.join(', ')}]`)}`
        : '';
      const metadata: string[] = [];
      if (executable.controlArgs && executable.controlArgs.length > 0) {
        metadata.push(`controlArgs=${executable.controlArgs.join(', ')}`);
      }
      if (executable.updateArgs && executable.updateArgs.length > 0) {
        metadata.push(`updateArgs=${executable.updateArgs.join(', ')}`);
      }
      if (executable.exactPayloadArgs && executable.exactPayloadArgs.length > 0) {
        metadata.push(`exactPayloadArgs=${executable.exactPayloadArgs.join(', ')}`);
      }
      if (executable.sourceArgs && executable.sourceArgs.length > 0) {
        metadata.push(`sourceArgs=${executable.sourceArgs.join(', ')}`);
      }
      if (executable.correlateControlArgs === true) {
        metadata.push('correlateControlArgs=true');
      }
      if (executable.outputRecord?.kind === 'static' && executable.outputRecord.name) {
        metadata.push(`outputRecord=@${executable.outputRecord.name}`);
      }
      if (executable.outputRecord?.kind === 'dynamic' && executable.outputRecord.ref) {
        metadata.push(`outputRecord=${executable.outputRecord.ref}`);
      }
      const metadataText = metadata.length > 0
        ? ` ${chalk.dim(`{ ${metadata.join('; ')} }`)}`
        : '';
      console.log(`  ${executable.name}${params}${labels}${metadataText}`);
    }
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
      const labelText = guard.label ? ` [${guard.label}]` : '';
      const filterText = guard.filter ? ` ${chalk.dim(`filter=${guard.filter}`)}` : '';
      const privilegedText = guard.privileged ? ` ${chalk.yellow('[privileged]')}` : '';
      console.log(`  ${guard.name} (${guard.timing})${labelText}${filterText}${privilegedText}`);
      for (const arm of guard.arms ?? []) {
        const reasonText = arm.reason ? ` ${chalk.dim(`"${arm.reason}"`)}` : '';
        console.log(`    ${arm.condition} => ${arm.action}${reasonText}`);
      }
    }
  }

  if (result.policies && result.policies.length > 0) {
    console.log(`${label('policies')}`);
    for (const policy of result.policies) {
      const attributes: string[] = [];
      if (policy.rules && policy.rules.length > 0) {
        attributes.push(`rules=${policy.rules.join(', ')}`);
      }
      if (policy.locked !== undefined) {
        attributes.push(`locked=${String(policy.locked)}`);
      }
      if (policy.refs && policy.refs.length > 0) {
        attributes.push(`refs=${policy.refs.join(', ')}`);
      }

      console.log(`  ${policy.name}${attributes.length > 0 ? ` ${chalk.dim(`(${attributes.join('; ')})`)}` : ''}`);

      if (policy.operations && Object.keys(policy.operations).length > 0) {
        for (const [operation, labels] of Object.entries(policy.operations)) {
          console.log(`    ${operation}: ${labels.join(', ')}`);
        }
      }
    }
  }

  if (result.records && result.records.length > 0) {
    console.log(`${label('records')}`);
    for (const record of result.records) {
      const attributes: string[] = [];
      if (record.key) {
        attributes.push(`key=${record.key}`);
      }
      if (record.rootMode) {
        attributes.push(`root=${record.rootMode}`);
      }
      if (record.display) {
        attributes.push(`display=${record.display}`);
      }
      if (record.fields && record.fields.length > 0) {
        attributes.push(`fields=${record.fields.map(field => field.name).join(', ')}`);
      }
      console.log(`  ${record.name}${attributes.length > 0 ? ` ${chalk.dim(`{ ${attributes.join('; ')} }`)}` : ''}`);
    }
  }

  if (result.shelves && result.shelves.length > 0) {
    console.log(`${label('shelves')}`);
    for (const shelf of result.shelves) {
      const slotSummary = shelf.slots
        .map(slot => {
          const suffix =
            slot.cardinality === 'collection'
              ? '[]'
              : slot.optional
                ? '?'
                : '';
          return `${slot.name}:${slot.record}${suffix}`;
        })
        .join(', ');
      console.log(`  ${shelf.name}${slotSummary ? ` ${chalk.dim(`{ ${slotSummary} }`)}` : ''}`);
    }
  }

  if (result.sessions && result.sessions.length > 0) {
    console.log(`${label('sessions')}`);
    for (const session of result.sessions) {
      const slotSummary = session.slots
        .map(slot => `${slot.name}:${slot.type}`)
        .join(', ');
      console.log(`  ${session.name}${slotSummary ? ` ${chalk.dim(`{ ${slotSummary} }`)}` : ''}`);
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

function dedupeAntiPatternWarnings(
  warnings: readonly AntiPatternWarning[]
): AntiPatternWarning[] {
  const byKey = new Map<string, AntiPatternWarning>();
  for (const warning of warnings) {
    const key = `${warning.code}:${warning.line ?? 0}:${warning.column ?? 0}:${warning.message}`;
    if (!byKey.has(key)) {
      byKey.set(key, warning);
    }
  }
  return Array.from(byKey.values());
}

function parseContextFlag(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === false) {
    return undefined;
  }
  return parseContextPaths(value);
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
  --context <paths>     Extra file(s)/dir(s) used to validate guard filters, ops, and args
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
  mlld validate guards.mld --context tools.mld
  mlld validate guards.mld --context tools/,shared/tooling.mld
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
      const context = parseContextFlag(flags.context);

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
        strictTemplateVariables: deep,
        context
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
