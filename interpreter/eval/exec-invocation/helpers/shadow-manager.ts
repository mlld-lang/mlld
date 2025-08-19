import type { Environment } from '@interpreter/env/Environment';
import type { ShadowEnvironmentCapture } from '@interpreter/env/types/ShadowEnvironmentCapture';
import { prepareValueForShadow } from '@interpreter/env/variable-proxy';

/**
 * Centralized management of shadow environments for code execution
 * Handles serialization, deserialization, and creation of shadow environments
 */
export class ShadowEnvironmentManager {
  /**
   * Prepare a shadow environment for serialization
   */
  static prepare(env: Environment, language: string): SerializedShadow {
    const shadowCapture = env.captureShadowEnvironment(language);
    return this.serialize(shadowCapture);
  }
  
  /**
   * Serialize a shadow environment capture
   */
  static serialize(capture: ShadowEnvironmentCapture): SerializedShadow {
    const serialized: SerializedShadow = {
      variables: new Map(),
      language: capture.language
    };
    
    capture.variables.forEach((value, key) => {
      serialized.variables.set(key, prepareValueForShadow(value));
    });
    
    return serialized;
  }
  
  /**
   * Deserialize shadow environments from storage
   */
  static deserialize(
    shadowEnvs: Record<string, any>
  ): Record<string, ShadowEnvironmentCapture> {
    const deserialized: Record<string, ShadowEnvironmentCapture> = {};
    
    for (const [lang, env] of Object.entries(shadowEnvs)) {
      if (!env) continue;
      
      // Check if already deserialized
      if (env instanceof Map) {
        deserialized[lang] = { language: lang, variables: env };
        continue;
      }
      
      // Deserialize from plain object
      const variables = new Map<string, any>();
      
      if (env.variables) {
        // Handle both Map and plain object formats
        if (env.variables instanceof Map) {
          env.variables.forEach((value: any, key: string) => {
            variables.set(key, value);
          });
        } else if (Array.isArray(env.variables)) {
          // Handle array format [key, value][]
          env.variables.forEach(([key, value]: [string, any]) => {
            variables.set(key, value);
          });
        } else {
          // Handle plain object format
          Object.entries(env.variables).forEach(([key, value]) => {
            variables.set(key, value);
          });
        }
      }
      
      deserialized[lang] = {
        language: lang,
        variables
      };
    }
    
    return deserialized;
  }
  
  /**
   * Apply captured shadow environments to an environment
   */
  static applyCaptured(
    env: Environment,
    capturedEnvs?: Record<string, ShadowEnvironmentCapture>
  ): void {
    if (!capturedEnvs) return;
    
    for (const [lang, capture] of Object.entries(capturedEnvs)) {
      if (capture && capture.variables) {
        env.setShadowEnvironment(lang, capture);
      }
    }
  }
  
  /**
   * Create a new environment with shadow environments
   */
  static createWithShadows(
    baseEnv: Environment,
    shadows?: Record<string, ShadowEnvironmentCapture>
  ): Environment {
    const newEnv = baseEnv.createChild();
    this.applyCaptured(newEnv, shadows);
    return newEnv;
  }
}

/**
 * Serialized shadow environment for storage
 */
export interface SerializedShadow {
  variables: Map<string, any>;
  language: string;
}