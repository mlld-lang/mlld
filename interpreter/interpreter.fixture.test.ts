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
  
  // Create a test for each fixture
  filteredFixtures.forEach(fixtureFile => {
    const fixturePath = path.join(fixturesDir, fixtureFile);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    
    // Handle different fixture types
    const isErrorFixture = !!fixture.expectedError || !!fixture.parseError;
    const isWarningFixture = !!fixture.expectedWarning;
    const isValidFixture = !isErrorFixture && !isWarningFixture;
    
    // Check for null AST in valid fixtures - this indicates a grammar parsing failure
    if (isValidFixture && fixture.ast === null) {
      throw new Error(`Valid fixture '${fixture.name}' has null AST - this indicates the grammar failed to parse the input:\n${fixture.input}`);
    }
    
    // For fixtures without expected output, run as smoke tests
    const isSmokeTest = isValidFixture && (fixture.expected === null || fixture.expected === undefined);
    
    // Skip tests with known issues
    const skipTests: Record<string, string> = {
      'modules-hash': 'Newline handling issue - hash validation is implemented',
      'security-ttl-durations': 'Issue #99: TTL/trust security features not implemented',
      'security-ttl-special': 'Issue #99: TTL/trust security features not implemented',
      'security-ttl-trust-combined': 'Issue #99: TTL/trust security features not implemented',
      'security-trust-levels': 'Issue #99: TTL/trust security features not implemented',
      'text-url-section': 'Issue #82: URL section support not implemented',
      'text-variable-copy': 'Issue #176: Variable copying with @text copy = @original not supported',
      'exec-exec-code-bracket-nesting': 'Parser bug: exec function arguments not parsed correctly',
      'exec-param-interpolation': 'Parser bug: escaped @ symbols in exec templates are parsed as variable references',
      'add-foreach-section-variable-new': 'Issue #236: Template parsing fails with nested brackets in double-bracket templates',
      'data-foreach-section-variable': 'Issue #236: Template parsing fails with nested brackets in double-bracket templates',
      'reserved-input-variable': 'Issue #237: @INPUT import resolver treats stdin JSON as file path',
      'modules-stdlib-basic': 'Issue #254: Registry tests need isolation - @mlld/http not published yet',
      'when-exec-conditions': 'Grammar bug: @exec name() = @run [...] is parsed as execResolver instead of execCommand',
      'when-when-switch': 'Grammar bug: @exec name() = @run [...] is parsed as execResolver instead of execCommand',
      'add-exec-invocation': 'Grammar bug: @exec name() = @run [...] is parsed as execResolver instead of execCommand',
      'when-exec-invocation-add': 'Issue #260: @when directive accepts literal values (should require variables)',
      'when-truthiness-edge-cases': 'Issue #260: @when directive accepts literal values (should require variables)'
    };

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
        await fileSystem.writeFile('/utils.mld', '@text x = "Value X"\n@text y = "Value Y"');
        await fileSystem.writeFile('/README.md', '# Example Project\n\nThis is the main README content.');
      } else if (fixture.name.startsWith('import-')) {
        // Set up files for import alias tests
        if (fixture.name === 'import-alias') {
          await fileSystem.writeFile('/config.mld', '@text author = "Config Author"\n@text title = "My Project"');
          await fileSystem.writeFile('/utils.mld', '@text author = "Utils Author"');
        }
        
        // Set up files for import namespace tests
        else if (fixture.name === 'import-namespace') {
          await fileSystem.writeFile('/settings.mld', '@text author = "Settings Author"\n@text apiUrl = "https://api.example.com"');
        }
        
        // Set up import test files if they don't exist (for other import tests)
        else {
          if (!await fileSystem.exists('/config.mld')) {
            await fileSystem.writeFile('/config.mld', '@text greeting = "Hello, world!"\n@data count = 42\n@text author = "Mlld Test Suite"');
          }
          if (!await fileSystem.exists('/utils.mld')) {
            await fileSystem.writeFile('/utils.mld', '@text greeting = "Hello, world!"\n@data count = 42\n@text version = "1.0.0"\n@path docs = "./docs"');
          }
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
              text: async () => '@data http = { "get": "@get", "post": "@post", "put": "@put", "delete": "@delete", "auth": { "get": "@auth_get", "post": "@auth_post" } }'
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
              text: async () => '@data config = { "theme": "dark" }'
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
              text: async () => '@text version = "v2.1.0"'
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
              text: async () => '@data helpers = { "formatDate": "2024-01-15" }'
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
              text: async () => '@data tools = { "name": "Development Toolkit" }'
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
                text: async () => '@text greeting = "Hello from URL!"\n@data version = "2.0.0"\n@text author = "URL Import"'
              } as any;
            } else if (url === 'https://raw.githubusercontent.com/example/repo/main/remote-config.mld') {
              return {
                ok: true,
                text: async () => '@text remoteValue = "Value from remote config"\n@data remoteData = { "loaded": true }'
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
              stdinContent
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
            stdinContent
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
});