import type { MlldNode, RunDirective, ExecDirective } from '@core/types';
import * as acorn from 'acorn';
import { simple as walkSimple } from 'acorn-walk';

/**
 * Detects runtime dependencies from mlld AST
 */
export class DependencyDetector {
  // Node.js built-in modules
  private readonly nodeBuiltins = new Set([
    'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
    'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
    'module', 'net', 'os', 'path', 'process', 'punycode', 'querystring',
    'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls',
    'tty', 'url', 'util', 'v8', 'vm', 'zlib', 'worker_threads', 'perf_hooks'
  ]);

  // Common shell commands to detect
  private readonly commonShellCommands = new Set([
    'curl', 'wget', 'git', 'grep', 'sed', 'awk', 'jq', 'find', 'xargs',
    'tar', 'gzip', 'zip', 'unzip', 'ssh', 'scp', 'rsync', 'docker',
    'kubectl', 'npm', 'yarn', 'pnpm', 'node', 'python', 'pip', 'make',
    'gcc', 'g++', 'clang', 'cmake', 'brew', 'apt', 'yum', 'dnf'
  ]);

  /**
   * Walk the AST recursively
   */
  private walkAST(nodes: MlldNode[], callback: (node: MlldNode) => void): void {
    for (const node of nodes) {
      callback(node);
      
      // Walk child nodes based on node structure
      if ('body' in node && Array.isArray(node.body)) {
        this.walkAST(node.body, callback);
      }
      if ('children' in node && Array.isArray(node.children)) {
        this.walkAST(node.children, callback);
      }
      if ('values' in node && node.values) {
        for (const key in node.values) {
          if (Array.isArray(node.values[key])) {
            this.walkAST(node.values[key], callback);
          }
        }
      }
    }
  }

  /**
   * Extract the language from a run directive
   */
  private extractRunLanguage(node: RunDirective): string | null {
    // Check if there's a language specification
    // Note: The field name is 'lang' not 'language' in the AST
    if (node.values?.lang && node.values.lang.length > 0) {
      const langNode = node.values.lang[0];
      if (langNode.type === 'Text') {
        const lang = langNode.content.toLowerCase();
        // Normalize language names
        if (lang === 'js' || lang === 'javascript') return 'js';
        if (lang === 'py' || lang === 'python') return 'py';
        if (lang === 'sh' || lang === 'bash' || lang === 'shell') return 'sh';
        return lang;
      }
    }
    
    // No language specified means it's a shell command
    // Both shell commands and shell code require 'sh' in needs
    return 'sh';
  }

  /**
   * Extract code content from run or exec directive
   */
  private extractCode(node: RunDirective | ExecDirective): string {
    // For run directives, look for command content
    if (node.type === 'Directive' && node.kind === 'run' && node.values?.command) {
      return node.values.command.map((n: MlldNode) => {
        if (n.type === 'Text') return n.content;
        return '';
      }).join('');
    }
    
    // For exec directives, could be code or template
    if (node.type === 'Directive' && (node.kind === 'exec' || node.kind === 'exe')) {
      // Check for code (exec with direct code)
      if (node.values?.code) {
        return node.values.code.map((n: MlldNode) => {
          if (n.type === 'Text') return n.content;
          return '';
        }).join('');
      }
      // Check for template (exec with template)
      if (node.values?.template) {
        return node.values.template.map((n: MlldNode) => {
          if (n.type === 'Text') return n.content;
          return '';
        }).join('');
      }
    }
    
    return '';
  }

