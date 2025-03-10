import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from './utils/di/TestContextDI.js';
import { CLIService, IPromptService } from '../services/cli/CLIService/CLIService.js';

describe('Output Filename Handling', () => {
  let context: TestContextDI;
  let cliService: CLIService;
  const mockPromptService: IPromptService = {
    getText: vi.fn()
  };

  beforeEach(async () => {
    // Set up test context
    context = TestContextDI.create();
    await context.initialize();
    
    // Create sample files
    const meldContent = `
      @text greeting = "Hello"
      @text name = "World"

      {{greeting}}, {{name}}!
    `;
    
    await context.services.filesystem.writeFile('$PROJECTPATH/test.mld', meldContent);
    await context.services.filesystem.writeFile('$PROJECTPATH/test.md', meldContent);
    
    // Set up CLI service with our test context
    cliService = new CLIService(
      context.services.parser,
      context.services.interpreter,
      context.services.output,
      context.services.filesystem,
      context.services.path,
      context.services.state,
      mockPromptService
    );
    
    // Reset the mock between tests
    vi.mocked(mockPromptService.getText).mockReset();
    
    // Enable test mode for PathService
    context.services.path.enableTestMode();
  });

  afterEach(async () => {
    // Clean up
    await context.cleanup();
  });

  it('should use .o.md extension for markdown output by default', async () => {
    // Call the private method directly using type assertion
    const outputPath = await (cliService as any).determineOutputPath({
      input: '$PROJECTPATH/test.mld',
      format: 'markdown'
    });
    
    // Should use .o.md instead of .md
    expect(outputPath).toContain('test.o.md');
  });
  
  it('should use .o.xml extension for XML output by default', async () => {
    // Call the private method directly using type assertion
    const outputPath = await (cliService as any).determineOutputPath({
      input: '$PROJECTPATH/test.mld',
      format: 'xml'
    });
    
    // Should use .o.xml instead of .xml
    expect(outputPath).toContain('test.o.xml');
  });
  
  it('should use .o.md extension for .md input files as well', async () => {
    // Call the private method directly using type assertion
    const outputPath = await (cliService as any).determineOutputPath({
      input: '$PROJECTPATH/test.md',
      format: 'markdown'
    });
    
    // Should use .o.md to avoid overwriting
    expect(outputPath).toContain('test.o.md');
  });
  
  it('should respect explicit output path when provided', async () => {
    // Call the private method directly using type assertion
    const outputPath = await (cliService as any).determineOutputPath({
      input: '$PROJECTPATH/test.mld',
      output: '$PROJECTPATH/custom.md',
      format: 'markdown'
    });
    
    // Should use the explicit path
    expect(outputPath).toContain('custom.md');
  });
  
  it('should generate incremental filenames when file exists and overwrite is declined', async () => {
    // Create an existing output file
    await context.services.filesystem.writeFile('$PROJECTPATH/test.o.md', 'existing content');
    
    // Call the findAvailableIncrementalFilename method directly
    const result = await (cliService as any).findAvailableIncrementalFilename('$PROJECTPATH/test.o.md');
    
    // Debug log
    console.log('Result:', result);
    
    // Should generate an incremental filename
    expect(result.outputPath).toContain('test.o-1.md');
    expect(result.shouldOverwrite).toBe(true);
  });
  
  it('should continue incrementing filename until available one is found', async () => {
    // Create existing output files
    await context.services.filesystem.writeFile('$PROJECTPATH/test.o.md', 'existing content');
    await context.services.filesystem.writeFile('$PROJECTPATH/test.o-1.md', 'existing content');
    await context.services.filesystem.writeFile('$PROJECTPATH/test.o-2.md', 'existing content');
    
    // Create a spy on the fileSystemService.exists method
    const existsSpy = vi.spyOn(cliService['fileSystemService'], 'exists');
    
    // Mock the exists method to return true for the first two incremental filenames
    existsSpy.mockImplementation(async (path: string) => {
      console.log('Checking if exists:', path);
      if (path === '$PROJECTPATH/test.o.md' || 
          path === '$PROJECTPATH/test.o-1.md' || 
          path === '$PROJECTPATH/test.o-2.md') {
        return true;
      }
      return false;
    });
    
    // Call the findAvailableIncrementalFilename method directly
    const result = await (cliService as any).findAvailableIncrementalFilename('$PROJECTPATH/test.o.md');
    
    // Debug log
    console.log('Result:', result);
    
    // Should find the next available incremental filename
    expect(result.outputPath).toContain('test.o-3.md');
    expect(result.shouldOverwrite).toBe(true);
    
    // Restore the spy
    existsSpy.mockRestore();
  });
  
  it('should allow overwriting if user confirms', async () => {
    // Create an existing output file
    await context.services.filesystem.writeFile('$PROJECTPATH/test.o.md', 'existing content');
    
    // Mock user confirming overwrite
    vi.mocked(mockPromptService.getText).mockResolvedValueOnce('y');
    
    // Call the confirmOverwrite method
    const result = await (cliService as any).confirmOverwrite('$PROJECTPATH/test.o.md');
    
    // Should keep the same filename but set shouldOverwrite to true
    expect(result.outputPath).toContain('test.o.md');
    expect(result.shouldOverwrite).toBe(true);
  });
}); 