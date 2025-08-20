import type { Environment } from '@interpreter/env/Environment';
import type { ShadowEnvironmentCapture } from '@interpreter/env/types/ShadowEnvironmentCapture';
import { prepareValueForShadow } from '@interpreter/env/variable-proxy';

/**
 * Manages shadow environments for cross-language execution
 * 
 * Shadow environments enable mlld functions to be called from within embedded
 * code blocks (JavaScript, Python, Bash). They capture the lexical scope at
 * function definition time and make it available during execution.
 * 
 * KEY FEATURES:
 * - Captures environment at definition time (lexical scoping)
 * - Serializes for storage in ExecutableVariables
 * - Deserializes from multiple formats (Map, Array, Object)
 * - Applies captured environments to execution contexts
 * 
 * SERIALIZATION: Supports multiple formats for compatibility with imports
 * and different storage mechanisms (JSON, module exports, etc.)
 */
export class ShadowEnvironmentManager {
  /**
   * Prepares a shadow environment for serialization
   * 
   * Captures the current environment state for a specific language and
   * converts it to a serializable format. Used when defining functions
   * that may be called from embedded code.
   * 
   * @param env - Environment to capture from
   * @param language - Target language (js, python, bash)
   * @returns Serialized shadow environment ready for storage
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
   * Deserializes shadow environments from storage formats
   * 
   * Handles multiple serialization formats for compatibility:
   * - Map instances (already deserialized)
   * - Array format: [[key, value], ...] from JSON
   * - Object format: {key: value, ...} from module exports
   * 
   * @param shadowEnvs - Serialized shadow environments by language
   * @returns Deserialized shadow environment captures
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
   * Applies captured shadow environments to an execution environment
   * 
   * Used during function execution to make captured variables available
   * to embedded code blocks. Each language gets its own shadow environment.
   * 
   * @param env - Environment to apply shadows to
   * @param capturedEnvs - Previously captured shadow environments
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