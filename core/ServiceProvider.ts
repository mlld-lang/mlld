/**
 * ServiceProvider is a compatibility layer that provides dependency injection 
 * with a seamless transition between the legacy manual instantiation and the 
 * new tsyringe-based DI system.
 * 
 * It supports both modes of operation based on the USE_DI environment variable.
 */

import { container } from 'tsyringe';
import 'reflect-metadata';

/**
 * Determines if DI should be used based on the USE_DI environment variable
 */
export const shouldUseDI = (): boolean => {
  return process.env.USE_DI === 'true';
};

/**
 * Creates a new instance of a service either through DI or manual instantiation
 * based on the USE_DI environment variable.
 * 
 * @param ServiceClass The service class to instantiate
 * @param dependencies The dependencies to pass to the constructor (for legacy mode)
 * @returns A new instance of the service
 */
export function createService<T, D extends any[]>(
  ServiceClass: new (...args: D) => T,
  ...dependencies: D
): T {
  if (shouldUseDI()) {
    // In DI mode, resolve the service from the container
    return container.resolve(ServiceClass);
  } else {
    // In legacy mode, instantiate the service manually
    return new ServiceClass(...dependencies);
  }
}

/**
 * Resolves a service from the container by token string
 * 
 * @param token The token to resolve
 * @returns The resolved service
 */
export function resolveService<T>(token: string): T {
  if (!shouldUseDI()) {
    throw new Error(`Cannot resolve service by token '${token}' when DI is disabled`);
  }
  return container.resolve<T>(token);
}

/**
 * Registers a service implementation in the container
 * 
 * @param token The token to register
 * @param useValue The implementation to use
 */
export function registerServiceInstance<T>(token: string, useValue: T): void {
  if (shouldUseDI()) {
    container.registerInstance(token, useValue);
  }
}

/**
 * Registers a service factory in the container
 * 
 * @param token The token to register
 * @param factory The factory function
 */
export function registerServiceFactory<T>(
  token: string,
  factory: () => T
): void {
  if (shouldUseDI()) {
    container.register(token, { useFactory: factory });
  }
}

/**
 * Creates a wrapper for a service class that can be used in both DI and legacy modes.
 * In DI mode, it's the decorator to use for service registration
 */
export function Service() {
  return function(target: any) {
    // Register this class with tsyringe regardless of DI mode
    // This ensures classes are registered at definition time, not at runtime
    // which is important for tests that toggle DI mode
    
    // Register the class directly for use with container.resolve(Class)
    container.register(target, { useClass: target });
    
    // Also register by name for string token resolution
    const name = target.name;
    container.register(name, { useClass: target });
    
    // If there's an interface token like "IServiceName", register that too
    if (name.charAt(0) !== 'I') {
      container.register(`I${name}`, { useClass: target });
    }
    
    // No modification to the class
    return target;
  };
}