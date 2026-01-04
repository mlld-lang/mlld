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
  
  describe.skip('XML Format', () => {
    it('should output valid XML with content', async () => {
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
      
      // llmxml converts markdown to XML - should only contain actual output
      expect(result).toContain('<MLLD_OUTPUT>');
      expect(result).toContain('Hello XML'); // The actual content shown
      // Variables should NOT appear in output unless explicitly shown
      expect(result).not.toContain('<VARIABLES>');
    });
    
    it('should only output content that is explicitly shown', async () => {
      const source = `
    /var @message = "Hello"
    /var @config = {"version": "1.0"}
    /path @filePath = "./test.md"
    /exe @cmd = {echo "test"}
    /show @message
    /show @config
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'xml'
      });
      
      // Should only show what was explicitly output with /show
      expect(result).toContain('Hello');
      expect(result).toContain('"version": "1.0"');
      
      // Should NOT include variable definitions or metadata
      expect(result).not.toContain('**Type**');
      expect(result).not.toContain('<CMD>'); // Not shown
      expect(result).not.toContain('<FILEPATH>'); // Not shown
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
    /import "/imported.mld" as @imported
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
      expect(result.trim()).toBe('Hello from import\n by\n\nImport Author');
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
    /import "/defs.mld" as @defs
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
