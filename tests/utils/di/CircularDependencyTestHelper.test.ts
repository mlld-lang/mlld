import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DependencyContainer } from 'tsyringe';
import CircularDependencyTestHelper from './CircularDependencyTestHelper';
import TestContainerHelper from './TestContainerHelper';
import * as ServiceProvider from '../../../core/ServiceProvider';

describe('CircularDependencyTestHelper', () => {
  let originalShouldUseDI: typeof ServiceProvider.shouldUseDI;
  
  beforeEach(() => {
    originalShouldUseDI = ServiceProvider.shouldUseDI;
    vi.spyOn(ServiceProvider, 'shouldUseDI').mockReturnValue(true);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('Circular dependency detection', () => {
    let container: DependencyContainer;

    beforeEach(() => {
      container = CircularDependencyTestHelper.createCircularContainer();
    });

    it('should detect circular dependencies when resolving ServiceA', () => {
      expect(() => {
        CircularDependencyTestHelper.createDependencyCycle(container);
      }).toThrow();
    });

    it('should provide cycle information', () => {
      const cycleInfo = CircularDependencyTestHelper.getCycleInfo(container);
      expect(cycleInfo).toHaveProperty('hasCycle', true);
      expect(cycleInfo).toHaveProperty('error');
    });
  });

  describe('Lazy circular dependency resolution', () => {
    let container: DependencyContainer;

    beforeEach(() => {
      const containerHelper = TestContainerHelper.createTestContainer();
      container = containerHelper.getContainer();
      CircularDependencyTestHelper.setupSafeLazyCircularDependencies(container);
    });

    it('should resolve circular dependencies with lazy injection', () => {
      expect(CircularDependencyTestHelper.testLazyCircularDependencies(container)).toBe(true);
    });

    it('should create a proper circular reference between D and E', () => {
      const helper = new TestContainerHelper(container);
      const resolver = helper.resolve<any>('IDependencyHelper');
      expect(resolver.canResolveCircularDependencies()).toBe(true);
    });
  });

  describe('Helper functions', () => {
    it('should create a test container with circular dependencies configured', () => {
      const container = CircularDependencyTestHelper.createCircularContainer();
      expect(container).toBeDefined();
      
      // Container should have the circular services registered
      const helper = new TestContainerHelper(container);
      expect(helper.isRegistered('IServiceA')).toBe(true);
      expect(helper.isRegistered('IServiceB')).toBe(true);
      expect(helper.isRegistered('IServiceC')).toBe(true);
    });
  });
});