import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { SourceMapService, sourceMapService, SourceLocation, ISourceMapService } from '@core/utils/SourceMapService.js';
import { extractErrorLocation, extractLocationFromErrorObject, addMapping, resetSourceMaps } from '@core/utils/sourceMapUtils.js';
import { MeldError } from '@core/errors/MeldError.js';
import { enhanceMeldErrorWithSourceInfo } from '@core/utils/sourceMapUtils.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { container } from 'tsyringe';
import { ErrorSeverity } from '@core/errors/MeldError.js';

describe('SourceMapService', () => {
  // Test for non-DI mode
  describe('non-DI mode', () => {
    beforeEach(() => {
      // Reset source maps before each test
      resetSourceMaps();
    });

    test('should register source files', () => {
      const service = new SourceMapService();
      service.registerSource('/path/to/file.md', 'line 1\nline 2\nline 3');
      
      // This is just testing that it doesn't throw
      expect(service).toBeDefined();
    });

    test('should add mappings', () => {
      const service = new SourceMapService();
      const sourceLocation: SourceLocation = {
        filePath: '/path/to/file.md',
        line: 1,
        column: 0
      };
      
      service.addMapping(sourceLocation, 10, 5);
      
      // This is just testing that it doesn't throw
      expect(service).toBeDefined();
    });

    test('should find original location for a given combined location', () => {
      const service = new SourceMapService();
      
      // Register source
      service.registerSource('/path/to/file.md', 'line 1\nline 2\nline 3');
      
      // Add mapping from source line 1 to combined line 10
      service.addMapping(
        { filePath: '/path/to/file.md', line: 1, column: 0 },
        10,
        0
      );
      
      // Find original location for combined line 12
      const originalLocation = service.findOriginalLocation(12, 0);
      
      // Should map to source line 3 (1 + (12 - 10))
      expect(originalLocation).toEqual({
        filePath: '/path/to/file.md',
        line: 3,
        column: 0
      });
    });

    test('should handle multiple mappings', () => {
      const service = new SourceMapService();
      
      // Register sources
      service.registerSource('/path/to/file1.md', 'source1 line 1\nsource1 line 2');
      service.registerSource('/path/to/file2.md', 'source2 line 1\nsource2 line 2');
      
      // Add mappings
      service.addMapping(
        { filePath: '/path/to/file1.md', line: 1, column: 0 },
        10,
        0
      );
      
      service.addMapping(
        { filePath: '/path/to/file2.md', line: 1, column: 0 },
        20,
        0
      );
      
      // Find original locations
      const location1 = service.findOriginalLocation(11, 0);
      const location2 = service.findOriginalLocation(21, 0);
      
      // Should map to the correct source files and lines
      expect(location1).toEqual({
        filePath: '/path/to/file1.md',
        line: 2,
        column: 0
      });
      
      expect(location2).toEqual({
        filePath: '/path/to/file2.md',
        line: 2,
        column: 0
      });
    });

    test('should return null if no mapping exists', () => {
      const service = new SourceMapService();
      
      // No mappings registered
      const location = service.findOriginalLocation(10, 0);
      
      expect(location).toBeNull();
    });

    test('should provide debug info', () => {
      const service = new SourceMapService();
      
      // Add a mapping
      service.addMapping(
        { filePath: '/path/to/file.md', line: 1, column: 0 },
        10,
        0
      );
      
      // Get debug info
      const debug = service.getDebugInfo();
      
      // Should contain mapping info
      expect(debug).toContain('/path/to/file.md:1:0 -> 10:0');
    });
  });

  // Test for DI mode
  describe('DI mode', () => {
    const helpers = TestContextDI.createTestHelpers(); // Define helpers
    let testContext: TestContextDI;
    let sourceMapService: ISourceMapService;

    beforeEach(async () => {
      // Create a new test context using the minimal setup helper
      testContext = helpers.setupMinimal();
      // Initialize if needed (setupMinimal might handle this)
      // await testContext.initialize(); 

      // Resolve the SourceMapService using the context resolver
      sourceMapService = await testContext.resolve<ISourceMapService>('ISourceMapService');
      
      // Reset the service for clean test state
      sourceMapService.reset();
    });

    // Add afterEach for cleanup
    afterEach(async () => {
      await testContext?.cleanup();
    });

    test('should register source files via DI', () => {
      sourceMapService.registerSource('/path/to/file.md', 'line 1\nline 2\nline 3');
      
      // This just tests that it doesn't throw
      expect(sourceMapService).toBeDefined();
    });

    test('should add mappings via DI', () => {
      const sourceLocation: SourceLocation = {
        filePath: '/path/to/file.md',
        line: 1,
        column: 0
      };
      
      sourceMapService.addMapping(sourceLocation, 10, 5);
      
      // This just tests that it doesn't throw
      expect(sourceMapService).toBeDefined();
    });

    test('should find original location for a given combined location via DI', () => {
      // Register source
      sourceMapService.registerSource('/path/to/file.md', 'line 1\nline 2\nline 3');
      
      // Add mapping from source line 1 to combined line 10
      sourceMapService.addMapping(
        { filePath: '/path/to/file.md', line: 1, column: 0 },
        10,
        0
      );
      
      // Find original location for combined line 12
      const originalLocation = sourceMapService.findOriginalLocation(12, 0);
      
      // Should map to source line 3 (1 + (12 - 10))
      expect(originalLocation).toEqual({
        filePath: '/path/to/file.md',
        line: 3,
        column: 0
      });
    });

    test('should handle multiple mappings via DI', () => {
      // Register sources
      sourceMapService.registerSource('/path/to/file1.md', 'source1 line 1\nsource1 line 2');
      sourceMapService.registerSource('/path/to/file2.md', 'source2 line 1\nsource2 line 2');
      
      // Add mappings
      sourceMapService.addMapping(
        { filePath: '/path/to/file1.md', line: 1, column: 0 },
        10,
        0
      );
      
      sourceMapService.addMapping(
        { filePath: '/path/to/file2.md', line: 1, column: 0 },
        20,
        0
      );
      
      // Find original locations
      const location1 = sourceMapService.findOriginalLocation(11, 0);
      const location2 = sourceMapService.findOriginalLocation(21, 0);
      
      // Should map to the correct source files and lines
      expect(location1).toEqual({
        filePath: '/path/to/file1.md',
        line: 2,
        column: 0
      });
      
      expect(location2).toEqual({
        filePath: '/path/to/file2.md',
        line: 2,
        column: 0
      });
    });

    test('should provide debug info via DI', () => {
      // Add a mapping
      sourceMapService.addMapping(
        { filePath: '/path/to/file.md', line: 1, column: 0 },
        10,
        0
      );
      
      // Get debug info
      const debug = sourceMapService.getDebugInfo();
      
      // Should contain mapping info
      expect(debug).toContain('/path/to/file.md:1:0 -> 10:0');
    });
  });
});

