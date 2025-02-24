import { describe, it, expect, beforeEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { ServiceInitializationError, ServiceInitializationErrorCode } from '@core/errors/ServiceInitializationError.js';
import { validateServicePipeline } from '@core/utils/serviceValidation.js';
import { Services } from '@services/types.js';
import type { DebugSessionConfig } from '@tests/utils/debug/StateDebuggerService/IStateDebuggerService.js';

describe('Pipeline Validation', () => {
  let context: TestContext;
  let services: Services;
  let debugSessionId: string;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    services = context.services;

    // Start debug session
    const config: DebugSessionConfig = {
      captureConfig: {
        capturePoints: ['pre-transform', 'post-transform', 'error'],
        includeFields: ['nodes', 'transformedNodes', 'variables', 'metadata', 'relationships'],
        format: 'full'
      },
      visualization: {
        format: 'mermaid',
        includeMetadata: true,
        includeTimestamps: true
      }
    };
    debugSessionId = await context.startDebugSession(config);
  });

  afterEach(async () => {
    if (debugSessionId) {
      const report = await context.services.debug.generateDebugReport(debugSessionId);
      console.log('\nDebug Report:', report);
      await context.services.debug.endSession(debugSessionId);
    }
  });

  describe('Core Pipeline Services', () => {
    it('validates complete pipeline setup', async () => {
      // Visualize initial service state
      const graph = await context.visualizeState('mermaid');
      console.log('\nInitial Service State:', graph);

      expect(() => validateServicePipeline(services)).not.toThrow();
    });

    it('detects missing required services', async () => {
      const incompleteServices = { ...services };
      delete incompleteServices.parser;

      // Record state before validation
      await context.services.debug.captureState('pre-validation', incompleteServices);

      expect(() => validateServicePipeline(incompleteServices as Services))
        .toThrow(ServiceInitializationError);
      
      try {
        validateServicePipeline(incompleteServices as Services);
      } catch (error) {
        // Record error state
        await context.services.debug.captureState('error', { error, services: incompleteServices });

        expect(error instanceof ServiceInitializationError).toBe(true);
        if (error instanceof ServiceInitializationError) {
          expect(error.code).toBe(ServiceInitializationErrorCode.MISSING_REQUIRED_SERVICE);
          expect(error.context.service).toBe('parser');
        }
      }
    });

    it('validates service dependencies', async () => {
      const incompleteServices = { ...services };
      delete incompleteServices.state;

      // Record state before validation
      await context.services.debug.captureState('pre-validation', incompleteServices);

      expect(() => validateServicePipeline(incompleteServices as Services))
        .toThrow(ServiceInitializationError);
      
      try {
        validateServicePipeline(incompleteServices as Services);
      } catch (error) {
        // Record error state
        await context.services.debug.captureState('error', { error, services: incompleteServices });

        expect(error instanceof ServiceInitializationError).toBe(true);
        if (error instanceof ServiceInitializationError) {
          expect(error.code).toBe(ServiceInitializationErrorCode.MISSING_REQUIRED_SERVICE);
          expect(error.context.service).toBe('state');
        }
      }
    });
  });

  describe('Transformation Support', () => {
    it('verifies state transformation capabilities', async () => {
      const mockServices = { ...services };
      mockServices.state.hasTransformationSupport = () => false;

      // Record state before validation
      await context.services.debug.captureState('pre-validation', mockServices);

      expect(() => validateServicePipeline(mockServices))
        .toThrow(ServiceInitializationError);
      
      try {
        validateServicePipeline(mockServices);
      } catch (error) {
        // Record error state and visualize
        await context.services.debug.captureState('error', { error, services: mockServices });
        const errorGraph = await context.visualizeState('mermaid');
        console.log('\nError State:', errorGraph);

        expect(error instanceof ServiceInitializationError).toBe(true);
        if (error instanceof ServiceInitializationError) {
          expect(error.code).toBe(ServiceInitializationErrorCode.TRANSFORMATION_SUPPORT_MISSING);
          expect(error.context.service).toBe('state');
          expect(error.context.transformationCapability).toBe('hasTransformationSupport');
        }
      }
    });

    it('verifies interpreter can handle transformations', async () => {
      const mockServices = { ...services };
      mockServices.interpreter.canHandleTransformations = () => false;

      // Record state before validation
      await context.services.debug.captureState('pre-validation', mockServices);

      expect(() => validateServicePipeline(mockServices))
        .toThrow(ServiceInitializationError);
      
      try {
        validateServicePipeline(mockServices);
      } catch (error) {
        // Record error state
        await context.services.debug.captureState('error', { error, services: mockServices });

        expect(error instanceof ServiceInitializationError).toBe(true);
        if (error instanceof ServiceInitializationError) {
          expect(error.code).toBe(ServiceInitializationErrorCode.TRANSFORMATION_SUPPORT_MISSING);
          expect(error.context.service).toBe('interpreter');
          expect(error.context.transformationCapability).toBe('canHandleTransformations');
        }
      }
    });

    it('ensures output service can access transformed nodes', async () => {
      const mockServices = { ...services };
      mockServices.output.canAccessTransformedNodes = () => false;

      // Record state before validation
      await context.services.debug.captureState('pre-validation', mockServices);

      expect(() => validateServicePipeline(mockServices))
        .toThrow(ServiceInitializationError);
      
      try {
        validateServicePipeline(mockServices);
      } catch (error) {
        // Record error state
        await context.services.debug.captureState('error', { error, services: mockServices });

        expect(error instanceof ServiceInitializationError).toBe(true);
        if (error instanceof ServiceInitializationError) {
          expect(error.code).toBe(ServiceInitializationErrorCode.TRANSFORMATION_SUPPORT_MISSING);
          expect(error.context.service).toBe('output');
          expect(error.context.transformationCapability).toBe('canAccessTransformedNodes');
        }
      }
    });
  });

  describe('Initialization Order', () => {
    it('validates correct initialization order', async () => {
      // Visualize service initialization order
      const graph = await context.visualizeState('mermaid');
      console.log('\nService Initialization Order:', graph);

      expect(() => validateServicePipeline(services)).not.toThrow();
    });

    it('detects invalid initialization order', async () => {
      const mockServices = { ...services };
      delete mockServices.filesystem;

      // Record state before validation
      await context.services.debug.captureState('pre-validation', mockServices);

      expect(() => validateServicePipeline(mockServices as Services))
        .toThrow(ServiceInitializationError);
      
      try {
        validateServicePipeline(mockServices as Services);
      } catch (error) {
        // Record error state and visualize
        await context.services.debug.captureState('error', { error, services: mockServices });
        const errorGraph = await context.visualizeState('mermaid');
        console.log('\nInvalid Initialization Order:', errorGraph);

        expect(error instanceof ServiceInitializationError).toBe(true);
        if (error instanceof ServiceInitializationError) {
          expect(error.code).toBe(ServiceInitializationErrorCode.MISSING_REQUIRED_SERVICE);
          expect(error.context.service).toBe('filesystem');
        }
      }
    });
  });
}); 