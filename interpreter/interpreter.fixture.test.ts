import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as fs from 'fs';
import * as path from 'path';

describe('Meld Interpreter - Fixture Tests', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });
  
  // Helper function to copy example files to virtual filesystem
  async function setupExampleFiles(fixtureName: string) {
    // Extract the base name without 'fixture.json' extension
    const baseName = fixtureName.replace('.fixture.json', '');
    
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
    };
    
    // Check if we have a mapping for this fixture
    const exampleSubPath = exampleDirMappings[baseName];
    if (exampleSubPath) {
      const exampleDir = path.join(__dirname, '../core/examples', exampleSubPath);
      
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
            console.log(`Copied ${file} to virtual filesystem for ${baseName}`);
          }
        }
      }
    }
  }
  
  // Load all fixtures
  const fixturesDir = path.join(__dirname, '../core/ast/fixtures');
  const fixtureFiles = fs.readdirSync(fixturesDir)
    .filter(f => f.endsWith('.fixture.json'))
    // Skip numbered fixtures as they are partial and expect full output
    .filter(f => !/-\d+\.fixture\.json$/.test(f));
  
  // Create a test for each fixture
  fixtureFiles.forEach(fixtureFile => {
    const fixturePath = path.join(fixturesDir, fixtureFile);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    
    // Skip fixtures without expected output (but allow empty string)
    if (fixture.expected === null || fixture.expected === undefined) {
      it.skip(`${fixture.name} (no expected output)`, () => {});
      return;
    }
    
    it(`should handle ${fixture.name}`, async () => {
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
        const sharedFilesPath = path.join(__dirname, '../core/examples/files');
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
      
      // Set up package.json for project path resolution
      if (fixture.name.includes('path-assignment-project')) {
        // Create the expected project structure
        await fileSystem.mkdir('/Users/adam/dev/meld');
        await fileSystem.writeFile('/Users/adam/dev/meld/package.json', JSON.stringify({
          name: 'meld',
          version: '1.0.0'
        }));
        await fileSystem.mkdir('/Users/adam/dev/meld/src');
      }
      
      // Set up specific test files that aren't in the examples directory
      if (fixture.name.startsWith('import-')) {
        // Set up import test files if they don't exist
        if (!await fileSystem.exists('/config.mld')) {
          await fileSystem.writeFile('/config.mld', '@text greeting = "Hello, world!"\n@data count = 42\n@text author = "Meld Test Suite"');
        }
        if (!await fileSystem.exists('/utils.mld')) {
          await fileSystem.writeFile('/utils.mld', '@text greeting = "Hello, world!"\n@data count = 42\n@text version = "1.0.0"\n@path docs = "./docs"');
        }
      } else if (fixture.name === 'data-directive') {
        // This fixture seems to be missing context - create the expected variable
        // TODO: This fixture may be incorrectly named or incomplete
        const env = (fileSystem as any).environment || {};
        env.result = { type: 'text', value: 'Command output' };
      } else if (fixture.name === 'text-template') {
        // This test expects a 'variable' to exist with value 'value'
        // But the fixture doesn't define it - skip for now
        // TODO: File issue for incomplete fixture
      }
      
      try {
        // For path-assignment-project, we need to set the correct basePath
        let basePath = fixture.basePath || '/';
        if (fixture.name === 'path-assignment-project') {
          basePath = '/Users/adam/dev/meld';
        }
        
        const result = await interpret(fixture.input, {
          fileSystem,
          pathService,
          format: 'markdown',
          basePath
        });
        
        // Normalize output (trim trailing whitespace/newlines)
        const normalizedResult = result.trim();
        const normalizedExpected = fixture.expected.trim();
        
        expect(normalizedResult).toBe(normalizedExpected);
      } catch (error) {
        // Some fixtures might test error cases
        if (fixture.expectedError) {
          expect(error.message).toContain(fixture.expectedError);
        } else {
          throw error;
        }
      }
    });
  });
});