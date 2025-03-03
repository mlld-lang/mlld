/**
 * Sample test demonstrating the selective output features.
 * This shows how to use the new selective test output tools in real tests.
 */

import { describe, it, expect } from 'vitest';
import { withTestOutput } from '../../tests/utils/debug/vitest-output-setup';
import { TestOutputVerbosity } from '../../tests/utils/debug/StateVisualizationService/TestVisualizationManager';
import { getOutputFilterInstance } from '../../tests/utils/debug/TestOutputFilterService';

// Sample test suite with mixed verbosity levels
describe('Example test suite with selective output', () => {
  // Test with default verbosity
  it('should run with standard output', async () => {
    // Use TestContext as normal
    const context = globalThis.testContext;
    const result = await context.parseContent('example test content');
    expect(result).toBeDefined();
  });
  
  // Test with verbose output using the decorator function
  it('should run with verbose output', 
    withTestOutput({ verbosity: TestOutputVerbosity.Verbose })
    (async () => {
      const context = globalThis.testContext;
      const result = await context.parseContent('example test content with verbose output');
      
      // Inside the test, you can access the global instance
      expect(globalThis.testOutputFilter.getVerbosity()).toBe(TestOutputVerbosity.Verbose);
      expect(result).toBeDefined();
    })
  );
  
  // Test with minimal output but one important state always shown
  it('should run with minimal output but show specific states',
    withTestOutput({
      verbosity: TestOutputVerbosity.Minimal,
      alwaysVisualizeStates: ['importantStateId']
    })
    (async () => {
      const context = globalThis.testContext;
      const result = await context.parseContent('minimal output example');
      
      // Get the output filter to check if states should be visualized
      const outputFilter = getOutputFilterInstance();
      
      // Only the important state will be shown
      expect(outputFilter.shouldVisualizeState('importantStateId')).toBe(true);
      expect(outputFilter.shouldVisualizeState('otherStateId')).toBe(false);
      
      expect(result).toBeDefined();
    })
  );
  
  // Test with custom operation filtering
  it('should filter specific operations',
    withTestOutput({
      verbosity: TestOutputVerbosity.Standard,
      includeOperations: ['mySpecialOperation'],
      excludeOperations: ['verboseOperation']
    })
    (async () => {
      const context = globalThis.testContext;
      const outputFilter = getOutputFilterInstance();
      
      // Check operation filtering
      expect(outputFilter.shouldLogOperation('mySpecialOperation')).toBe(true);
      expect(outputFilter.shouldLogOperation('verboseOperation')).toBe(false);
    })
  );
});

// Example of filtering state output fields
describe('State data filtering tests', () => {
  it('should filter state data fields',
    withTestOutput({
      verbosity: TestOutputVerbosity.Standard,
      includeStateFields: ['id', 'name', 'type'],
      maxDepth: 2
    })
    (async () => {
      const outputFilter = getOutputFilterInstance();
      
      // Sample state data
      const stateData = {
        id: '123',
        name: 'Test State',
        type: 'example',
        createdAt: Date.now(),
        metadata: {
          source: 'test',
          deep: {
            nested: {
              value: 'too deep'
            }
          }
        }
      };
      
      // Filter the state data
      const filtered = outputFilter.filterStateOutput(stateData);
      
      // Should only include specified fields
      expect(filtered).toHaveProperty('id');
      expect(filtered).toHaveProperty('name');
      expect(filtered).toHaveProperty('type');
      expect(filtered).not.toHaveProperty('createdAt');
      expect(filtered).not.toHaveProperty('metadata');
    })
  );
});