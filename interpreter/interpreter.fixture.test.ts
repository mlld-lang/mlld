import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService/PathService';
import * as fs from 'fs';
import * as path from 'path';

describe('Meld Interpreter - Fixture Tests', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });
  
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
      // Set up any required files in the memory filesystem
      if (fixture.files) {
        for (const [filePath, content] of Object.entries(fixture.files)) {
          await fileSystem.writeFile(filePath, content as string);
        }
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
      
      // Set up default test files for common fixtures
      if (fixture.name === 'path-assignment') {
        await fileSystem.writeFile('/file.md', 'Contents of file.md');
      } else if (fixture.name === 'add-path') {
        await fileSystem.writeFile('/file.md', '# Title\n## Section 1\n### Subsection 1.1\nContent from file\n## Section 2');
      } else if (fixture.name === 'add-path-section' || 
                 fixture.name === 'add-section' || 
                 fixture.name === 'add-section-rename') {
        await fileSystem.writeFile('/file.md', '# Title\n## Section 1\n### Subsection 1.1\nContent from file\n## Section 2\n\n# Section Title\nContent under this section\n\n# Original Title\nContent under this section');
      } else if (fixture.name.startsWith('import-')) {
        // Set up import test files
        await fileSystem.writeFile('/config.mld', '@text greeting = "Hello, world!"\n@data count = 42\n@text author = "Meld Test Suite"');
        await fileSystem.writeFile('/utils.mld', '@text greeting = "Hello, world!"\n@data count = 42\n@text version = "1.0.0"\n@path docs = "./docs"');
      } else if (fixture.name === 'data-directive') {
        // This fixture seems to be missing context - create the expected variable
        // TODO: This fixture may be incorrectly named or incomplete
        const env = (fileSystem as any).environment || {};
        env.result = { type: 'text', value: 'Command output' };
      } else if (fixture.name === 'text-template') {
        // This test expects a 'variable' to exist with value 'value'
        // But the fixture doesn't define it - skip for now
        // TODO: File issue for incomplete fixture
      } else if (fixture.name === 'text-path') {
        // Set up the file that the text content refers to
        await fileSystem.writeFile('/file.md', 'Content from file');
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