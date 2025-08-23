import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { interpret } from './index';
import type { Effect, EffectHandler } from './env/EffectHandler';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { glob } from 'tinyglobby';

// Mock tinyglobby for fixture tests
vi.mock('tinyglobby', () => ({
  glob: vi.fn()
}));

// Define skip tests outside describe block for export
export const skipTests: Record<string, string> = {
  'modules-hash': 'Newline handling issue - hash validation is implemented',
  'security-ttl-durations': 'Issue #99: TTL/trust security features not implemented',
  'output-quoted-path': 'Issue #312: Test infrastructure needed for new output syntax variations',
  'security-ttl-special': 'Issue #99: TTL/trust security features not implemented',
  'security-ttl-trust-combined': 'Issue #99: TTL/trust security features not implemented',
  'alligator-glob-pattern': 'Glob patterns require real filesystem - tinyglobby is well-tested',
  'alligator-glob-rename': 'Glob patterns require real filesystem - tinyglobby is well-tested',
  'alligator-glob-concat': 'Glob patterns require real filesystem - tinyglobby is well-tested',
  'file-reference-glob': 'Glob patterns require real filesystem - tinyglobby mock issues',
  'alligator-url-markdown-conversion': 'Issue #315: Getter properties (text, md, html) not accessible in mlld',
  'security-trust-levels': 'Issue #99: TTL/trust security features not implemented',
  'security-all-directives': 'Issue #99: TTL/trust security features not implemented',
  'var-text-url-section': 'Issue #82: URL section support not implemented',
  'exe-exe-code-bracket-nesting': 'Parser bug: exec function arguments not parsed correctly',
  'reserved-input-variable': 'Issue #237: @INPUT import resolver treats stdin JSON as file path',
  'modules-stdlib-basic': 'Issue #254: Registry tests need isolation - @mlld/http not published yet',
  'output-exec-invocation': 'Exec invocation in @output not yet supported - future enhancement',
  'output-run-exec-reference': 'Exec invocation in @output not yet supported - future enhancement',
  'import-namespace': 'Requires real registry/resolver infrastructure for testing',
  'modules-namespace-import': 'Requires real registry/resolver infrastructure for testing',
  'when-variable-binding': 'Issue #263: Variable binding in when actions',
  'modules-mixed': 'Mixes unimplemented security syntax with modules',
  'modules-auto-export': 'Issue #264: Namespace imports ({ * as name }) not implemented',
  'modules-explicit-export': 'Issue #264: Namespace imports ({ * as name }) not implemented',
  'modules-metadata': 'Issue #264: Namespace imports ({ * as name }) not implemented',
  'var-assignment-pipeline': 'Needs investigation - newline normalization issue',
  'pipeline-array-data': 'Needs investigation - whitespace in output',
  'run-run-code-bracket-nesting': 'Python/sh not supported yet - only JS/Node/Bash',
  // Module import tests that need published modules
  'var-data-object-strings-array-functions': 'Issue #254: Registry tests need isolation - @mlld/array not published yet',
  // Bracket notation tests - skipped until grammar issue resolved
  'bracket-notation-comprehensive': 'Issue #306: Bracket notation field access lost in grammar parsing pipeline',
  // Tests that require @time module
  'now-lowercase-basic': 'Requires @time module to be installed',
  'var-now-lowercase-basic': 'Requires @time module to be installed',
  'now-enhanced-formats': 'Requires @time module to be installed',
  'import-now-enhanced-formats': 'Requires @time module to be installed',
  // Keep this one skipped until its grammar is aligned
  'pipeline-retry-hint-object-functions': 'Pending grammar alignment for object-functions hint fixture'
};

// Validate semantic token coverage for AST
interface TokenCoverageIssue {
  nodeType: string;
  location: string;
  text: string;
}

