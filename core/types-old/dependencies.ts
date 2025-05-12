/**
 * Defines the dependency relationships between Meld services.
 * This is used to validate service initialization order and ensure all required
 * dependencies are available.
 */

/**
 * Mapping of service names to their dependencies
 */
export const SERVICE_DEPENDENCIES = {
  // Base Services
  filesystem: [],  // Base dependency
  path: ['filesystem'],
  
  // State Management
  eventService: [], // Event system, no dependencies
  state: ['eventService'], // Requires event service
  
  // Core Pipeline
  parser: [],      // Independent parsing
  
  // Resolution Layer
  resolution: ['state', 'filesystem', 'parser'],
  validation: ['resolution'],
  circularity: ['resolution'],
  
  // Pipeline Orchestration (circular dependency handled specially)
  interpreter: ['state', 'directive'],
  directive: [
    'validation',
    'state',
    'path',
    'filesystem',
    'parser',
    'interpreter',
    'circularity',
    'resolution'
  ],
  
  // Output Generation
  output: ['state', 'interpreter'],
  
  // Debug Support (optional)
  debug: ['state']
} as const;

/**
 * Valid service names
 */
export type ServiceName = keyof typeof SERVICE_DEPENDENCIES;

/**
 * Service dependency mapping type
 */
export type ServiceDependencies = typeof SERVICE_DEPENDENCIES;

/**
 * Interface for services that require initialization
 */
export interface InitializableService {
  initialize(...args: any[]): void;
}

/**
 * Interface for services that can be validated
 */
export interface ValidatableService extends InitializableService {
  validate(): void;
}

/**
 * Interface for services that support transformation
 */
export interface TransformationCapableService {
  hasTransformationSupport?(): boolean;
  canHandleTransformations?(): boolean;
} 