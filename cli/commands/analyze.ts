/**
 * Static Analysis CLI Command
 * Analyzes mlld modules without executing them
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors';
import { DependencyDetector } from '@core/utils/dependency-detector';
import { parseSync } from '@grammar/parser';
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

export interface AnalyzeResult {
  filepath: string;
  valid: boolean;
  errors?: AnalysisError[];
  warnings?: UndefinedVariableWarning[];
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
const BUILTIN_VARIABLES = new Set([
  // Reserved system variables
  'now', 'base', 'debug', 'INPUT', 'mx', 'fm',
  'payload', 'state', 'keychain',
  // Builtin transformers
  'json', 'md', 'xml', 'yaml', 'html', 'text', 'csv',
  'keep', 'keepStructured',
  // Pipeline context
  'input', 'ctx',
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
    }

    // for @item in ... (expression form, e.g., in var assignments)
    if (node.type === 'ForExpression') {
      if (node.variable?.identifier) {
        declared.add(node.variable.identifier);
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
      const name = extractText(guardNode.values?.name);

      if (name) {
        const guard: GuardInfo = {
          name,
          timing: guardNode.subtype === 'guardBefore' ? 'before' : 'after'
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
      result.errors = [{
        message: parseError.message,
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
      const warnings = detectUndefinedVariables(ast);
      if (warnings.length > 0) {
        result.warnings = warnings;
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

    // Exit with error if warnings found and errorOnWarnings is set
    if (options.errorOnWarnings && result.warnings && result.warnings.length > 0) {
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
Also checks for undefined variable references.

Options:
  --format <format>     Output format: json or text (default: text)
  --ast                 Include the parsed AST in output (requires --format json)
  --no-check-variables  Skip undefined variable checking
  --error-on-warnings   Exit with code 1 if warnings are found
  -h, --help            Show this help message

Examples:
  mlld validate module.mld                     # Validate with text output
  mlld validate module.mld --format json       # Validate with JSON output
  mlld validate module.mld --error-on-warnings # Fail on undefined variables
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
