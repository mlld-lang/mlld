import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';
import { createTestContainerWithCircularDeps } from './CircularDependencyTestHelper';
import { injectable, container } from 'tsyringe';

// Test interfaces and classes for circular dependency testing
interface IServiceD {
  getName(): string;
  getE(): IServiceE;
}

interface IServiceE {
  getName(): string;
  useD(d: IServiceD): void;
  getD(): IServiceD | null;
}

// Simple circular dependency example
@injectable()
class ServiceE implements IServiceE {
  private serviceD: IServiceD | null = null;

  getName(): string {
    return 'ServiceE';
  }

  useD(d: IServiceD): void {
    this.serviceD = d;
  }

  getD(): IServiceD | null {
    return this.serviceD;
  }
}

@injectable()
class ServiceD implements IServiceD {
  constructor(private serviceE: IServiceE) {}

  getName(): string {
    return 'ServiceD';
  }

  getE(): IServiceE {
    return this.serviceE;
  }
}

describe('CircularDependencyTestHelper', () => {
  beforeEach(() => {
    // Reset container for tests
    container.reset();
  });

  afterEach(() => {
    // Restore all mocks
    vi.restoreAllMocks();
  });

  describe('Lazy circular dependency resolution', () => {
    it('should resolve circular dependencies with lazy injection', () => {
      const container = createTestContainerWithCircularDeps();
      
      // Should not throw when resolving with lazy injection
      const serviceD = container.resolve<IServiceD>('IServiceD');
      const serviceE = container.resolve<IServiceE>('IServiceE');
      
      expect(serviceD).toBeDefined();
      expect(serviceE).toBeDefined();
      expect(serviceD.getName()).toBe('ServiceD');
      expect(serviceE.getName()).toBe('ServiceE');
    });
  });

  describe('Helper functions', () => {
    it('should create a test container with circular dependencies configured', () => {
      const container = createTestContainerWithCircularDeps();
      
      expect(container).toBeDefined();
      expect(() => container.resolve<IServiceD>('IServiceD')).not.toThrow();
      expect(() => container.resolve<IServiceE>('IServiceE')).not.toThrow();
    });
  });
});