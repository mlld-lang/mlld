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
    
    // Skip fixtures without expected output
    if (!fixture.expected) {
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
      
      // Set up default test files for common fixtures
      if (fixture.name === 'add-path' || 
          fixture.name === 'add-path-section' || 
          fixture.name === 'add-section' || 
          fixture.name === 'add-section-rename') {
        await fileSystem.writeFile('/file.md', '# Title\n## Section 1\n### Subsection 1.1\nContent from file\n## Section 2\n\n# Section Title\nContent under this section\n\n# Original Title\nContent under this section');
      }
      
      try {
        const result = await interpret(fixture.input, {
          fileSystem,
          pathService,
          format: 'markdown',
          basePath: fixture.basePath || '/'
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