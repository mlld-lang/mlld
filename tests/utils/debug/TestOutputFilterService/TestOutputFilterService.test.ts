/**
 * Tests for TestOutputFilterService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestOutputFilterService } from './TestOutputFilterService';
import { TestOutputVerbosity } from '../StateVisualizationService/TestVisualizationManager';
import { LogLevel, TestOutputOptions } from './ITestOutputFilterService';

describe('TestOutputFilterService', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Reset environment variables that might affect tests
    delete process.env.TEST_OUTPUT_VERBOSITY;
    delete process.env.TEST_VERBOSITY;
    delete process.env.TEST_LOG_LEVEL;
    delete process.env.TEST_OUTPUT_TO_FILES;
    delete process.env.TEST_OUTPUT_DIR;
    
    // Mock logger
    vi.mock('@core/utils/logger', () => ({
      serviceLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    }));
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clear mocks
    vi.clearAllMocks();
  });
  
  describe('initialization', () => {
    it('should initialize with default verbosity', () => {
      const service = new TestOutputFilterService();
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Standard);
    });
    
    it('should initialize with environment verbosity', () => {
      process.env.TEST_OUTPUT_VERBOSITY = 'minimal';
      const service = new TestOutputFilterService();
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Minimal);
    });
    
    it('should initialize with provided configuration', () => {
      const config: TestOutputOptions = {
        verbosity: TestOutputVerbosity.Verbose,
        maxDepth: 5,
        outputToFiles: true
      };
      
      const service = new TestOutputFilterService(config);
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Verbose);
      
      // Test depth by checking if deeper objects are filtered
      const deepObject = { a: { b: { c: { d: { e: 'value' } } } } };
      const filtered = service.filterStateOutput(deepObject);
      
      // With maxDepth 5, we should still see the full structure
      expect(filtered).toHaveProperty('a.b.c.d.e');
    });
  });
  
  describe('verbosity control', () => {
    it('should set default verbosity', () => {
      const service = new TestOutputFilterService();
      service.setDefaultVerbosity(TestOutputVerbosity.Verbose);
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Verbose);
      
      // Reset should revert to default
      service.configureTestOutput({ verbosity: TestOutputVerbosity.Minimal });
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Minimal);
      
      service.reset();
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Verbose);
    });
    
    it('should configure test-specific verbosity', () => {
      const service = new TestOutputFilterService();
      
      // Set test-specific config
      service.configureTestOutput({ verbosity: TestOutputVerbosity.Debug });
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Debug);
      
      // Reset back to default
      service.reset();
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Standard);
    });
  });
  
  describe('operation filtering', () => {
    it('should always log errors regardless of verbosity', () => {
      const service = new TestOutputFilterService({ 
        verbosity: TestOutputVerbosity.Minimal 
      });
      
      expect(service.shouldLogOperation('anyOperation', LogLevel.Error)).toBe(true);
    });
    
    it('should filter operations based on verbosity', () => {
      const service = new TestOutputFilterService({ 
        verbosity: TestOutputVerbosity.Standard 
      });
      
      // Standard verbosity includes Info but not Debug
      expect(service.shouldLogOperation('operation1', LogLevel.Info)).toBe(true);
      expect(service.shouldLogOperation('operation2', LogLevel.Debug)).toBe(false);
      
      // Change to verbose - should now include Debug
      service.configureTestOutput({ verbosity: TestOutputVerbosity.Verbose });
      expect(service.shouldLogOperation('operation2', LogLevel.Debug)).toBe(true);
    });
    
    it('should respect operation inclusion list', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Minimal,
        includeOperations: ['specialOperation']
      });
      
      // Normally this would be filtered in minimal mode
      expect(service.shouldLogOperation('specialOperation', LogLevel.Info)).toBe(true);
      expect(service.shouldLogOperation('otherOperation', LogLevel.Info)).toBe(false);
    });
    
    it('should respect operation exclusion list', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Verbose,
        excludeOperations: ['noisyOperation']
      });
      
      // Should be filtered out despite verbose mode
      expect(service.shouldLogOperation('noisyOperation', LogLevel.Debug)).toBe(false);
      expect(service.shouldLogOperation('otherOperation', LogLevel.Debug)).toBe(true);
    });
    
    it('should apply default exclusions based on verbosity', () => {
      // Standard mode should exclude detailed operations
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Standard
      });
      
      expect(service.shouldLogOperation('resolveVariable', LogLevel.Info)).toBe(false);
      expect(service.shouldLogOperation('validateDirective', LogLevel.Info)).toBe(false);
      
      // Debug mode should include all operations
      service.configureTestOutput({ verbosity: TestOutputVerbosity.Debug });
      expect(service.shouldLogOperation('resolveVariable', LogLevel.Info)).toBe(true);
      expect(service.shouldLogOperation('validateDirective', LogLevel.Info)).toBe(true);
    });
  });
  
  describe('state data filtering', () => {
    it('should filter state data based on verbosity', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Minimal
      });
      
      const stateData = { id: '123', nodes: [], variables: {} };
      
      // In minimal mode, info-level data should be filtered out
      expect(service.filterStateOutput(stateData, LogLevel.Info)).toBeNull();
      
      // Error level data should still be returned
      expect(service.filterStateOutput(stateData, LogLevel.Error)).toEqual(stateData);
    });
    
    it('should limit object nesting depth', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Standard,
        maxDepth: 2
      });
      
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: 'deep value'
            }
          }
        }
      };
      
      const filtered = service.filterStateOutput(deepObject);
      
      // level3 should be replaced with [Object]
      expect(filtered).toHaveProperty('level1.level2');
      expect(filtered.level1.level2).toBe('[Object]');
    });
    
    it('should filter state fields based on include/exclude lists', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Standard,
        includeStateFields: ['id', 'name']
      });
      
      const stateData = { 
        id: '123', 
        name: 'Test State', 
        nodes: [], 
        variables: {}, 
        metadata: {} 
      };
      
      const filtered = service.filterStateOutput(stateData);
      
      // Only included fields should be present
      expect(filtered).toHaveProperty('id');
      expect(filtered).toHaveProperty('name');
      expect(filtered).not.toHaveProperty('nodes');
      expect(filtered).not.toHaveProperty('variables');
      expect(filtered).not.toHaveProperty('metadata');
      
      // Now test with exclude list
      service.configureTestOutput({
        verbosity: TestOutputVerbosity.Standard,
        includeStateFields: [],
        excludeStateFields: ['metadata', 'nodes']
      });
      
      const filteredWithExclude = service.filterStateOutput(stateData);
      
      // Excluded fields should be removed
      expect(filteredWithExclude).toHaveProperty('id');
      expect(filteredWithExclude).toHaveProperty('name');
      expect(filteredWithExclude).toHaveProperty('variables');
      expect(filteredWithExclude).not.toHaveProperty('nodes');
      expect(filteredWithExclude).not.toHaveProperty('metadata');
    });
    
    it('should handle arrays correctly', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Standard,
        maxDepth: 1
      });
      
      const arrayData = [
        { id: '1', deep: { value: 'too deep' } },
        { id: '2', deep: { value: 'too deep' } }
      ];
      
      const filtered = service.filterStateOutput(arrayData);
      
      // Should keep array structure but limit depth
      expect(Array.isArray(filtered)).toBe(true);
      expect(filtered).toHaveLength(2);
      expect(filtered[0]).toHaveProperty('id', '1');
      expect(filtered[0].deep).toBe('[Object]');
    });
  });
  
  describe('state visualization control', () => {
    it('should control state visualization based on verbosity', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Minimal
      });
      
      // Minimal mode should not visualize states
      expect(service.shouldVisualizeState('state1')).toBe(false);
      
      // Standard mode should visualize states
      service.configureTestOutput({ verbosity: TestOutputVerbosity.Standard });
      expect(service.shouldVisualizeState('state1')).toBe(true);
    });
    
    it('should always visualize specific states', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Minimal,
        alwaysVisualizeStates: ['importantState']
      });
      
      // Should visualize even in minimal mode
      expect(service.shouldVisualizeState('importantState')).toBe(true);
      expect(service.shouldVisualizeState('otherState')).toBe(false);
    });
  });
  
  describe('reset functionality', () => {
    it('should reset configuration to defaults', () => {
      const service = new TestOutputFilterService({
        verbosity: TestOutputVerbosity.Standard
      });
      
      // Apply custom configuration
      service.configureTestOutput({
        verbosity: TestOutputVerbosity.Debug,
        includeOperations: ['special'],
        excludeStateFields: ['private'],
        alwaysVisualizeStates: ['important']
      });
      
      // Verify configuration is applied
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Debug);
      expect(service.shouldLogOperation('special')).toBe(true);
      expect(service.shouldVisualizeState('important')).toBe(true);
      
      // Reset configuration
      service.reset();
      
      // Should be back to defaults
      expect(service.getVerbosity()).toBe(TestOutputVerbosity.Standard);
      expect(service.shouldLogOperation('special', LogLevel.Debug)).toBe(false);
      expect(service.shouldVisualizeState('important')).toBe(true); // Standard mode visualizes all states
    });
  });
});