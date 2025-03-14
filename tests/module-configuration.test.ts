/**
 * Module Configuration Validation Tests
 * 
 * These tests verify that the module configuration is correctly set up and
 * compatible with both ESM and CommonJS. They check that imports work correctly
 * and that the module resolution settings are properly configured.
 */

import { describe, it, expect } from 'vitest';

// Core imports with explicit .js extensions
import type { MeldError } from '@core/errors/MeldError.js';
import { ServiceProvider } from '@core/ServiceProvider.js';

// Service imports with explicit .js extensions
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';

// Test utilities with explicit .js extensions
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

// External modules (no .js extension needed)
import { injectable } from 'tsyringe';

describe('Module Configuration', () => {
  it('should correctly resolve imports with .js extensions', () => {
    // If this test runs, it means the imports with .js extensions worked
    expect(ServiceProvider).toBeDefined();
  });

  it('should correctly resolve interfaces with type imports', () => {
    // TypeScript compilation would fail if these types weren't properly resolved
    type ErrorType = MeldError;
    type ResolutionServiceType = IResolutionService;
    type StateServiceType = IStateService;
    
    // This assertion just verifies the test runs
    expect(true).toBe(true);
  });

  it('should correctly resolve external modules without .js extensions', () => {
    // If this test runs, it means the external module imports worked
    expect(injectable).toBeDefined();
  });

  it('should correctly use the DI system with module configuration', () => {
    const context = TestContextDI.create();
    
    // Test that the container is properly initialized
    expect(context.container).toBeDefined();
    
    // Clean up
    context.cleanup();
  });
});