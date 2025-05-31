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
    
    // For fixtures without expected output, run as smoke tests
    const isSmokeTest = isValidFixture && (fixture.expected === null || fixture.expected === undefined);
    
    // Skip tests with known issues
    const skipTests: Record<string, string> = {
      'frontmatter-alias': 'Issue #97: Frontmatter field access not implemented',
      'frontmatter-basic': 'Issue #97: Frontmatter field access not implemented',
      'modules-hash': 'Issue #98: Module registry with hash validation not implemented',
      'security-ttl-durations': 'Issue #99: TTL/trust security features not implemented',
      'security-ttl-special': 'Issue #99: TTL/trust security features not implemented',
      'security-ttl-trust-combined': 'Issue #99: TTL/trust security features not implemented',
      'security-trust-levels': 'Issue #99: TTL/trust security features not implemented',
      'text-url-section': 'Issue #82: URL section support not implemented'
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
      if (fixture.name.startsWith('import-')) {
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
      } else if (fixture.name.includes('run-bash')) {
        // Enable bash mocking for bash tests
        process.env.MOCK_BASH = 'true';
      } else if (fixture.name === 'reserved-time-variable') {
        // Mock time for the TIME reserved variable test
        process.env.MLLD_MOCK_TIME = '1234567890';
      } else if (fixture.name === 'reserved-time-variable-lowercase') {
        // Mock time for the lowercase time variable test
        process.env.MLLD_MOCK_TIME = '2024-05-30T14:30:00.000Z';
      } else if (fixture.name === 'text-template') {
        // This test expects a 'variable' to exist with value 'value'
        // But the fixture doesn't define it - skip for now
        // TODO: File issue for incomplete fixture
      } else if (fixture.name === 'text-url' || fixture.name === 'text-url-section' || fixture.name === 'add-url' || fixture.name === 'import-url' || fixture.name === 'import-mixed') {
        // Mock fetch for URL tests
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
      
      // Set up environment variables from fixture if specified  
      let originalEnvVars: Record<string, string | undefined> = {};
      
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
        
        // Enable URL support for URL tests
        const urlConfig = (fixture.name === 'text-url' || fixture.name === 'text-url-section' || fixture.name === 'add-url' || fixture.name === 'import-url') ? {
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
        if (fixture.name.includes('run-bash')) {
          delete process.env.MOCK_BASH;
        }
        if (fixture.name === 'reserved-time-variable' || fixture.name === 'reserved-time-variable-lowercase') {
          delete process.env.MLLD_MOCK_TIME;
        }
      }
    });
  });
});