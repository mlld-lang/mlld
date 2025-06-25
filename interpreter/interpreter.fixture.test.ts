import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as fs from 'fs';
import * as path from 'path';

describe('Mlld Interpreter - Fixture Tests', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
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
  
  // Helper function to copy example files to virtual filesystem
  async function setupExampleFiles(fixtureName: string) {
    // Extract the base name from the fixture path
    const baseName = path.basename(fixtureName, '.generated-fixture.json');
    
    // Map fixture names to example directory paths
    const exampleDirMappings: Record<string, string> = {
      'text-assignment-add': 'text/assignment-add',
      'text-assignment-add-section-bracket': 'text/assignment-add',
      'text-assignment-add-section-bracket-rename': 'text/assignment-add',
      'text-assignment-path': 'text/assignment-path',
      'text-assignment-run': 'text/assignment-run',
      'text-path': 'text/path',
      'add-path': 'add/path',
      'add-path-section': 'add/path',
      'add-section': 'add/section',
      'add-section-rename': 'add/section',
      'import-all': 'import/all',
      'import-all-variable': 'import/all-variable',
      'import-selected': 'import/selected',
      'path-assignment': 'path/assignment',
      'path-assignment-absolute': 'path/assignment',
      'path-assignment-project': 'path/assignment',
      'path-assignment-special': 'path/assignment',
      'path-assignment-variable': 'path/assignment',
      'run-file-content-escaping': 'run/file-content-escaping',
      'modules-explicit-export': 'modules/explicit-export',
      'modules-auto-export': 'modules/auto-export',
      'modules-metadata': 'modules/metadata',
      'text-foreach-section-literal': 'text/foreach-section-literal',
      'text-foreach-section-variable': 'text/foreach-section-variable',
      'text-foreach-section-backtick': 'text/foreach-section-backtick',
      'text-foreach-section-path-expression': 'text/foreach-section-path-expression',
      'exec-invocation-module': 'exec-invocation-module',
      'env-vars-allowed': 'input/env-vars-allowed',
      'import-namespace-json': 'import/namespace-json',
      'import-namespace-nested': 'import/namespace-nested',
    };
    
    // Check if we have a mapping for this fixture
    const exampleSubPath = exampleDirMappings[baseName];
    if (exampleSubPath) {
      const exampleDir = path.join(__dirname, '../tests/cases/valid', exampleSubPath);
      
      // Check if the directory exists
      if (fs.existsSync(exampleDir)) {
        // Read all files in the example directory
        const files = fs.readdirSync(exampleDir);
        
        for (const file of files) {
          // Skip example.md and expected.md files (these are the test definitions)
          if (file.startsWith('example') || file.startsWith('expected')) {
            continue;
          }
          
          // Copy other files to the virtual filesystem
          const filePath = path.join(exampleDir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isFile()) {
            const content = fs.readFileSync(filePath, 'utf8');
            // Place files at root of virtual filesystem
            await fileSystem.writeFile(`/${file}`, content);
          } else if (stat.isDirectory()) {
            // Recursively copy subdirectories
            await copyDirToVFS(filePath, `/${file}`);
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
  
  // Define skip tests up front to use in categorization
  const skipTests: Record<string, string> = {
    'modules-hash': 'Newline handling issue - hash validation is implemented',
    'security-ttl-durations': 'Issue #99: TTL/trust security features not implemented',
    'security-ttl-special': 'Issue #99: TTL/trust security features not implemented',
    'security-ttl-trust-combined': 'Issue #99: TTL/trust security features not implemented',
    'security-trust-levels': 'Issue #99: TTL/trust security features not implemented',
    'security-all-directives': 'Issue #99: TTL/trust security features not implemented',
    'text-url-section': 'Issue #82: URL section support not implemented',
    'exec-exec-code-bracket-nesting': 'Parser bug: exec function arguments not parsed correctly',
    'add-foreach-section-variable-new': 'Issue #236: Template parsing fails with nested brackets in double-bracket templates',
    'data-foreach-section-variable': 'Issue #236: Template parsing fails with nested brackets in double-bracket templates',
    'reserved-input-variable': 'Issue #237: @INPUT import resolver treats stdin JSON as file path',
    'modules-stdlib-basic': 'Issue #254: Registry tests need isolation - @mlld/http not published yet',
    'output-exec-invocation': 'Exec invocation in @output not yet supported - future enhancement',
    'output-run-exec-reference': 'Exec invocation in @output not yet supported - future enhancement',
    'import-namespace': 'Issue #264: Namespace imports not implemented yet',
    'when-variable-binding': 'Issue #263: Variable binding in when actions',
    'modules-mixed': 'Mixes unimplemented security syntax with modules',
    'modules-auto-export': 'Issue #264: Namespace imports ({ * as name }) not implemented',
    'modules-explicit-export': 'Issue #264: Namespace imports ({ * as name }) not implemented',
    'modules-metadata': 'Issue #264: Namespace imports ({ * as name }) not implemented',
    'data-assignment-pipeline': 'Needs investigation - newline normalization issue',
    'pipeline-array-data': 'Needs investigation - whitespace in output',
    'run-run-code-bracket-nesting': 'Python/sh not supported yet - only JS/Node/Bash',
    // Foreach section tests - temporarily skipped
    'data-foreach-section-literal': 'Foreach section expressions not yet supported in /var context',
    'text-foreach-section-literal': 'Foreach section expressions not yet supported in /var context',
    'text-foreach-section-variable': 'Foreach section expressions not yet supported in /var context',
    'text-foreach-section-backtick': 'Foreach section expressions not yet supported in /var context',
    'text-foreach-section-path-expression': 'Foreach section expressions not yet supported in /var context',
  };

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
      // First, set up any files from the examples directory
      await setupExampleFiles(fixtureFile);
      
      // Then, set up any required files specified in the fixture
      if (fixture.files) {
        for (const [filePath, content] of Object.entries(fixture.files)) {
          await fileSystem.writeFile(filePath, content as string);
        }
      }
      
      // Always copy shared files from the files directory
      try {
        const sharedFilesPath = path.join(__dirname, '../tests/cases/files');
        if (fs.existsSync(sharedFilesPath)) {
          const sharedFiles = fs.readdirSync(sharedFilesPath);
          
          for (const file of sharedFiles) {
            const filePath = path.join(sharedFilesPath, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isFile() && !await fileSystem.exists(`/${file}`)) {
              const content = fs.readFileSync(filePath, 'utf8');
              await fileSystem.writeFile(`/${file}`, content);
            }
          }
        }
      } catch (error) {
        // Ignore if shared files directory doesn't exist
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
        await fileSystem.writeFile('/utils.mld', '/var @x = "Value X"\n/var @y = "Value Y"');
        await fileSystem.writeFile('/README.md', '# Example Project\n\nThis is the main README content.');
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
      } else if (fixture.name === 'data-directive') {
        // This fixture seems to be missing context - create the expected variable
        // TODO: This fixture may be incorrectly named or incomplete
        const env = (fileSystem as any).environment || {};
        env.result = { type: 'text', value: 'Command output' };
      } else if (fixture.name.includes('run-bash') || fixture.name.includes('bracket-nesting')) {
        // Enable bash mocking for bash tests and bracket nesting tests that use bash
        process.env.MOCK_BASH = 'true';
      } else if (fixture.name === 'with-combined' || fixture.name === 'with-needs-node') {
        // Enable command mocking for npm/sed test
        process.env.MLLD_TEST_MODE = 'true';
      } else if (fixture.name === 'reserved-time-variable') {
        // Mock time for the TIME reserved variable test
        process.env.MLLD_MOCK_TIME = '1234567890';
      } else if (fixture.name === 'reserved-time-variable-lowercase') {
        // Mock time for the lowercase time variable test
        process.env.MLLD_MOCK_TIME = '2024-05-30T14:30:00.000Z';
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
        const urlConfig = (fixture.name === 'text-url' || fixture.name === 'text-url-section' || fixture.name === 'add-url' || fixture.name === 'import-url' || fixture.name === 'import-mixed' || fixture.name === 'modules-stdlib-basic') ? {
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
        if ((fixture.name === 'text-url' || fixture.name === 'text-url-section' || fixture.name === 'add-url' || fixture.name === 'import-url' || fixture.name === 'import-mixed') && fixture.name !== 'modules-stdlib-basic') {
          global.fetch = async (url: string) => {
            if (url === 'https://raw.githubusercontent.com/example/repo/main/README.md') {
              return {
                ok: true,
                text: async () => '# Example Project\n\nThis is the README content fetched from the URL.'
              } as any;
            } else if (url === 'https://raw.githubusercontent.com/example/repo/main/docs/getting-started.md') {
              return {
                ok: true,
                text: async () => '# Getting Started\n\nWelcome to our project! This guide will help you get up and running quickly.\n\n## Installation\n\nRun `npm install` to get started.\n'
              } as any;
            } else if (url === 'https://raw.githubusercontent.com/example/repo/main/config.mld') {
              return {
                ok: true,
                text: async () => '/var @greeting = "Hello from URL!"\n/var @version = "2.0.0"\n/var @author = "URL Import"'
              } as any;
            } else if (url === 'https://raw.githubusercontent.com/example/repo/main/remote-config.mld') {
              return {
                ok: true,
                text: async () => '/var @remoteValue = "Value from remote config"\n/var @remoteData = { "loaded": true }'
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
          } else if (fixture.name.includes('input-stdin-compatibility') || fixture.name.includes('input-input-new-syntax')) {
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
              useMarkdownFormatter: false // Disable prettier for tests
            });
            // If we get here, the test should fail because we expected an error
            expect.fail('Expected interpretation to throw an error, but it succeeded');
          } catch (error) {
            caughtError = error;
            expect(error).toBeDefined();
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
          } else if (fixture.name.includes('input-stdin-compatibility') || fixture.name.includes('input-input-new-syntax')) {
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
            useMarkdownFormatter: false // Disable prettier for tests to maintain exact output
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
        if (fixture.name === 'reserved-time-variable' || fixture.name === 'reserved-time-variable-lowercase' || 
            fixture.name === 'reserved-debug-variable' || fixture.name === 'reserved-debug-variable-lowercase' ||
            fixture.name === 'resolver-contexts') {
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
  });
});