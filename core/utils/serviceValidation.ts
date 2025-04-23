import { SERVICE_DEPENDENCIES, ServiceName, TransformationCapableService } from '@core/types/dependencies';
import { ServiceInitializationError, ServiceInitializationErrorCode } from '@core/errors/ServiceInitializationError';
import { Services } from '@services/types';

/**
 * Validates that all required services are present
 */
export function validateRequiredServices(services: Partial<Services>): void {
  const requiredServices: ServiceName[] = [
    'parser',
    'interpreter',
    'directive',
    'state',
    'output',
    'filesystem',
    'path',
    'validation',
    'circularity',
    'resolution'
  ];

  for (const serviceName of requiredServices) {
    if (!services[serviceName]) {
      throw new ServiceInitializationError(
        ServiceInitializationErrorCode.MISSING_REQUIRED_SERVICE,
        { service: serviceName }
      );
    }
  }
}

/**
 * Validates that all service dependencies are satisfied
 */
export function validateServiceDependencies(services: Partial<Services>): void {
  for (const [serviceName, dependencies] of Object.entries(SERVICE_DEPENDENCIES)) {
    if (!services[serviceName]) continue; // Skip optional services

    const missingDeps = dependencies.filter(dep => !services[dep]);
    if (missingDeps.length > 0) {
      throw new ServiceInitializationError(
        ServiceInitializationErrorCode.MISSING_DEPENDENCIES,
        {
          service: serviceName as ServiceName,
          missingDependencies: missingDeps as ServiceName[]
        }
      );
    }
  }
}

/**
 * Validates that services are initialized in the correct order
 */
export function validateInitializationOrder(services: Partial<Services>): void {
  const initialized = new Set<ServiceName>();

  // Helper to check if all dependencies are initialized
  const areDependenciesInitialized = (serviceName: ServiceName): boolean => {
    const dependencies = SERVICE_DEPENDENCIES[serviceName];
    return dependencies.every(dep => {
      // Special handling for directive/interpreter circular dependency
      if (serviceName === 'directive' && dep === 'interpreter') {
        return true; // Skip interpreter check for directive
      }
      if (serviceName === 'interpreter' && dep === 'directive') {
        return true; // Skip directive check for interpreter
      }
      return initialized.has(dep as ServiceName);
    });
  };

  // Check each service in the expected initialization order
  const initOrder: ServiceName[] = [
    'filesystem',
    'path',
    'eventService',
    'state',
    'parser',
    'resolution',
    'validation',
    'circularity',
    'directive',
    'interpreter',
    'output'
  ];

  for (const serviceName of initOrder) {
    if (!services[serviceName]) continue;

    if (!areDependenciesInitialized(serviceName)) {
      throw new ServiceInitializationError(
        ServiceInitializationErrorCode.INVALID_INITIALIZATION_ORDER,
        {
          service: serviceName,
          requiredServices: SERVICE_DEPENDENCIES[serviceName].filter(dep => {
            // Filter out circular dependencies from error message
            if (serviceName === 'directive' && dep === 'interpreter') return false;
            if (serviceName === 'interpreter' && dep === 'directive') return false;
            return true;
          }) as ServiceName[]
        }
      );
    }

    initialized.add(serviceName);
  }
}

/**
 * Validates transformation capabilities of services
 */
export function validateTransformationCapabilities(services: Services): void {
  // State service must support transformations
  if (!services.state.hasTransformationSupport?.()) {
    throw new ServiceInitializationError(
      ServiceInitializationErrorCode.TRANSFORMATION_SUPPORT_MISSING,
      {
        service: 'state',
        transformationCapability: 'hasTransformationSupport'
      }
    );
  }

  // Interpreter must handle transformations
  if (!services.interpreter.canHandleTransformations?.()) {
    throw new ServiceInitializationError(
      ServiceInitializationErrorCode.TRANSFORMATION_SUPPORT_MISSING,
      {
        service: 'interpreter',
        transformationCapability: 'canHandleTransformations'
      }
    );
  }

  // Output service must access transformed nodes
  if (!services.output.canAccessTransformedNodes?.()) {
    throw new ServiceInitializationError(
      ServiceInitializationErrorCode.TRANSFORMATION_SUPPORT_MISSING,
      {
        service: 'output',
        transformationCapability: 'canAccessTransformedNodes'
      }
    );
  }
}

/**
 * Validates the complete service pipeline
 * This includes checking required services, dependencies,
 * initialization order, and transformation capabilities
 */
export function validateServicePipeline(services: Services): void {
  validateRequiredServices(services);
  validateServiceDependencies(services);
  validateInitializationOrder(services);
  validateTransformationCapabilities(services);
} 