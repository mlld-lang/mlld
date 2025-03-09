/**
 * ServiceProvider is a compatibility layer that provides dependency injection 
 * with a seamless transition between the legacy manual instantiation and the 
 * new tsyringe-based DI system.
 * 
 * It supports both modes of operation based on the USE_DI environment variable.
 */

import { container, injectable, ClassProvider, InjectionToken } from 'tsyringe';
import 'reflect-metadata';

/**
 * Metadata key for storing service dependencies
 */
const SERVICE_METADATA_KEY = Symbol('service:metadata');

/**
 * Interface for service metadata
 */
export interface ServiceMetadata {
  name: string;
  interfaceName?: string;
  description?: string;
  dependencies?: Array<{ token: string | symbol; name: string }>;
}

/**
 * Determines if DI should be used based on the USE_DI environment variable
 */
export const shouldUseDI = (): boolean => {
  return true; // Always use DI - Phase 5 migration
};

/**
 * Creates a new instance of a service through DI.
 * 
 * @param ServiceClass The service class to instantiate
 * @param dependencies The dependencies to pass to the constructor (for legacy mode, now ignored)
 * @returns A new instance of the service
 */
export function createService<T, D extends any[]>(
  ServiceClass: new (...args: D) => T,
  ...dependencies: D
): T {
  // In Phase 5, always use DI
  return container.resolve(ServiceClass);
}

/**
 * Resolves a service from the container by token string
 * 
 * @param token The token to resolve
 * @returns The resolved service
 */
export function resolveService<T>(token: string | InjectionToken<T>): T {
  return container.resolve<T>(token);
}

/**
 * Registers a service implementation in the container
 * 
 * @param token The token to register
 * @param useValue The implementation to use
 */
export function registerServiceInstance<T>(token: string | InjectionToken<T>, useValue: T): void {
  container.registerInstance(token, useValue);
}

/**
 * Registers a service factory in the container
 * 
 * @param token The token to register
 * @param factory The factory function
 */
export function registerServiceFactory<T>(
  token: string | InjectionToken<T>,
  factory: () => T
): void {
  container.register(token, { useFactory: factory });
}

/**
 * Registers a service class in the container
 * 
 * @param token The token to register
 * @param serviceClass The service class to register
 */
export function registerServiceClass<T>(
  token: string | InjectionToken<T>,
  serviceClass: new (...args: any[]) => T
): void {
  container.register(token, { useClass: serviceClass });
}

/**
 * Gets the service metadata for a class
 * 
 * @param target The class to get metadata for
 * @returns The service metadata
 */
export function getServiceMetadata(target: any): ServiceMetadata | undefined {
  return Reflect.getMetadata(SERVICE_METADATA_KEY, target);
}

/**
 * Creates a wrapper for a service class that can be used in both DI and legacy modes.
 * In DI mode, it's the decorator to use for service registration
 * 
 * @param options Optional metadata for the service
 */
export function Service(options: Partial<ServiceMetadata> = {}) {
  return function(target: any) {
    // Make the class injectable to ensure it works with tsyringe
    injectable()(target);
    
    // Extract the service name and interface name
    const name = target.name;
    const interfaceName = name.charAt(0) !== 'I' ? `I${name}` : undefined;
    
    // Create metadata for the service
    const metadata: ServiceMetadata = {
      name,
      interfaceName,
      ...options
    };
    
    // Store metadata on the class
    Reflect.defineMetadata(SERVICE_METADATA_KEY, metadata, target);
    
    // Register this class with tsyringe regardless of DI mode
    // This ensures classes are registered at definition time, not at runtime
    // which is important for tests that toggle DI mode
    
    // Register the class directly for use with container.resolve(Class)
    container.register(target, { useClass: target });
    
    // Also register by name for string token resolution
    container.register(name, { useClass: target });
    
    // If there's an interface token like "IServiceName", register that too
    if (interfaceName) {
      container.register(interfaceName, { useClass: target });
    }
    
    // No modification to the class
    return target;
  };
}