  /**
   * Detect runtime needs from AST nodes
   */
  detectRuntimeNeeds(ast: MlldNode[]): string[] {
    const needs = new Set<string>();
    let hasNodeDependencies = false;
    
    this.walkAST(ast, (node) => {
      if (node.type === 'Directive') {
        if (node.kind === 'run') {
          const lang = this.extractRunLanguage(node as RunDirective);
          if (lang === 'js') {
            // Check if the JavaScript code uses Node.js APIs
            const code = this.extractCode(node as RunDirective);
            if (this.usesNodeAPIs(code)) {
              needs.add('node');
              hasNodeDependencies = true;
            } else {
              needs.add('js');
            }
          } else if (lang) {
            needs.add(lang);
          }
        } else if (node.kind === 'exec' || node.kind === 'exe') {
          // Check if exec has direct language specification
          const execNode = node as ExecDirective;
          
          // Check for language in exec directive itself
          if (execNode.meta?.language) {
            const lang = execNode.meta.language.toLowerCase();
            if (lang === 'js' || lang === 'javascript') {
              const code = this.extractCode(execNode);
              if (this.usesNodeAPIs(code)) {
                needs.add('node');
                hasNodeDependencies = true;
              } else {
                needs.add('js');
              }
            }
            else if (lang === 'py' || lang === 'python') needs.add('py');
            else if (lang === 'sh' || lang === 'bash' || lang === 'shell') needs.add('sh');
          } else if (execNode.values?.lang && execNode.values.lang.length > 0) {
            const langNode = execNode.values.lang[0];
            if (langNode.type === 'Text') {
              const lang = langNode.content.toLowerCase();
              if (lang === 'js' || lang === 'javascript') {
                const code = this.extractCode(execNode);
                if (this.usesNodeAPIs(code)) {
                  needs.add('node');
                  hasNodeDependencies = true;
                } else {
                  needs.add('js');
                }
              }
              else if (lang === 'py' || lang === 'python') needs.add('py');
              else if (lang === 'sh' || lang === 'bash' || lang === 'shell') needs.add('sh');
            }
          }
          
          // Note: We don't add 'sh' for command-style exec directives
          // Shell commands are different from shell language code
          
          // Also check if exec contains @run directives in template
          if (execNode.values?.template) {
            this.walkAST(execNode.values.template, (innerNode) => {
              if (innerNode.type === 'Directive' && innerNode.kind === 'run') {
                const lang = this.extractRunLanguage(innerNode as RunDirective);
                if (lang === 'js') {
                  const code = this.extractCode(innerNode as RunDirective);
                  if (this.usesNodeAPIs(code)) {
                    needs.add('node');
                    hasNodeDependencies = true;
                  } else {
                    needs.add('js');
                  }
                } else if (lang) {
                  needs.add(lang);
                }
              }
            });
          }
        }
      }
    });
    
    // Remove 'js' if we have 'node' (node is a superset of js)
    if (hasNodeDependencies) {
      needs.delete('js');
    }
    
    return Array.from(needs).sort();
  }

