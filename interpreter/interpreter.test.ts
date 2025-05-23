import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService/PathService';

describe('Meld Interpreter', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });
  
  describe('Basic Directives', () => {
    it('should handle @text directive with variable interpolation', async () => {
      const source = `
@text name = "World"
@text greeting = "Hello {{name}}!"
@add @greeting
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown'
      });
      
      expect(result).toBe('Hello World!');
    });
    
    it('should handle @data directive', async () => {
      const source = `
@data config = {"name": "MyApp", "version": "1.0.0"}
@text info = "{{config}}"
@add @info
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown'
      });
      
      expect(result).toBe('{"name":"MyApp","version":"1.0.0"}');
    });
    
    it('should handle @run directive', async () => {
      const source = `
@run echo "Hello from command"
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown'
      });
      
      expect(result).toBe('Hello from command');
    });
    
    it('should handle @path directive', async () => {
      const source = `
@path myPath = "./src/test.ts"
@text pathInfo = "Path is: {{myPath}}"
@add {{pathInfo}}
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown'
      });
      
      expect(result).toBe('Path is: src/test.ts');
    });
  });
  
  describe('Complex Scenarios', () => {
    it('should handle imports with variable merging', async () => {
      // Set up imported file
      fileSystem.writeFileSync('/imported.mld', `
@text imported = "I was imported"
@text shared = "From import"
`);
      
      const source = `
@text shared = "From parent"
@import "/imported.mld"
@add imported
@add " - "
@add shared
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown',
        basePath: '/'
      });
      
      expect(result).toBe('I was imported - From parent');
    });
    
    it('should handle exec and run with reference', async () => {
      const source = `
@exec myCmd = echo "Executed!"
@run myCmd
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'markdown'
      });
      
      expect(result).toBe('Executed!');
    });
  });
  
  describe('Output Formats', () => {
    it('should output XML format', async () => {
      const source = `
@text message = "Hello XML"
@add message
`;
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        format: 'xml'
      });
      
      expect(result).toContain('<?xml version="1.0"');
      expect(result).toContain('<variable name="message" type="text">');
      expect(result).toContain('Hello XML');
    });
  });
});