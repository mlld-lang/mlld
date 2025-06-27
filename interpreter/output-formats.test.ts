import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import type { IPathService } from '@services/fs/IPathService';
import * as path from 'path';

// Simple mock path service for tests
class MockPathService implements IPathService {
  resolve(...segments: string[]): string {
    return path.resolve(...segments);
  }
  
  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
  
  join(...segments: string[]): string {
    return path.join(...segments);
  }
  
  dirname(filePath: string): string {
    return path.dirname(filePath);
  }
  
  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }
  
  extname(filePath: string): string {
    return path.extname(filePath);
  }
  
  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }
  
  normalize(filePath: string): string {
    return path.normalize(filePath);
  }
}

describe('Output Format Tests', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: IPathService;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new MockPathService();
  });
  
  describe('Markdown Format', () => {
    it('should output clean markdown by default', async () => {
      const source = `
    /var @message = "Hello Markdown"
    /var @config = {"name": "MyApp", "version": "1.0.0"}
    /show @message
    /show @config
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown'
      });
      
      // Should have clean output with just the content
      // Note: Current implementation adds extra newlines
      expect(result.trim()).toBe(`Hello Markdown
{
  "name": "MyApp",
  "version": "1.0.0"
}`);
    });
  });
  
  describe('XML Format', () => {
    it('should output valid XML with variables', async () => {
      const source = `
    /var @message = "Hello XML"
    /var @config = {"name": "MyApp", "version": "1.0.0"}
    /show @message
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'xml'
      });
      
      // llmxml converts markdown structure to XML with SCREAMING_SNAKE tags
      expect(result).toContain('<MLLD_OUTPUT>');
      expect(result).toContain('<VARIABLES>');
      expect(result).toContain('<MESSAGE>'); 
      expect(result).toContain('**Type**: simple-text');
      expect(result).toContain('**Value**: Hello XML');
      expect(result).toContain('<CONTENT>');
      expect(result).toContain('Hello XML'); // The actual content
    });
    
    it('should include all variables in XML output', async () => {
      const source = `
    /var @message = "Hello"
    /var @config = {"version": "1.0"}
    /path @filePath = [./test.md]
    /exe @cmd = {echo "test"}
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'xml'
      });
      
      // Should include all variable types with llmxml structure (SCREAMING_SNAKE)
      expect(result).toContain('<MESSAGE>');
      expect(result).toContain('**Type**: simple-text');
      expect(result).toContain('**Value**: Hello');
      
      expect(result).toContain('<CONFIG>');
      expect(result).toContain('**Type**: object');
      expect(result).toContain('"version": "1.0"');
      
      expect(result).toContain('<FILEPATH>'); // Note: llmxml converts filePath to FILEPATH
      expect(result).toContain('**Type**: path');
      
      expect(result).toContain('<CMD>');
      expect(result).toContain('**Type**: executable');
    });
  });
});

describe('Integration Scenarios', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: IPathService;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new MockPathService();
  });
  
  describe('Import Scope Precedence', () => {
    it('should use imported variables (first import wins immutable design)', async () => {
      // Set up imported file with variables
      await fileSystem.writeFile('/imported.mld', `
    /var @greeting = "Hello from import"
    /var @author = "Import Author"
    /var @settings = {"theme": "dark", "lang": "en"}
`);
      
      const source = `
    /import [/imported.mld]
    /show @imported.greeting
    /show " by "
    /show @imported.author
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown',
        basePath: '/'
      });
      
      // Import's author comes first ("first import wins" immutable design)
      // Note: Each @add creates a new line in current implementation
      expect(result.trim()).toBe('Hello from import\nby\nImport Author');
    });
    
    it('should import only selected variables', async () => {
      await fileSystem.writeFile('/utils.mld', `
    /var @helper = "Utility Function"
    /var @private = "Should not be imported"
    /var @config = {"debug": true}
`);
      
      const source = `
    /import {helper, config} from "/utils.mld"
    /show @helper
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown',
        basePath: '/'
      });
      
      expect(result.trim()).toBe('Utility Function');
      
      // Verify 'private' was not imported by checking it throws
      const sourceWithPrivate = `
    /import {helper, config} from "/utils.mld"
    /show @private
`;
      
      await expect(interpret(sourceWithPrivate, {
        fileSystem,
        pathService,
        format: 'markdown',
        basePath: '/'
      })).rejects.toThrow();
    });
  });
  
  describe('Variable Immutability', () => {
    
    it('should throw error when attempting to redefine a variable', async () => {
      const source = `
    /var @message = "First definition"
    /var @message = "Second definition"
`;
      
      await expect(interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown'
      })).rejects.toThrow(/already defined|already exists|cannot redefine/i);
    });
    
    it('should throw error when redefining across different variable types', async () => {
      const source = `
    /var @myVar = "Text value"
    /var @myVar = {"type": "data"}
`;
      
      await expect(interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown'
      })).rejects.toThrow(/already defined|already exists|cannot redefine/i);
    });
    
    it('should throw error when imported variable conflicts with existing', async () => {
      await fileSystem.writeFile('/defs.mld', '/var @conflict = "From import"');
      
      const source = `
    /var @conflict = "Original"
    /import [/defs.mld]
`;
      
      await expect(interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown',
        basePath: '/'
      })).rejects.toThrow(/already defined|already exists|cannot redefine/i);
    });
  });
});