describe('sourceMapUtils', () => {
  beforeEach(() => {
    // Reset source maps before each test
    resetSourceMaps();
  });

  test('should extract line and column from error message', () => {
    const error = new Error('Error at line 10, column 5');
    const location = extractErrorLocation(error);
    
    expect(location).toEqual({
      line: 10,
      column: 5
    });
  });

  test('should extract location from error object', () => {
    const error = {
      message: 'Error message',
      location: {
        start: {
          line: 10,
          column: 5
        },
        end: {
          line: 10,
          column: 10
        }
      }
    };
    
    const location = extractLocationFromErrorObject(error);
    
    expect(location).toEqual({
      line: 10,
      column: 5
    });
  });

  test('should enhance MeldError with source information', () => {
    // Set up source mapping
    addMapping('/path/to/source.md', 1, 0, 10, 0);
    
    // Create error with location in message
    const error = new MeldError('Error at line 10, column 5', {
      code: 'TEST_ERROR',
      severity: ErrorSeverity.Fatal,
      details: { original: 'context' } // Add some details
    });
    
    // Enhance error
    const enhanced = enhanceMeldErrorWithSourceInfo(error);
    
    // Check enhanced message
    expect(enhanced.message).toContain('/path/to/source.md:1');
    // Check the top-level sourceLocation property
    expect(enhanced.sourceLocation).toEqual({
      filePath: '/path/to/source.md',
      line: 1,
      column: 5
    });
    // Check that original details were preserved
    expect(enhanced.details).toEqual({ original: 'context' });
  });
});