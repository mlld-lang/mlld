import { describe, it, expect } from 'vitest';
import { processMeld } from './index.new';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem';

describe('API Smoke Tests (New System)', () => {
  it('should process simple text content correctly', async () => {
    const content = 'Just some plain text.';
    const result = await processMeld(content);
    
    expect(result).toBeDefined();
    expect(result).toContain('Just some plain text.');
  });

  it('should process a text directive', async () => {
    const content = '@text greeting = "Hello, World!"';
    
    const result = await processMeld(content, {
      format: 'markdown'
    });
    
    expect(result).toBeDefined();
    expect(result).toBe(''); // Directives don't produce output
  });

  it('should handle variable interpolation', async () => {
    const content = `
@text name = "Alice"
@text message = "Hello, {{name}}!"
@add @message
    `.trim();
    
    const result = await processMeld(content, {
      format: 'markdown'
    });
    
    expect(result).toBeDefined();
    expect(result).toContain('Hello, Alice!');
  });

  it('should work with custom filesystem', async () => {
    const fs = new MemfsTestFileSystem();
    fs.initialize();
    
    // Create a test file
    await fs.writeFile('/test.txt', 'Test content');
    
    const content = `
@path testFile = "/test.txt"
@add @testFile
    `.trim();
    
    const result = await processMeld(content, {
      fs,
      format: 'markdown'
    });
    
    expect(result).toBeDefined();
    expect(result).toContain('Test content');
  });

  it('should handle data directives', async () => {
    const content = `
@data config = {"name": "MyApp", "version": "1.0.0"}
@text info = "App: {{config.name}} v{{config.version}}"
@add @info
    `.trim();
    
    const result = await processMeld(content, {
      format: 'markdown'
    });
    
    expect(result).toBeDefined();
    expect(result).toContain('App: MyApp v1.0.0');
  });

  it('should handle errors gracefully', async () => {
    const content = '@text missing = "Value: {{nonexistent}}"';
    
    await expect(processMeld(content, { strict: true }))
      .rejects.toThrow();
  });
});