  /**
   * Check if JavaScript code uses Node.js-specific APIs
   */
  private usesNodeAPIs(code: string): boolean {
    // Check for require() calls
    if (/\brequire\s*\(/.test(code)) {
      return true;
    }
    
    // Check for Node.js globals
    const nodeGlobals = [
      'process', '__dirname', '__filename', 'module', 'exports', 'global',
      'Buffer', 'setImmediate', 'clearImmediate'
    ];
    for (const global of nodeGlobals) {
      const regex = new RegExp(`\\b${global}\\b`);
      if (regex.test(code)) {
        return true;
      }
    }
    
    // Check for Node.js built-in module imports
    try {
      const ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowReturnOutsideFunction: true,
        allowImportExportEverywhere: true
      });
      
      let usesNode = false;
      walkSimple(ast, {
        ImportDeclaration: (node: any) => {
          if (this.nodeBuiltins.has(node.source.value)) {
            usesNode = true;
          }
        },
        CallExpression: (node: any) => {
          if (node.callee.name === 'require' && 
              node.arguments.length > 0 && 
              node.arguments[0].type === 'Literal' &&
              this.nodeBuiltins.has(node.arguments[0].value)) {
            usesNode = true;
          }
        }
      });
      
      return usesNode;
    } catch (error) {
      // If parsing fails, check with regex
      for (const builtin of this.nodeBuiltins) {
        if (code.includes(`require('${builtin}')`) || 
            code.includes(`require("${builtin}")`) ||
            code.includes(`from '${builtin}'`) ||
            code.includes(`from "${builtin}"`)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Detect JavaScript packages from AST (works for both JS and Node)
   */
  detectJavaScriptPackages(ast: MlldNode[]): string[] {
    const packages = new Set<string>();
    
    this.walkAST(ast, (node) => {
      if (node.type === 'Directive' && (node.kind === 'run' || node.kind === 'exec' || node.kind === 'exe')) {
        const lang = node.kind === 'run' ? this.extractRunLanguage(node as RunDirective) : null;
        
        // Process JavaScript code (both 'js' and code that would be detected as 'node')
        if (lang === 'js' || ((node.kind === 'exec' || node.kind === 'exe') && this.containsJavaScriptRun(node))) {
          const code = this.extractCode(node as RunDirective | ExecDirective);
          if (code) {
            const detected = this.parseJavaScriptImports(code);
            detected.forEach(pkg => packages.add(pkg));
          }
        }
      }
    });
    
    return Array.from(packages).sort();
  }

  /**
   * Detect Node.js packages from AST
   */
  detectNodePackages(ast: MlldNode[]): string[] {
    // For now, this is the same as detectJavaScriptPackages
    // In the future, we might want to filter out browser-only packages
    return this.detectJavaScriptPackages(ast);
  }

  /**
   * Check if exec directive contains JavaScript run
   */
  private containsJavaScriptRun(node: MlldNode): boolean {
    let hasJs = false;
    if (node.type === 'Directive' && (node.kind === 'exec' || node.kind === 'exe')) {
      const execNode = node as ExecDirective;
      if (execNode.values?.template) {
        this.walkAST(execNode.values.template, (innerNode) => {
          if (innerNode.type === 'Directive' && innerNode.kind === 'run') {
            const lang = this.extractRunLanguage(innerNode as RunDirective);
            if (lang === 'js') hasJs = true;
          }
        });
      }
    }
    return hasJs;
  }

  /**
   * Parse JavaScript code to find imports/requires
   */
  private parseJavaScriptImports(code: string): string[] {
    const packages = new Set<string>();
    
    try {
      // Parse with acorn
      const ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowReturnOutsideFunction: true,
        allowImportExportEverywhere: true
      });
      
      // Walk the AST to find imports and requires
      walkSimple(ast, {
        // ES6 imports: import x from 'package'
        ImportDeclaration: (node: any) => {
          const pkg = this.extractPackageName(node.source.value);
          if (pkg) packages.add(pkg);
        },
        // CommonJS requires: require('package')
        CallExpression: (node: any) => {
          if (node.callee.name === 'require' && 
              node.arguments.length > 0 && 
              node.arguments[0].type === 'Literal') {
            const pkg = this.extractPackageName(node.arguments[0].value);
            if (pkg) packages.add(pkg);
          }
        }
      });
    } catch (error) {
      // If parsing fails, fall back to regex
      this.detectJavaScriptPackagesByRegex(code).forEach(pkg => packages.add(pkg));
    }
    
    return Array.from(packages);
  }

  /**
   * Fallback regex-based detection for JavaScript
   */
  private detectJavaScriptPackagesByRegex(code: string): string[] {
    const packages = new Set<string>();
    
    // CommonJS requires
    const requireMatches = code.matchAll(/require\s*\(\s*['"]([@\w\/-]+)['"]\s*\)/g);
    for (const match of requireMatches) {
      const pkg = this.extractPackageName(match[1]);
      if (pkg) packages.add(pkg);
    }
    
    // ES6 imports
    const importMatches = code.matchAll(/import\s+.*\s+from\s+['"]([@\w\/-]+)['"]/g);
    for (const match of importMatches) {
      const pkg = this.extractPackageName(match[1]);
      if (pkg) packages.add(pkg);
    }
    
    return Array.from(packages);
  }

  /**
   * Extract package name from import path
   */
  private extractPackageName(importPath: string): string | null {
    // Skip relative paths
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return null;
    }
    
    // Skip Node.js built-ins
    if (this.nodeBuiltins.has(importPath.split('/')[0])) {
      return null;
    }
    
    // Handle scoped packages (@org/package)
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }
    
    // Regular packages
    return importPath.split('/')[0];
  }

  /**
   * Detect Python packages from AST
   */
  detectPythonPackages(ast: MlldNode[]): string[] {
    const packages = new Set<string>();
    
    this.walkAST(ast, (node) => {
      if (node.type === 'Directive' && (node.kind === 'run' || node.kind === 'exec' || node.kind === 'exe')) {
        const lang = node.kind === 'run' ? this.extractRunLanguage(node as RunDirective) : null;
        
        // Only process Python code
        if (lang === 'py' || ((node.kind === 'exec' || node.kind === 'exe') && this.containsPythonRun(node))) {
          const code = this.extractCode(node as RunDirective | ExecDirective);
          if (code) {
            const detected = this.parsePythonImports(code);
            detected.forEach(pkg => packages.add(pkg));
          }
        }
      }
    });
    
    return Array.from(packages).sort();
  }

  /**
   * Check if exec directive contains Python run
   */
  private containsPythonRun(node: MlldNode): boolean {
    let hasPy = false;
    if (node.type === 'Directive' && (node.kind === 'exec' || node.kind === 'exe')) {
      const execNode = node as ExecDirective;
      if (execNode.values?.template) {
        this.walkAST(execNode.values.template, (innerNode) => {
          if (innerNode.type === 'Directive' && innerNode.kind === 'run') {
            const lang = this.extractRunLanguage(innerNode as RunDirective);
            if (lang === 'py') hasPy = true;
          }
        });
      }
    }
    return hasPy;
  }

  /**
   * Parse Python code to find imports (regex-based for now)
   */
  private parsePythonImports(code: string): string[] {
    const packages = new Set<string>();
    
    // Python built-in modules to exclude
    const pythonBuiltins = new Set([
      'os', 'sys', 'json', 're', 'math', 'random', 'datetime', 'time',
      'collections', 'itertools', 'functools', 'pathlib', 'urllib',
      'subprocess', 'shutil', 'tempfile', 'glob', 'fnmatch', 'linecache',
      'pickle', 'copy', 'pprint', 'enum', 'typing', 'dataclasses'
    ]);
    
    // import package
    const importMatches = code.matchAll(/^\s*import\s+([\w\d_]+)/gm);
    for (const match of importMatches) {
      const pkg = match[1];
      if (!pythonBuiltins.has(pkg)) {
        packages.add(pkg);
      }
    }
    
    // from package import ...
    const fromMatches = code.matchAll(/^\s*from\s+([\w\d_]+)(?:\.\w+)?\s+import/gm);
    for (const match of fromMatches) {
      const pkg = match[1];
      if (!pythonBuiltins.has(pkg)) {
        packages.add(pkg);
      }
    }
    
    return Array.from(packages);
  }

  /**
   * Detect shell commands from AST
   */
  detectShellCommands(ast: MlldNode[]): string[] {
    const commands = new Set<string>();
    
    this.walkAST(ast, (node) => {
      if (node.type === 'Directive' && (node.kind === 'run' || node.kind === 'exec' || node.kind === 'exe')) {
        const lang = node.kind === 'run' ? this.extractRunLanguage(node as RunDirective) : null;
        
        // Only process shell commands
        if (lang === 'sh' || ((node.kind === 'exec' || node.kind === 'exe') && this.containsShellRun(node))) {
          const code = this.extractCode(node as RunDirective | ExecDirective);
          if (code) {
            const detected = this.parseShellCommands(code);
            detected.forEach(cmd => commands.add(cmd));
          }
        }
      }
    });
    
    return Array.from(commands).sort();
  }

  /**
   * Check if exec directive contains shell run
   */
  private containsShellRun(node: MlldNode): boolean {
    let hasSh = false;
    if (node.type === 'Directive' && (node.kind === 'exec' || node.kind === 'exe')) {
      const execNode = node as ExecDirective;
      if (execNode.values?.template) {
        this.walkAST(execNode.values.template, (innerNode) => {
          if (innerNode.type === 'Directive' && innerNode.kind === 'run') {
            const lang = this.extractRunLanguage(innerNode as RunDirective);
            if (lang === 'sh') hasSh = true;
          }
        });
      }
    }
    return hasSh;
  }

  /**
   * Parse shell commands to find external tools
   */
  private parseShellCommands(code: string): string[] {
    const commands = new Set<string>();
    
    // Split into individual command lines
    const lines = code.split(/[;\n&|]/).map(l => l.trim()).filter(Boolean);
    
    for (const line of lines) {
      // Skip comments
      if (line.startsWith('#')) continue;
      
      // Extract first word as command
      const match = line.match(/^\s*(\S+)/);
      if (match) {
        const cmd = match[1];
        
        // Check if it's a known command
        if (this.commonShellCommands.has(cmd)) {
          commands.add(cmd);
        }
        
        // Also check for common patterns
        if (cmd.endsWith('ctl') || cmd.endsWith('cli')) {
          commands.add(cmd); // kubectl, gcloud, etc.
        }
      }
    }
    
    return Array.from(commands);
  }
}
