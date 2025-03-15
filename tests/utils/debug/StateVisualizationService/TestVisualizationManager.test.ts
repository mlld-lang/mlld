import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest';
import { TestVisualizationManager, TestOutputVerbosity } from '@tests/utils/debug/StateVisualizationService/TestVisualizationManager.js';
import { StateVisualizationFileOutput } from '@tests/utils/debug/StateVisualizationService/FileOutputService.js';
import { CompactStateVisualization } from '@tests/utils/debug/StateVisualizationService/CompactStateVisualization.js';
import { IStateVisualizationService } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService.js';
import { IStateHistoryService } from '@tests/utils/debug/StateHistoryService/IStateHistoryService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import fs from 'fs';
import path from 'path';
import { serviceLogger } from '@core/utils/logger.js';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('@core/utils/logger', () => ({
  serviceLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  }
}));

describe('TestVisualizationManager', () => {
  let mockVisualizationService: IStateVisualizationService & { [K in keyof IStateVisualizationService]: Mock };
  let mockHistoryService: IStateHistoryService & { [K in keyof IStateHistoryService]: Mock };
  let mockTrackingService: IStateTrackingService & { [K in keyof IStateTrackingService]: Mock };
  let testVisManager: TestVisualizationManager;
  
  const TEST_OUTPUT_DIR = './logs/test-visualization';

  beforeEach(() => {
    // Mock path.join to return predictable paths
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
    
    // Mock visualization service
    mockVisualizationService = {
      generateHierarchyView: vi.fn().mockReturnValue('mocked hierarchy view'),
      generateTransitionDiagram: vi.fn().mockReturnValue('mocked transition diagram'),
      generateRelationshipGraph: vi.fn().mockReturnValue('mocked relationship graph'),
      generateTimeline: vi.fn().mockReturnValue('mocked timeline'),
      getMetrics: vi.fn().mockReturnValue({
        totalStates: 5,
        statesByType: { new: 2, clone: 1, merge: 2 },
        averageTransformationsPerState: 2.5,
        maxTransformationChainLength: 4,
        averageChildrenPerState: 1.2,
        maxTreeDepth: 3,
        operationFrequency: { create: 5, transform: 10, merge: 2 }
      }),
      exportStateGraph: vi.fn().mockReturnValue('mocked state graph'),
      visualizeContextHierarchy: vi.fn().mockReturnValue('mocked context hierarchy'),
      visualizeVariablePropagation: vi.fn().mockReturnValue('mocked variable propagation'),
      visualizeContextsAndVariableFlow: vi.fn().mockReturnValue('mocked contexts and flow'),
      visualizeResolutionPathTimeline: vi.fn().mockReturnValue('mocked resolution path'),
    };
    
    // Mock history service
    mockHistoryService = {
      recordOperation: vi.fn(),
      getOperationHistory: vi.fn().mockReturnValue([
        { type: 'create', stateId: 'test-state', source: 'new', timestamp: 1000, metadata: { id: 'test-state', source: 'new', createdAt: 1000 } },
        { type: 'transform', stateId: 'test-state', source: 'test', timestamp: 2000 }
      ]),
      getTransformationChain: vi.fn().mockReturnValue([
        { stateId: 'test-state', timestamp: 1000, operation: 'update', source: 'test', before: { value: 1 }, after: { value: 2 } }
      ]),
      queryHistory: vi.fn(),
      getRelatedOperations: vi.fn(),
      clearHistoryBefore: vi.fn(),
    };
    
    // Mock tracking service
    mockTrackingService = {
      registerState: vi.fn(),
      addRelationship: vi.fn(),
      getStateLineage: vi.fn().mockReturnValue(['parent-state', 'test-state']),
      getStateDescendants: vi.fn().mockReturnValue(['child-state']),
      getStateMetadata: vi.fn().mockReturnValue({ id: 'test-state', source: 'new', createdAt: 1000, transformationEnabled: true }),
      getVariableCrossings: vi.fn().mockReturnValue([]),
      getContextHierarchy: vi.fn().mockReturnValue({
        states: [{ id: 'test-state', source: 'new', createdAt: 1000 }],
        boundaries: [],
        variableCrossings: []
      }),
      getAllStates: vi.fn().mockReturnValue([
        { id: 'test-state', source: 'new', createdAt: 1000 }
      ]),
    };
    
    // Create test visualization manager
    testVisManager = new TestVisualizationManager(
      mockVisualizationService,
      mockHistoryService,
      mockTrackingService,
      {
        verbosity: TestOutputVerbosity.Standard,
        outputToFiles: false,
        outputDir: TEST_OUTPUT_DIR,
        defaultFormat: 'mermaid'
      }
    );
    
    // Mock fs exists and mkdir
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('initializes with default options when none provided', () => {
      const defaultManager = new TestVisualizationManager(
        mockVisualizationService,
        mockHistoryService,
        mockTrackingService
      );
      
      expect(defaultManager).toBeDefined();
      expect(serviceLogger.debug).toHaveBeenCalledWith(
        'Test visualization manager initialized',
        expect.objectContaining({ verbosity: TestOutputVerbosity.Standard })
      );
    });
    
    it('respects environment variables for verbosity', () => {
      const originalEnv = process.env.TEST_LOG_LEVEL;
      try {
        process.env.TEST_LOG_LEVEL = 'debug';
        
        const envManager = new TestVisualizationManager(
          mockVisualizationService,
          mockHistoryService,
          mockTrackingService
        );
        
        expect(serviceLogger.debug).toHaveBeenCalledWith(
          'Test visualization manager initialized',
          expect.objectContaining({ verbosity: TestOutputVerbosity.Debug })
        );
      } finally {
        process.env.TEST_LOG_LEVEL = originalEnv;
      }
    });
  });

  describe('visualizeState', () => {
    it('returns null for minimal verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Minimal);
      
      const result = testVisManager.visualizeState('test-state');
      
      expect(result).toBeNull();
    });
    
    it('generates standard summary for standard verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Standard);
      
      const result = testVisManager.visualizeState('test-state');
      
      expect(result).toContain('State test-state');
      expect(mockHistoryService.getOperationHistory).toHaveBeenCalledWith('test-state');
    });
    
    it('generates detailed output for verbose verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Verbose);
      
      const result = testVisManager.visualizeState('test-state');
      
      expect(result).toContain('State test-state');
      expect(result).toContain('transforms');
      expect(mockHistoryService.getTransformationChain).toHaveBeenCalledWith('test-state');
    });
    
    it('generates full debug visualization for debug verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Debug);
      
      const result = testVisManager.visualizeState('test-state');
      
      expect(result).toContain('mocked hierarchy view');
      expect(result).toContain('mocked transition diagram');
      expect(mockVisualizationService.generateHierarchyView).toHaveBeenCalledWith(
        'test-state',
        expect.objectContaining({ format: 'mermaid' })
      );
    });
    
    it('writes to file when outputToFiles is true', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Standard);
      testVisManager.setOutputMode(true);
      
      // Setup fs mock
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      
      const result = testVisManager.visualizeState('test-state', 'test-label');
      
      expect(result).toMatch(/logs\/test-visualization\/state_test-state_test-label/);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('visualizeStates', () => {
    it('returns null for minimal verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Minimal);
      
      const result = testVisManager.visualizeStates(['test-state']);
      
      expect(result).toBeNull();
    });
    
    it('visualizes a single state directly', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Standard);
      
      const spyVisualize = vi.spyOn(testVisManager, 'visualizeState');
      
      testVisManager.visualizeStates(['test-state']);
      
      expect(spyVisualize).toHaveBeenCalledWith('test-state', undefined);
    });
    
    it('generates relationship graph for multiple states in high verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Debug);
      
      const result = testVisManager.visualizeStates(['state1', 'state2']);
      
      expect(mockVisualizationService.generateRelationshipGraph).toHaveBeenCalledWith(
        ['state1', 'state2'],
        expect.objectContaining({ format: 'mermaid' })
      );
      expect(result).toContain('mocked relationship graph');
    });
  });

  describe('visualizeVariableResolution', () => {
    it('returns null for minimal verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Minimal);
      
      const result = testVisManager.visualizeVariableResolution('testVar');
      
      expect(result).toBeNull();
    });
    
    it('generates variable propagation visualization', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Standard);
      
      const result = testVisManager.visualizeVariableResolution('testVar', 'root-state');
      
      expect(mockVisualizationService.visualizeVariablePropagation).toHaveBeenCalledWith(
        'testVar',
        'root-state',
        expect.objectContaining({ format: 'mermaid' })
      );
      expect(result).toContain('mocked variable propagation');
    });
  });

  describe('generateMetrics', () => {
    it('returns null when metrics are disabled', () => {
      testVisManager = new TestVisualizationManager(
        mockVisualizationService,
        mockHistoryService,
        mockTrackingService,
        { includeMetrics: false }
      );
      
      const result = testVisManager.generateMetrics();
      
      expect(result).toBeNull();
    });
    
    it('generates compact metrics for standard verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Standard);
      
      const result = testVisManager.generateMetrics();
      
      expect(result).toContain('State metrics summary');
      expect(result).toContain('Total states: 5');
    });
    
    it('generates detailed metrics for debug verbosity', () => {
      testVisManager.setVerbosity(TestOutputVerbosity.Debug);
      
      const result = testVisManager.generateMetrics();
      
      expect(mockVisualizationService.getMetrics).toHaveBeenCalled();
      expect(result).toContain('"totalStates": 5');
      expect(result).toContain('"statesByType"');
    });
  });

  describe('file output operations', () => {
    it('clears output directory', () => {
      // Setup fs mocks
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['file1.txt', 'file2.txt']);
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);
      
      const result = testVisManager.clearOutputFiles();
      
      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(serviceLogger.debug).toHaveBeenCalledWith(
        'Cleared state visualization output directory',
        expect.any(Object)
      );
    });
    
    it('handles errors during file operations', () => {
      // Setup fs mocks to throw
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('Test error'); });
      
      const result = testVisManager.clearOutputFiles();
      
      expect(result).toBe(false);
      expect(serviceLogger.error).toHaveBeenCalledWith(
        'Failed to clear state visualization output directory',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
});