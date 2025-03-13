/**
 * ServiceProvider provides dependency injection using TSyringe.
 * All services are created and managed through the DI container.
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
  dependencies?: Array<{ token: string | symbol; name: string; optional?: boolean }>;
}

/**
 * Creates a service instance using dependency injection
 * @param serviceClass The service class to create
 * @returns The created service instance
 */
export function createService<T>(serviceClass: new (...args: any[]) => T): T {
  return container.resolve(serviceClass);
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
 * Service decorator that registers a class with the DI container
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
    
    // Register the class with tsyringe
    container.register(target, { useClass: target });
    container.register(name, { useClass: target });
    
    // If there's an interface token like "IServiceName", register that too
    if (interfaceName) {
      container.register(interfaceName, { useClass: target });
    }
    
    return target;
  };
}