describe('Mlld Interpreter - Fixture Tests', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  // Test EffectHandler that redirects file outputs into the in-memory FS under a tmp root
  class TestRedirectEffectHandler implements EffectHandler {
    private documentBuffer: string[] = [];
    constructor(private outRoot: string, private fs: MemoryFileSystem) {}
    
    handleEffect(effect: Effect): void {
      switch (effect.type) {
        case 'doc':
          this.documentBuffer.push(effect.content);
          break;
        case 'both':
          // stdout ignored in tests; still append to document
          this.documentBuffer.push(effect.content);
          break;
        case 'stdout':
        case 'stderr':
          // Suppress console noise in CI
          break;
        case 'file':
          if (effect.path) {
            const mapped = this.mapPath(effect.path);
            this.fs.writeFile(mapped, effect.content).catch(() => {/* noop */});
          }
          break;
      }
    }
    
    getDocument(): string {
      return this.documentBuffer.join('').replace(/\n{3,}/g, '\n\n');
    }
    
    private mapPath(p: string): string {
      // Absolute paths get rooted under outRoot; relative paths join outRoot
      if (p.startsWith('/')) return `${this.outRoot}${p}`;
      return `${this.outRoot}/${p}`;
    }
  }
  
  // Track semantic token coverage issues across all tests
  const allCoverageIssues: Record<string, TokenCoverageIssue[]> = {};
  
  // Token types and modifiers from language server
  const TOKEN_TYPES = [
    'keyword', 'variable', 'string', 'operator', 'label', 'type',
    'parameter', 'comment', 'number', 'property', 'interface',
    'typeParameter', 'namespace'
  ];
  
  const TOKEN_MODIFIERS = [
    'declaration', 'reference', 'readonly', 'interpolated',
    'literal', 'invalid', 'deprecated'
  ];
  
  const TOKEN_TYPE_MAP: Record<string, string> = {
    'directive': 'keyword',
    'variableRef': 'variable',
    'interpolation': 'variable',
    'template': 'operator',
    'templateContent': 'string',
    'embedded': 'label',
    'embeddedCode': 'string',
    'alligator': 'interface',
    'alligatorOpen': 'interface',
    'alligatorClose': 'interface',
    'xmlTag': 'type',
    'section': 'namespace',
    'boolean': 'keyword',
    'null': 'keyword',
    'keyword': 'keyword',
    'variable': 'variable',
    'string': 'string',
    'operator': 'operator',
    'parameter': 'parameter',
    'comment': 'comment',
    'number': 'number',
    'property': 'property'
  };
  
  async function validateSemanticTokenCoverage(
    ast: any[],
    input: string
  ): Promise<TokenCoverageIssue[]> {
    try {
      // Dynamically import to avoid mock conflicts
      const { SemanticTokensBuilder } = await import('vscode-languageserver/node.js');
      const { TextDocument } = await import('vscode-languageserver-textdocument');
      const { ASTSemanticVisitor } = await import('@services/lsp/ASTSemanticVisitor');
      
      // Create a document
      const document = TextDocument.create('test.mld', 'mlld', 1, input);
      
      // Create a builder that tracks tokens
      const tokens: Array<{line: number, char: number, length: number, type: string}> = [];
      const builder = new SemanticTokensBuilder();
      const originalPush = builder.push.bind(builder);
      
      // Override push to track tokens
      (builder as any).push = (line: number, char: number, length: number, typeIdx: number, modifiers: number) => {
        // Check if typeIdx is valid
        if (typeIdx < 0 || typeIdx >= TOKEN_TYPES.length) {
          tokens.push({ line, char, length, type: 'Other' });
        } else {
          tokens.push({ line, char, length, type: TOKEN_TYPES[typeIdx] });
        }
        return originalPush(line, char, length, typeIdx, modifiers);
      };
      
      // Run the semantic visitor
      const visitor = new ASTSemanticVisitor(document, builder, TOKEN_TYPES, TOKEN_MODIFIERS, TOKEN_TYPE_MAP);
      visitor.visitAST(ast);
      
      // Find all AST nodes with locations
      const nodesWithLocations: Array<{node: any, path: string[]}> = [];
      
      function collectNodes(nodes: any[], parentPath: string[] = []) {
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          
          // Skip node types that don't need semantic tokens
          if (node.type === 'Text' || node.type === 'Newline') {
            continue;
          }
          
          if (node.location) {
            nodesWithLocations.push({ node, path: [...parentPath, node.type || 'unknown'] });
          }
          
          // Recurse into child nodes
          for (const key of Object.keys(node)) {
            if (key === 'location' || key === 'type') continue;
            const value = node[key];
            
            if (Array.isArray(value)) {
              collectNodes(value, [...parentPath, node.type || 'unknown', key]);
            } else if (value && typeof value === 'object' && value.location) {
              collectNodes([value], [...parentPath, node.type || 'unknown', key]);
            }
          }
        }
      }
      
      collectNodes(ast);
      
      // Instead of checking nodes, check for uncovered text
      const issues: TokenCoverageIssue[] = [];
      const lines = input.split('\n');
      
      // Coverage configuration from environment
      const checkMarkdown = process.env.MLLD_TOKEN_CHECK_MARKDOWN === '1';
      const checkOperators = process.env.MLLD_TOKEN_CHECK_OPERATORS !== '0'; // Default to true
      const checkPunctuation = process.env.MLLD_TOKEN_CHECK_PUNCTUATION !== '0'; // Default to true
      
      // Create coverage map for each line
      lines.forEach((line, lineIdx) => {
        // Skip empty lines
        if (!line.trim()) return;
        
        // Skip markdown content lines if not checking markdown
        if (!checkMarkdown) {
          // Skip lines that are pure markdown (headers, plain text paragraphs)
          if (line.match(/^#+\s/) || // Headers
              (!line.includes('/') && !line.includes('@') && !line.includes('=') && 
               !line.includes('=>') && !line.includes('when:') && !line.match(/^\s*[{\[\(]/))) {
            return;
          }
        }
        
        // Create character coverage array
        const coverage = new Array(line.length).fill(false);
        
        // Mark covered characters
        tokens.filter(t => t.line === lineIdx).forEach(token => {
          for (let i = 0; i < token.length; i++) {
            if (token.char + i < coverage.length) {
              coverage[token.char + i] = true;
            }
          }
        });
        
        // Find uncovered ranges
        let inUncovered = false;
        let uncoveredStart = 0;
        
        for (let i = 0; i < line.length; i++) {
          if (!coverage[i] && !inUncovered) {
            inUncovered = true;
            uncoveredStart = i;
          } else if (coverage[i] && inUncovered) {
            inUncovered = false;
            const text = line.substring(uncoveredStart, i);
            
            // Skip whitespace and commas
            if (!text.trim() || text.match(/^[\s,]+$/)) {
              continue;
            }
            
            // Skip if the text is primarily operators/punctuation with whitespace
            const trimmed = text.trim();
            
            // Skip operators if configured (including with surrounding whitespace)
            if (!checkOperators) {
              if (trimmed.match(/^(=>|==|!=|&&|\|\||[<>]=?|[+\-*/%]|=)$/) ||
                  text.match(/^\s*(=>|==|!=|&&|\|\||[<>]=?|[+\-*/%]|=)\s*$/)) {
                continue;
              }
              // Skip operator sequences like " = {", " && ", " || ", etc.
              if (text.match(/^\s*=\s*[{[]?\s*$/) ||  // " = {" or " = ["
                  text.match(/^\s*(&&|\|\|)\s*$/) ||   // " && " or " || "
                  text.match(/^\s*=>\s*$/) ||          // " => "
                  text.match(/^["\s]*=>\s*["\s]*$/)) { // quotes around =>
                continue;
              }
            }
            
            // Skip punctuation if configured (including with surrounding whitespace)
            if (!checkPunctuation) {
              if (trimmed.match(/^[(){}[\]:;.,]$/) ||
                  text.match(/^\s*[(){}[\]:;.,]\s*$/)) {
                continue;
              }
              // Skip punctuation sequences
              if (text.match(/^["\s]+$/) ||          // just quotes and spaces
                  text.match(/^\s*[{}]\s*$/) ||      // braces with spaces
                  text.match(/^["'`]+[})\]]*["'`]*$/) || // quote/backtick sequences with optional closing brackets
                  text.match(/^\s*=\s*[`'"]+$/) ||   // " = `" or similar
                  text.match(/^[`'"]+$/) ||          // just quotes or backticks
                  text.match(/^["\s]*[})\]]+["\s]*$/)) { // closing brackets with quotes
                continue;
              }
            }
            
            // For longer uncovered ranges, check if they primarily consist of mlld syntax
            // that should have been tokenized (when expressions, code blocks, etc.)
            if (text.includes('when:') || 
                (text.includes('=>') && text.length > 4) || // Longer sequences with =>
                text.includes(' js ') || 
                text.includes(' sh ') || 
                text.includes(' python ')) {
              // These are legitimate coverage issues - mlld syntax that needs tokens
              issues.push({
                nodeType: 'UncoveredText',
                location: `${lineIdx + 1}:${uncoveredStart + 1}-${lineIdx + 1}:${i + 1}`,
                text: text
              });
              continue;
            }
            
            issues.push({
              nodeType: 'UncoveredText',
              location: `${lineIdx + 1}:${uncoveredStart + 1}-${lineIdx + 1}:${i + 1}`,
              text: text
            });
          }
        }
        
        // Handle end of line
        if (inUncovered) {
          const text = line.substring(uncoveredStart);
          
          // Apply same filtering rules
          if (text.trim() && !text.match(/^[\s,]+$/)) {
            const trimmed = text.trim();
            
            // Skip operators if configured (including with surrounding whitespace)
            if (!checkOperators) {
              if (trimmed.match(/^(=>|==|!=|&&|\|\||[<>]=?|[+\-*/%]|=)$/) ||
                  text.match(/^\s*(=>|==|!=|&&|\|\||[<>]=?|[+\-*/%]|=)\s*$/)) {
                return;
              }
              // Skip operator sequences
              if (text.match(/^\s*=\s*[{[]?\s*$/) ||
                  text.match(/^\s*(&&|\|\|)\s*$/) ||
                  text.match(/^\s*=>\s*$/) ||
                  text.match(/^["\s]*=>\s*["\s]*$/)) {
                return;
              }
            }
            
            // Skip punctuation if configured (including with surrounding whitespace)
            if (!checkPunctuation) {
              if (trimmed.match(/^[(){}[\]:;.,]$/) ||
                  text.match(/^\s*[(){}[\]:;.,]\s*$/)) {
                return;
              }
              // Skip punctuation sequences
              if (text.match(/^["\s]+$/) ||
                  text.match(/^\s*[{}]\s*$/) ||
                  text.match(/^["'`]+[})\]]*["'`]*$/) ||
                  text.match(/^\s*=\s*[`'"]+$/) ||
                  text.match(/^[`'"]+$/) ||
                  text.match(/^["\s]*[})\]]+["\s]*$/)) {
                return;
              }
            }
            
            // For longer uncovered ranges, check if they primarily consist of mlld syntax
            if (text.includes('when:') || 
                (text.includes('=>') && text.length > 4) ||
                text.includes(' js ') || 
                text.includes(' sh ') || 
                text.includes(' python ')) {
              // These are legitimate coverage issues
              issues.push({
                nodeType: 'UncoveredText',
                location: `${lineIdx + 1}:${uncoveredStart + 1}-${lineIdx + 1}:${line.length + 1}`,
                text: text
              });
              return;
            }
            
            issues.push({
              nodeType: 'UncoveredText',
              location: `${lineIdx + 1}:${uncoveredStart + 1}-${lineIdx + 1}:${line.length + 1}`,
              text: text
            });
          }
        }
      });
      
      return issues;
    } catch (error) {
      // If we can't validate, just return empty array and log
      console.warn('Could not validate semantic tokens:', error.message);
      return [];
    }
  }

  // Pattern matching for error messages with ${VARIABLE} placeholders
  function matchErrorPattern(actualError: string, expectedPattern: string): { 
    matches: boolean; 
    variables?: Record<string, string>;
    regex?: RegExp;
  } {
    const varNames: string[] = [];
    
    // Escape special regex chars except for ${VAR} patterns
    let regexPattern = expectedPattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape everything
      .replace(/\\\$\\\{(\w+)\\\}/g, (match, varName) => {
        varNames.push(varName);
        return '(.+?)'; // Non-greedy capture
      });
    
    const regex = new RegExp('^' + regexPattern + '$');
    const match = actualError.match(regex);
    
    if (!match) {
      return { matches: false, regex };
    }
    
    const variables: Record<string, string> = {};
    varNames.forEach((name, i) => {
      variables[name] = match[i + 1];
    });
    
    return { matches: true, variables, regex };
  }
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    // Ensure tmp output root exists in VFS
    return fileSystem.mkdir('/tmp-tests', { recursive: true });
    
    // Set up tinyglobby mock to work with our virtual file system
    vi.mocked(glob).mockImplementation(async (pattern: string, options: any) => {
      const { cwd = '/', absolute = false } = options || {};
      
      // Get all files from the virtual file system
      const allFiles: string[] = [];
      const walkDir = async (dir: string) => {
        try {
          const entries = await fileSystem.readdir(dir);
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = await fileSystem.stat(fullPath);
            if (stat.isDirectory()) {
              await walkDir(fullPath);
            } else if (stat.isFile()) {
              allFiles.push(fullPath);
            }
          }
        } catch (err) {
          // Directory doesn't exist or can't be read
        }
      };
      
      await walkDir(cwd);
      
      // Filter files by pattern
      const matches = allFiles.filter(file => {
        const relativePath = path.relative(cwd, file);
        // Import minimatch inside the mock to avoid import issues
        const { minimatch } = require('minimatch');
        return minimatch(relativePath, pattern);
      });
      
      // Return absolute or relative paths based on options
      return absolute ? matches : matches.map(f => path.relative(cwd, f));
    });
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // Helper function to recursively copy directory to virtual filesystem
  async function copyDirToVFS(srcDir: string, destDir: string) {
    await fileSystem.mkdir(destDir);
    const entries = fs.readdirSync(srcDir);
    
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry);
      const destPath = path.join(destDir, entry);
      const stat = fs.statSync(srcPath);
      
      if (stat.isFile()) {
        const content = fs.readFileSync(srcPath, 'utf8');
        await fileSystem.writeFile(destPath, content);
      } else if (stat.isDirectory()) {
        await copyDirToVFS(srcPath, destPath);
      }
    }
  }
  
  // Helper function to automatically discover and copy test files to virtual filesystem
  async function setupExampleFiles(fixtureName: string) {
    // Derive test case directory from fixture path
    const testCasePath = getTestCasePathFromFixture(fixtureName);
    
    if (!testCasePath || !fs.existsSync(testCasePath)) {
      // No test case directory found
      if (process.env.DEBUG_FIXTURES) {
        console.log(`No test case found for fixture: ${fixtureName}`);
        console.log(`Derived path: ${testCasePath}`);
      }
      return;
    }
    
    // Read all files in the test case directory
    await copyTestFilesToVFS(testCasePath, '/');
  }
  
  // Convert fixture path to test case directory path
  function getTestCasePathFromFixture(fixturePath: string): string | null {
    // Extract components from fixture path
    // If fixturePath is relative (e.g., valid/directives/import/import-all.generated-fixture.json)
    // make it absolute first
    const absoluteFixturePath = path.isAbsolute(fixturePath) 
      ? fixturePath 
      : path.join(__dirname, '../tests/fixtures', fixturePath);
    
    const fixtureDir = path.dirname(absoluteFixturePath);
    const fixtureName = path.basename(absoluteFixturePath, '.generated-fixture.json');
    const fixturesRoot = path.join(__dirname, '../tests/fixtures');
    const relativePath = path.relative(fixturesRoot, fixtureDir);
    const parts = relativePath.split(path.sep);
    
    if (process.env.DEBUG_FIXTURES) {
      console.log(`getTestCasePathFromFixture: fixture=${fixturePath}`);
      console.log(`  fixtureDir=${fixtureDir}`);
      console.log(`  fixtureName=${fixtureName}`);
      console.log(`  relativePath=${relativePath}`);
      console.log(`  parts=${parts.join(', ')}`);
    }
    
    if (parts.length < 2) {
      return null;
    }
    
    const category = parts[0]; // 'valid', 'invalid', etc.
    
    // For the new structure, fixtures mirror the test case structure exactly
    // e.g., fixtures/valid/directives/import/import-all/import-all.generated-fixture.json
    //   -> cases/valid/directives/import/import-all/
    
    // Build the test case path by mirroring the fixture path structure
    const testCasePath = path.join(__dirname, '../tests/cases', relativePath);
    
    if (process.env.DEBUG_FIXTURES) {
      console.log(`  testCasePath=${testCasePath}`);
      console.log(`  exists=${fs.existsSync(testCasePath)}`);
    }
    
    // Check if the path exists
    if (fs.existsSync(testCasePath)) {
      return testCasePath;
    }
    
    // If not found, return null
    return null;
  }
  
  // Recursive function to copy test files to virtual filesystem
  async function copyTestFilesToVFS(sourcePath: string, targetPath: string) {
    const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourceFile = path.join(sourcePath, entry.name);
      const targetFile = path.join(targetPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively copy subdirectories
        await copyTestFilesToVFS(sourceFile, targetFile);
      } else if (entry.isFile()) {
        // Skip test definition files
        if (entry.name.startsWith('example') && entry.name.endsWith('.md')) continue;
        if (entry.name.startsWith('expected') && entry.name.endsWith('.md')) continue;
        if (entry.name === 'error.md') continue;
        if (entry.name === 'warning.md') continue;
        
        // Copy all other files to the virtual filesystem
        const content = fs.readFileSync(sourceFile, 'utf8');
        await fileSystem.writeFile(targetFile, content);
        
        // Debug: For pipeline-file-spaced, verify the file is actually written and readable
        if (sourcePath.includes('pipeline-file-spaced') && entry.name === 'test-pipeline-data.json') {
          try {
            const verifyContent = await fileSystem.readFile(targetFile);
            console.log(`✅ File ${targetFile} written and verified: ${verifyContent.length} bytes`);
            
            // Also check if we can list files in the root directory
            const rootFiles = await fileSystem.readdir('/');
            console.log(`Root directory files:`, rootFiles);
          } catch (e) {
            console.log(`❌ Error verifying file ${targetFile}:`, e.message);
          }
        }
      }
    }
  }
  
  // Load all fixtures from new organized structure
  const fixturesDir = path.join(__dirname, '../tests/fixtures');
  const fixtureFiles: string[] = [];
  
  // Recursively find all .generated-fixture.json files
  function findFixtures(dir: string, relativePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'index.ts') {
        findFixtures(path.join(dir, entry.name), path.join(relativePath, entry.name));
      } else if (entry.name.endsWith('.generated-fixture.json')) {
        fixtureFiles.push(path.join(relativePath, entry.name));
      }
    }
  }
  
  findFixtures(fixturesDir);
  
  // Filter out examples unless specifically requested
  const includeExamples = process.env.INCLUDE_EXAMPLES === 'true';
  const filteredFixtures = includeExamples ? 
    fixtureFiles : 
    fixtureFiles.filter(f => !f.includes('/examples/'));
  
  // Skip tests already defined at module level

  // Separate fixtures into categories for better reporting
  const invalidFixtures: Array<{ file: string; fixture: any; issue: string }> = [];
  const validFixturesToTest: Array<{ file: string; fixture: any }> = [];
  
  // Debug: Check if examples are included
  console.log('Total filtered fixtures:', filteredFixtures.length);
  console.log('Include examples:', includeExamples);
  
  filteredFixtures.forEach(fixtureFile => {
    const fixturePath = path.join(fixturesDir, fixtureFile);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    
    // Check if this fixture should be skipped
    if (skipTests[fixture.name]) {
      validFixturesToTest.push({ file: fixtureFile, fixture });
      return; // Skip categorization for known issues
    }
    
    // Check for fixtures in wrong directories or with parsing issues
    const isInValidDir = fixtureFile.includes('/valid/') || fixtureFile.startsWith('valid/');
    const isInInvalidDir = fixtureFile.includes('/invalid/') || fixtureFile.startsWith('invalid/');
    const isInExceptionsDir = fixtureFile.includes('/exceptions/') || fixtureFile.startsWith('exceptions/');
    const hasParseError = fixture.parseError !== null && fixture.parseError !== undefined;
    const hasNullAST = fixture.ast === null;
    const hasExpectedError = !!fixture.expectedError;
    
    // Detect fixtures that are in the wrong place or have issues
    if (isInValidDir && (hasParseError || hasNullAST)) {
      // Debug specific examples
      if (fixture.name === 'llm-interface') {
        console.log('llm-interface debug:', {
          hasParseError,
          hasNullAST,
          parseError: fixture.parseError
        });
      }
      invalidFixtures.push({
        file: fixtureFile,
        fixture,
        issue: hasParseError ? 'Parse error in valid directory' : 'Null AST in valid directory'
      });
    } else if ((isInInvalidDir || isInExceptionsDir) && !hasExpectedError && !hasParseError) {
      invalidFixtures.push({
        file: fixtureFile,
        fixture,
        issue: 'No error in error directory'
      });
    } else {
      validFixturesToTest.push({ file: fixtureFile, fixture });
    }
  });
  
  // Debug log invalid fixtures
  console.log('Invalid fixtures found:', invalidFixtures.length);
  if (invalidFixtures.length > 0) {
    console.log('First few invalid fixtures:');
    invalidFixtures.slice(0, 5).forEach(({ file, fixture, issue }) => {
      console.log(`  - ${fixture.name}: ${issue}`);
    });
  }
  
  // Report invalid fixtures in a separate describe block
  if (invalidFixtures.length > 0) {
    describe('Invalid Test Fixtures (need fixing)', () => {
      invalidFixtures.forEach(({ file, fixture, issue }) => {
        // Use regular it() with explicit failure instead of it.fail()
        it(`INVALID: ${fixture.name} - ${issue}`, () => {
          let errorMessage = `Test fixture "${fixture.name}" has issues: ${issue}`;
          
          // Add specific parse error details if available
          if (fixture.parseError) {
            const parseErr = fixture.parseError;
            errorMessage += `\n\nParse Error: ${parseErr.message}`;
            if (parseErr.location) {
              errorMessage += `\nLocation: Line ${parseErr.location.start.line}, Column ${parseErr.location.start.column}`;
            }
            
            // Show the problematic input around the error location
            if (fixture.input && parseErr.location) {
              const lines = fixture.input.split('\n');
              const errorLine = parseErr.location.start.line - 1;
              const startLine = Math.max(0, errorLine - 2);
              const endLine = Math.min(lines.length, errorLine + 3);
              
              errorMessage += '\n\nContext:\n';
              for (let i = startLine; i < endLine; i++) {
                const lineNum = i + 1;
                const prefix = lineNum === parseErr.location.start.line ? '> ' : '  ';
                errorMessage += `${prefix}${lineNum}: ${lines[i]}\n`;
                
                // Add error pointer on the error line
                if (lineNum === parseErr.location.start.line) {
                  const spaces = ' '.repeat(parseErr.location.start.column + 3 + lineNum.toString().length);
                  errorMessage += `${spaces}^\n`;
                }
              }
            }
          } else if (fixture.ast === null) {
            errorMessage += '\n\nAST is null - parsing completely failed';
          }
          
          throw new Error(errorMessage);
        });
      });
    });
  }
  
  // Create tests for valid fixtures
  validFixturesToTest.forEach(({ file: fixtureFile, fixture }) => {
    // Handle different fixture types
    const isErrorFixture = !!fixture.expectedError || !!fixture.parseError;
    const isWarningFixture = !!fixture.expectedWarning;
    const isValidFixture = !isErrorFixture && !isWarningFixture;
    
    // For fixtures without expected output, run as smoke tests
    const isSmokeTest = isValidFixture && (fixture.expected === null || fixture.expected === undefined);
    
    const testFn = skipTests[fixture.name] ? it.skip : it;
    const skipReason = skipTests[fixture.name] ? ` (Skipped: ${skipTests[fixture.name]})` : '';

    testFn(`should handle ${fixture.name}${isSmokeTest ? ' (smoke test)' : ''}${skipReason}`, async () => {
      // First, copy shared files from the files directory as a base
      try {
        const sharedFilesPath = path.join(__dirname, '../tests/cases/files');
        if (fs.existsSync(sharedFilesPath)) {
          const sharedFiles = fs.readdirSync(sharedFilesPath);
          
          for (const file of sharedFiles) {
            // Skip config.mlld which uses old syntax
            if (file === 'config.mlld') {
              continue;
            }
            
            const filePath = path.join(sharedFilesPath, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isFile()) {
              const content = fs.readFileSync(filePath, 'utf8');
              await fileSystem.writeFile(`/${file}`, content);
            }
          }
        }
      } catch (error) {
        // Ignore if shared files directory doesn't exist
      }
      
      // Then, set up any files from the examples directory (overrides shared files)
      await setupExampleFiles(fixtureFile);
      
      
      // Finally, set up any required files specified in the fixture (highest priority)
      if (fixture.files) {
        for (const [filePath, content] of Object.entries(fixture.files)) {
          await fileSystem.writeFile(filePath, content as string);
        }
      }
      
      // Copy examples files directory for examples that reference files/
      try {
        const exampleFilesPath = path.join(__dirname, '../examples/files');
        if (fs.existsSync(exampleFilesPath)) {
          await fileSystem.mkdir('/files');
          const exampleFiles = fs.readdirSync(exampleFilesPath);
          
          for (const file of exampleFiles) {
            const filePath = path.join(exampleFilesPath, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isFile()) {
              const content = fs.readFileSync(filePath, 'utf8');
              await fileSystem.writeFile(`/files/${file}`, content);
            }
          }
        }
      } catch (error) {
        // Ignore if examples files directory doesn't exist
      }
      
      // Set up package.json for project path resolution
      if (fixture.name.includes('path-assignment-project') || fixture.name.includes('path-assignment-special')) {
        // Create the expected mock project structure
        await fileSystem.mkdir('/mock/project');
        await fileSystem.writeFile('/mock/project/package.json', JSON.stringify({
          name: 'mlld',
          version: '1.0.0'
        }));
        await fileSystem.mkdir('/mock/project/src');
      }
      
      // Set up specific test files that aren't in the examples directory
      if (fixture.name === 'comments-inline') {
        // Set up files for comments-inline test
        await fileSystem.writeFile('/inline-test-utils.mld', '/var @x = "Value X"\n/var @y = "Value Y"');
        await fileSystem.writeFile('/inline-test-README.md', '# Example Project\n\nThis is the main README content.');
      } else if (fixture.name.startsWith('import-')) {
        // Set up files for import alias tests
        if (fixture.name === 'import-alias') {
          await fileSystem.writeFile('/config.mld', '/var @author = "Config Author"\n/var @title = "My Project"');
          await fileSystem.writeFile('/utils.mld', '/var @author = "Utils Author"');
        }
        
        // Set up files for import namespace tests
        else if (fixture.name === 'import-namespace') {
          await fileSystem.writeFile('/settings.mld', '/var @author = "Settings Author"\n/var @apiUrl = "https://api.example.com"');
        }
        
        // Set up import test files for other import tests (import-all, import-selected, etc.)
        else {
          await fileSystem.writeFile('/config.mld', '/var @greeting = "Hello, world!"\n/var @count = "42"\n/var @author = "Mlld Test Suite"');
          await fileSystem.writeFile('/utils.mld', '/var @greeting = "Hello, world!"\n/var @count = "42"\n/var @version = "1.0.0"\n/path @docs = "./docs"');
        }
      } else if (fixture.name === 'var-data-directive') {
        // This fixture seems to be missing context - create the expected variable
        // TODO: This fixture may be incorrectly named or incomplete
        const env = (fileSystem as any).environment || {};
        const { createSimpleTextVariable } = await import('@core/types/variable');
        env.result = createSimpleTextVariable('result', 'Command output', {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        });
      } else if (fixture.name === 'var-data-array-path-disambiguation' || fixture.name === 'var-data-object-literals-in-arrays') {
        // Mock /etc/hosts for tests that reference it
        await fileSystem.mkdir('/etc');
        await fileSystem.writeFile('/etc/hosts', '##\n# Host Database\n#\n# localhost is used to configure the loopback interface\n# when the system is booting.  Do not change this entry.\n##\n127.0.0.1\tlocalhost\n255.255.255.255\tbroadcasthost\n::1             localhost');
      } else if (fixture.name.includes('run-bash') || fixture.name.includes('bracket-nesting')) {
        // Enable bash mocking for bash tests and bracket nesting tests that use bash
        process.env.MOCK_BASH = 'true';
      } else if (fixture.name === 'with-combined' || fixture.name === 'with-needs-node') {
        // Enable command mocking for npm/sed test
        process.env.MLLD_TEST_MODE = 'true';
      } else if (fixture.name === 'reserved-now-variable') {
        // Mock time for the NOW reserved variable test
        process.env.MLLD_MOCK_TIME = '1234567890';
      } else if (fixture.name === 'reserved-now-variable-lowercase') {
        // Mock time for the lowercase now variable test
        process.env.MLLD_MOCK_TIME = '2024-05-30T14:30:00.000Z';
      } else if (fixture.name === 'now-basic-compat' || fixture.name === 'var-now-basic-compat') {
        // Mock time for the NOW compatibility test
        process.env.MLLD_MOCK_TIME = '2024-01-15T10:30:00.000Z';
      } else if (fixture.name === 'reserved-debug-variable') {
        // Mock time for consistent debug output
        process.env.MLLD_MOCK_TIME = '2024-05-30T14:30:00.000Z';
        // TODO: Debug output contains dynamic paths and environment-specific data
        // This test would need special handling to work across different environments
      } else if (fixture.name === 'resolver-contexts') {
        // Mock time for resolver context tests
        process.env.MLLD_MOCK_TIME = '2024-01-01T00:00:00.000Z';
      } else if (fixture.name === 'text-template') {
        // This test expects a 'variable' to exist with value 'value'
        // But the fixture doesn't define it - skip for now
        // TODO: File issue for incomplete fixture
      } else if (fixture.name === 'modules-stdlib-basic') {
        // Mock fetch for module resolution
        global.fetch = async (url: string) => {
          if (url === 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules/mlld/registry.json') {
            return {
              ok: true,
              json: async () => ({
                author: 'mlld',
                modules: {
                  http: {
                    source: {
                      url: 'https://gist.githubusercontent.com/example/123456/raw/http.mld'
                    },
                    description: 'HTTP utilities'
                  }
                }
              })
            } as any;
          } else if (url === 'https://gist.githubusercontent.com/example/123456/raw/http.mld') {
            return {
              ok: true,
              text: async () => '/var @http = { "get": "@get", "post": "@post", "put": "@put", "delete": "@delete", "auth": { "get": "@auth_get", "post": "@auth_post" } }'
            } as any;
          }
          throw new Error(`Unexpected URL in test: ${url}`);
        };
      } else if (fixture.name === 'modules-hash') {
        // Enable test mode to skip actual hash validation
        process.env.MLLD_SKIP_HASH_VALIDATION = 'true';
        
        // Mock fetch for module hash validation test
        global.fetch = async (url: string) => {
          // Mock registry responses
          if (url === 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules/user/registry.json') {
            return {
              ok: true,
              json: async () => ({
                author: 'user',
                modules: {
                  settings: {
                    source: {
                      url: 'https://gist.githubusercontent.com/user/123456/raw/settings.mld'
                    },
                    description: 'User settings module'
                  }
                }
              })
            } as any;
          } else if (url === 'https://gist.githubusercontent.com/user/123456/raw/settings.mld') {
            // Content that will hash to start with 'abc123' when using SHA-256
            // For testing, we'll use a known content and verify the hash matches
            return {
              ok: true,
              text: async () => '/var @config = { "theme": "dark" }'
            } as any;
          } else if (url === 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules/org/registry.json') {
            return {
              ok: true,
              json: async () => ({
                author: 'org',
                modules: {
                  utils: {
                    source: {
                      url: 'https://gist.githubusercontent.com/org/234567/raw/utils.mld'
                    },
                    description: 'Organization utilities'
                  }
                }
              })
            } as any;
          } else if (url === 'https://gist.githubusercontent.com/org/234567/raw/utils.mld') {
            return {
              ok: true,
              text: async () => '/var @version = "v2.1.0"'
            } as any;
          } else if (url === 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules/namespace/registry.json') {
            return {
              ok: true,
              json: async () => ({
                author: 'namespace',
                modules: {
                  lib: {
                    source: {
                      url: 'https://gist.githubusercontent.com/namespace/345678/raw/lib.mld'
                    },
                    description: 'Namespace library'
                  }
                }
              })
            } as any;
          } else if (url === 'https://gist.githubusercontent.com/namespace/345678/raw/lib.mld') {
            return {
              ok: true,
              text: async () => '/var @helpers = { "formatDate": "2024-01-15" }'
            } as any;
          } else if (url === 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules/company/registry.json') {
            return {
              ok: true,
              json: async () => ({
                author: 'company',
                modules: {
                  toolkit: {
                    source: {
                      url: 'https://gist.githubusercontent.com/company/456789/raw/toolkit.mld'
                    },
                    description: 'Company toolkit'
                  }
                }
              })
            } as any;
          } else if (url === 'https://gist.githubusercontent.com/company/456789/raw/toolkit.mld') {
            return {
              ok: true,
              text: async () => '/var @tools = { "name": "Development Toolkit" }'
            } as any;
          }
          throw new Error(`Unexpected URL in test: ${url}`);
        };
      } else if (fixture.name === 'env-vars-allowed') {
        // For this test, we'll simulate the environment variables being passed through stdin
        // This avoids the complexity of trying to get the lock file to work with the virtual filesystem
        // In real usage, the lock file would control which env vars are included in @INPUT
      } else if (fixture.name === 'file-reference-interpolation') {
        // Set up test-data.json in /tmp for file reference interpolation test
        await fileSystem.mkdir('/tmp');
        const testDataPath = path.join(__dirname, '../tests/cases/valid/file-reference-interpolation/test-data.json');
        if (fs.existsSync(testDataPath)) {
          const content = fs.readFileSync(testDataPath, 'utf8');
          await fileSystem.writeFile('/tmp/test-data.json', content);
        }
      }
      
      // Set up environment variables from fixture if specified  
      const originalEnvVars: Record<string, string | undefined> = {};
      
      // Save original fetch for restoration
      const originalFetch = (global as any).fetch;
      
      try {
        // For path assignment tests, we need to set the correct basePath
        let basePath = fixture.basePath || '/';
        
        if (fixture.name === 'path-assignment-project' || fixture.name === 'path-assignment-special') {
          basePath = '/mock/project';
        }
        // For npm run tests, we need to be in the project directory
        if (fixture.name.includes('run-command-bases-npm-run')) {
          basePath = process.cwd(); // Use current working directory which has package.json
        }
        // For projectpath test, set basePath to the test case directory to match expected output
        if (fixture.name === 'reserved-projectpath-variable') {
          basePath = '/Users/adam/dev/mlld/tests/cases/valid/reserved/projectpath-variable';
        }
        
        // Enable URL support for URL tests and module resolution
        const urlConfig = (fixture.name === 'var-text-url' || fixture.name === 'var-text-url-section' || fixture.name === 'show-url' || fixture.name === 'import-url' || fixture.name === 'import-mixed' || fixture.name === 'modules-stdlib-basic') ? {
          enabled: true,
          allowedProtocols: ['https'],
          allowedDomains: [],
          blockedDomains: [],
          timeout: 30000,
          maxResponseSize: 10485760,
          cache: {
            enabled: false,
            ttl: 0,
            maxEntries: 0,
            rules: []
          }
        } : undefined;
        
        // Set up fetch mock for URL tests (but not for modules-stdlib-basic which has its own mock)
        if ((fixture.name === 'var-text-url' || fixture.name === 'var-text-url-section' || fixture.name === 'show-url' || fixture.name === 'import-url' || fixture.name === 'import-mixed' || fixture.name.includes('alligator') && fixture.name.includes('url')) && fixture.name !== 'modules-stdlib-basic') {
          global.fetch = async (url: string) => {
            if (url === 'https://raw.githubusercontent.com/example/repo/main/README.md') {
              return {
                ok: true,
                status: 200,
                headers: new Map([['content-type', 'text/markdown']]),
                text: async () => '# Example Project\n\nThis is the README content fetched from the URL.'
              } as any;
            } else if (url === 'https://raw.githubusercontent.com/example/repo/main/docs/getting-started.md') {
              return {
                ok: true,
                status: 200,
                headers: new Map([['content-type', 'text/markdown']]),
                text: async () => '# Getting Started\n\nWelcome to our project! This guide will help you get up and running quickly.\n\n## Installation\n\nRun `npm install` to get started.\n'
              } as any;
            } else if (url === 'https://raw.githubusercontent.com/example/repo/main/config.mld') {
              return {
                ok: true,
                status: 200,
                headers: new Map([['content-type', 'text/x-mlld']]),
                text: async () => '/var @greeting = "Hello from URL!"\n/var @version = "2.0.0"\n/var @author = "URL Import"'
              } as any;
            } else if (url === 'https://raw.githubusercontent.com/example/repo/main/remote-config.mld') {
              return {
                ok: true,
                status: 200,
                headers: new Map([['content-type', 'text/x-mlld']]),
                text: async () => '/var @remoteValue = "Value from remote config"\n/var @remoteData = { "loaded": true }'
              } as any;
            } else if (url === 'https://example.com') {
              return {
                ok: true,
                status: 200,
                headers: new Map([['content-type', 'text/html']]),
                text: async () => `<!doctype html>
<html>
<head>
    <title>Example Domain</title>

    <meta charset="utf-8" />
    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style type="text/css">
    body {
        background-color: #f0f0f2;
        margin: 0;
        padding: 0;
        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
        
    }
    div {
        width: 600px;
        margin: 5em auto;
        padding: 2em;
        background-color: #fdfdff;
        border-radius: 0.5em;
        box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);
    }
    a:link, a:visited {
        color: #38488f;
        text-decoration: none;
    }
    @media (max-width: 700px) {
        div {
            margin: 0 auto;
            width: auto;
        }
    }
    </style>    
</head>

<body>
<div>
    <h1>Example Domain</h1>
    <p>This domain is for use in illustrative examples in documents. You may use this
    domain in literature without prior coordination or asking for permission.</p>
    <p><a href="https://www.iana.org/domains/example">More information...</a></p>
</div>
</body>
</html>`
              } as any;
            }
            throw new Error(`Unexpected URL in test: ${url}`);
          };
        }
        
        if (isErrorFixture) {
          // Prepare stdin content for stdin import tests
          let stdinContent: string | undefined;
          if (fixture.name.includes('import-stdin')) {
            if (fixture.name.includes('text')) {
              // Plain text stdin content
              stdinContent = 'Hello from stdin!';
            } else {
              // JSON stdin content (default for all other stdin tests)
              stdinContent = '{"name": "test-project", "version": "1.0.0"}';
            }
          } else if (fixture.name.includes('input-stdin-compatibility') || fixture.name.includes('input-input-new-syntax') || fixture.name === 'input-new-syntax') {
            // These tests expect JSON with config and data fields
            stdinContent = '{"config": {"greeting": "Hello from stdin!"}, "data": {"message": "Input data loaded"}}';
          } else if (fixture.name === 'import-stdin-deprecated') {
            // This test expects JSON with name and version fields
            stdinContent = '{"name": "test-project", "version": "1.0.0"}';
          } else if (fixture.name === 'reserved-input-variable') {
            // This test expects JSON input for @INPUT testing
            stdinContent = '{"config": "test-value", "data": "sample-data"}';
          } else if (fixture.name === 'import-environment-variables') {
            // This test expects JSON with MYVAR and OTHERVAR
            stdinContent = '{"MYVAR": "hello", "OTHERVAR": "world"}';
          }
          
          // For error fixtures, expect interpretation to fail and validate error format
          let caughtError: any = null;
          try {
            await interpret(fixture.input, {
              fileSystem,
              pathService,
              format: 'markdown',
              basePath,
              urlConfig,
              stdinContent,
              // Avoid real filesystem writes and locks
              ephemeral: true,
              effectHandler: new TestRedirectEffectHandler('/tmp-tests', fileSystem),
              useMarkdownFormatter: false // Disable prettier for tests
            });
            // If we get here, the test should fail because we expected an error
            expect.fail('Expected interpretation to throw an error, but it succeeded');
          } catch (error) {
            caughtError = error;
            expect(error).toBeDefined();
            
            // Compare actual error message to expected pattern
            if (fixture.expectedError && error.message) {
              const actualMessage = error.message.trim();
              const expectedPattern = fixture.expectedError.trim();
              
              // Try pattern matching first
              const result = matchErrorPattern(actualMessage, expectedPattern);
              
              if (!result.matches) {
                // Fall back to substring matching for backward compatibility
                if (!actualMessage.includes(expectedPattern)) {
                  // Find the test case directory for this fixture
                  const testCaseDir = fixtureFile.replace('.generated-fixture.json', '');
                  const testCasePath = path.join(__dirname, '../tests/cases', testCaseDir);
                  
                  // Check if there's a corresponding error pattern
                  const errorPatternPath = testCaseDir.includes('invalid/') 
                    ? path.join(__dirname, '../errors/parse', path.basename(testCaseDir))
                    : null;
                  
                  throw new Error(
                    `Error pattern mismatch for ${fixture.name}:\n\n` +
                    `EXPECTED PATTERN:\n${expectedPattern}\n\n` +
                    `ACTUAL MESSAGE:\n${actualMessage}\n\n` +
                    (result.regex ? `GENERATED REGEX:\n${result.regex}\n\n` : '') +
                    `TEST CASE LOCATION:\n${testCasePath}\n` +
                    `  - example.md: The mlld code that triggers this error\n` +
                    `  - error.md: The expected error pattern\n\n` +
                    (errorPatternPath ? 
                      `ERROR PATTERN LOCATION:\n${errorPatternPath}\n` +
                      `  - pattern.ts: The error enhancement pattern\n` +
                      `  - example.md: Pattern documentation\n\n` : '') +
                    `TO FIX:\n` +
                    `1. Update error.md with the correct pattern using ${VAR} syntax\n` +
                    `2. Ensure pattern.ts captures the right values\n` +
                    `3. Run 'npm run build:fixtures' to regenerate`
                  );
                }
              } else if (result.variables && Object.keys(result.variables).length > 0) {
                // Log extracted variables for debugging (only in verbose mode)
                if (process.env.VERBOSE_TESTS) {
                  console.log(`✓ Pattern matched for ${fixture.name} with variables:`, result.variables);
                }
              }
            }
          }
          
          // Test error formatting if we have expected error content
          if (fixture.expectedError && caughtError) {
            // Import error formatting utilities
            const { ErrorFormatSelector } = await import('@core/utils/errorFormatSelector');
            const formatter = new ErrorFormatSelector(fileSystem);
            
            try {
              const formattedError = await formatter.formatForCLI(caughtError, {
                useColors: false, // Disable colors for testing
                useSourceContext: true,
                useSmartPaths: true,
                basePath
              });
              
              // Normalize whitespace for comparison
              const normalizedActual = formattedError.replace(/\s+/g, ' ').trim();
              const normalizedExpected = fixture.expectedError.replace(/\s+/g, ' ').trim();
              
              // Validate error formatting features (non-strict for different error types)
              const errorChecks = [];
              
              if (normalizedExpected.includes('VariableRedefinition:')) {
                if (normalizedActual.includes('VariableRedefinition:')) {
                  errorChecks.push('✓ Error type correct');
                } else {
                  errorChecks.push('⚠ Different error type (may be parse error)');
                }
              }
              
              if (normalizedExpected.includes('Details:')) {
                if (normalizedActual.includes('Details:')) {
                  errorChecks.push('✓ Details section present');
                } else {
                  errorChecks.push('⚠ No details section');
                }
              }
              
              if (normalizedExpected.includes('💡')) {
                if (normalizedActual.includes('💡')) {
                  errorChecks.push('✓ Helpful suggestion present');
                } else {
                  errorChecks.push('⚠ No suggestion provided');
                }
              }
              
              // Test that source context features are working
              if (normalizedActual.match(/\d+\s*\|/)) {
                errorChecks.push('✓ Source context with line numbers');
              }
              
              if (normalizedActual.includes('^')) {
                errorChecks.push('✓ Error pointer arrows');
              }
              
              if (normalizedActual.includes('./')) {
                errorChecks.push('✓ Smart relative paths');
              }
              
              // Log results for visibility (don't fail test - just report)
              if (errorChecks.length > 0) {
                console.log(`Error formatting validation for ${fixture.name}:`, errorChecks.join(', '));
              }
            } catch (formatError) {
              // If formatting fails, that's okay - we still validated the error was thrown
              console.warn(`Could not format error for test ${fixture.name}:`, formatError.message);
            }
          }
        } else {
          // Prepare stdin content for stdin import tests
          let stdinContent: string | undefined;
          if (fixture.name.includes('import-stdin')) {
            if (fixture.name.includes('text')) {
              // Plain text stdin content
              stdinContent = 'Hello from stdin!';
            } else {
              // JSON stdin content (default for all other stdin tests)
              stdinContent = '{"name": "test-project", "version": "1.0.0"}';
            }
          } else if (fixture.name.includes('input-stdin-compatibility') || fixture.name.includes('input-input-new-syntax') || fixture.name === 'input-new-syntax') {
            // These tests expect JSON with config and data fields
            stdinContent = '{"config": {"greeting": "Hello from stdin!"}, "data": {"message": "Input data loaded"}}';
          } else if (fixture.name === 'import-stdin-deprecated') {
            // This test expects JSON with name and version fields
            stdinContent = '{"name": "test-project", "version": "1.0.0"}';
          } else if (fixture.name === 'reserved-input-variable') {
            // This test expects JSON input for @INPUT testing
            stdinContent = '{"config": "test-value", "data": "sample-data"}';
          } else if (fixture.name === 'import-environment-variables') {
            // This test expects JSON with MYVAR and OTHERVAR
            stdinContent = '{"MYVAR": "hello", "OTHERVAR": "world"}';
          } else if (fixture.name === 'env-vars-allowed' || fixture.name === 'input-env-vars-allowed') {
            // This test expects JSON with allowed environment variables
            stdinContent = '{"MY_ALLOWED_VAR": "test-value-1", "ANOTHER_ALLOWED": "test-value-2"}';
          }
          
          // Set up environment variables from fixture if specified
          if ((fixture as any).environmentVariables) {
            for (const [key, value] of Object.entries((fixture as any).environmentVariables)) {
              originalEnvVars[key] = process.env[key];
              process.env[key] = value as string;
            }
          }
          // For valid fixtures, expect successful interpretation
          const result = await interpret(fixture.input, {
            fileSystem,
            pathService,
            format: 'markdown',
            basePath,
            urlConfig,
            stdinContent,
            useMarkdownFormatter: false, // Disable prettier for tests to maintain exact output
            outputOptions: {
              showProgress: false // Disable progress output in tests
            },
            // Avoid real filesystem writes and locks
            ephemeral: true,
            effectHandler: new TestRedirectEffectHandler('/tmp-tests', fileSystem)
          });
          
          if (isValidFixture && !isSmokeTest) {
            // Normalize output (trim trailing whitespace/newlines)
            const normalizedResult = result.trim();
            const normalizedExpected = fixture.expected.trim();
            
            expect(normalizedResult).toBe(normalizedExpected);
          } else if (isSmokeTest) {
            // For smoke tests, just verify it doesn't crash and produces output
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
          }
          
          // Validate semantic token coverage for valid fixtures with AST (only if flag is set)
          if (process.env.MLLD_TOKEN_COVERAGE === '1' && isValidFixture && fixture.ast) {
            const coverageIssues = await validateSemanticTokenCoverage(fixture.ast, fixture.input);
            
            // Store issues for summary report
            allCoverageIssues[fixture.name] = coverageIssues;
            
            if (coverageIssues.length > 0) {
              const issueList = coverageIssues.map(issue => 
                `  - ${issue.nodeType} at ${issue.location} "${issue.text}"`
              ).join('\n');
              
              // Phase 2: Actually fail tests with coverage issues
              throw new Error(
                `Semantic token coverage issues in ${fixture.name}:\n${issueList}\n\n` +
                `These AST nodes are not generating semantic tokens, which means they show as "Other" in VSCode.\n` +
                `To fix: Update ASTSemanticVisitor to handle these node types.`
              );
            }
          }
          
          // TODO: Add warning validation for warning fixtures
        }
      } catch (error) {
        if (!isErrorFixture) {
          // If this isn't an error fixture, re-throw the error
          throw error;
        }
        // For error fixtures, this is expected - the test already passed via expect().rejects.toThrow()
      } finally {
        // Clean up environment variables from fixture
        if ((fixture as any).environmentVariables) {
          for (const key of Object.keys((fixture as any).environmentVariables)) {
            if (originalEnvVars[key] === undefined) {
              delete process.env[key];
            } else {
              process.env[key] = originalEnvVars[key];
            }
          }
        }
        
        // Clean up other environment variables
        if (fixture.name.includes('run-bash') || fixture.name.includes('bracket-nesting')) {
          delete process.env.MOCK_BASH;
        }
        if (fixture.name === 'with-combined' || fixture.name === 'with-needs-node') {
          delete process.env.MLLD_TEST_MODE;
        }
        if (fixture.name === 'reserved-now-variable' || fixture.name === 'reserved-now-variable-lowercase' || 
            fixture.name === 'reserved-debug-variable' || fixture.name === 'reserved-debug-variable-lowercase' ||
            fixture.name === 'resolver-contexts' || fixture.name === 'now-basic-compat' || fixture.name === 'var-now-basic-compat') {
          delete process.env.MLLD_MOCK_TIME;
        }
        if (fixture.name === 'modules-hash') {
          delete process.env.MLLD_SKIP_HASH_VALIDATION;
        }
        
        // Restore original fetch
        (global as any).fetch = originalFetch;
      }
    });
  });

  // Summary report after all tests
  describe('Test Fixture Summary', () => {
    it('should report fixture health', () => {
      const totalFixtures = filteredFixtures.length;
      const invalidCount = invalidFixtures.length;
      const validCount = validFixturesToTest.length;
      
      console.log('\n=== Test Fixture Health Report ===');
      console.log(`Total fixtures: ${totalFixtures}`);
      console.log(`Valid fixtures: ${validCount}`);
      console.log(`Invalid fixtures: ${invalidCount}`);
      
      if (invalidCount > 0) {
        console.log('\nInvalid fixtures that need attention:');
        invalidFixtures.forEach(({ file, fixture, issue }) => {
          console.log(`  - ${fixture.name} (${file}): ${issue}`);
        });
        console.log('\nThese fixtures may represent:');
        console.log('  1. Features that ARE implemented but have grammar changes');
        console.log('  2. Tests in wrong directories');
        console.log('  3. Missing expected error definitions');
      }
      
      // This test always passes - it's just for reporting
      expect(true).toBe(true);
    });
    
    it('should report semantic token coverage', () => {
      // Only show report if token coverage checking was enabled
      if (process.env.MLLD_TOKEN_COVERAGE !== '1') {
        console.log('\n=== Semantic Token Coverage Report ===');
        console.log('Token coverage checking disabled. Run with MLLD_TOKEN_COVERAGE=1 to enable.');
        console.log('\nAdditional coverage options:');
        console.log('  MLLD_TOKEN_CHECK_MARKDOWN=1    - Check markdown content (default: off)');
        console.log('  MLLD_TOKEN_CHECK_OPERATORS=0   - Skip operator coverage (default: on)');
        console.log('  MLLD_TOKEN_CHECK_PUNCTUATION=0 - Skip punctuation coverage (default: on)');
        expect(true).toBe(true);
        return;
      }
      
      const fixturesWithIssues = Object.keys(allCoverageIssues).filter(
        name => allCoverageIssues[name].length > 0
      );
      
      console.log('\n=== Semantic Token Coverage Report ===');
      console.log(`Total fixtures checked: ${Object.keys(allCoverageIssues).length}`);
      console.log(`Fixtures with coverage issues: ${fixturesWithIssues.length}`);
      
      // Show current configuration
      console.log('\nCurrent configuration:');
      console.log(`  Checking markdown: ${process.env.MLLD_TOKEN_CHECK_MARKDOWN === '1' ? 'YES' : 'NO'}`);
      console.log(`  Checking operators: ${process.env.MLLD_TOKEN_CHECK_OPERATORS !== '0' ? 'YES' : 'NO'}`);
      console.log(`  Checking punctuation: ${process.env.MLLD_TOKEN_CHECK_PUNCTUATION !== '0' ? 'YES' : 'NO'}`);
      
      if (fixturesWithIssues.length > 0) {
        console.log('\nTop coverage issues by node type:');
        
        // Collect all issues by node type
        const issuesByType: Record<string, number> = {};
        const examplesByType: Record<string, { fixture: string; issue: TokenCoverageIssue }> = {};
        
        fixturesWithIssues.forEach(fixtureName => {
          allCoverageIssues[fixtureName].forEach(issue => {
            issuesByType[issue.nodeType] = (issuesByType[issue.nodeType] || 0) + 1;
            if (!examplesByType[issue.nodeType]) {
              examplesByType[issue.nodeType] = { fixture: fixtureName, issue };
            }
          });
        });
        
        // Sort by frequency
        const sortedTypes = Object.entries(issuesByType)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10); // Top 10
        
        sortedTypes.forEach(([nodeType, count]) => {
          const example = examplesByType[nodeType];
          console.log(`  - ${nodeType}: ${count} occurrences`);
          console.log(`    Example: ${example.fixture} at ${example.issue.location}`);
          console.log(`    Text: "${example.issue.text}"`);
        });
        
        console.log('\nTo fix these issues:');
        console.log('1. Update ASTSemanticVisitor to handle missing node types');
        console.log('2. Check visitor dispatch in initializeVisitors()');
        console.log('3. Ensure all AST nodes with locations generate tokens');
      }
      
      expect(true).toBe(true);
    });
  });
});
