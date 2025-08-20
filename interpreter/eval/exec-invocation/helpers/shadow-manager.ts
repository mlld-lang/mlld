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
   * Note: This is not actually used/needed since we pass the capture directly
   */
  static serialize(capture: ShadowEnvironmentCapture): any {
    // ShadowEnvironmentCapture is already in the right format
    // It's an object with language keys mapping to Maps
    // We just need to convert Maps to objects for JSON serialization
    const result: any = {};
    
    for (const [lang, shadowMap] of Object.entries(capture)) {
      if (shadowMap instanceof Map) {
        // Convert Map to plain object for JSON serialization
        const obj: any = {};
        shadowMap.forEach((value, key) => {
          obj[key] = value;
        });
        result[lang] = obj;
      } else if (shadowMap) {
        // Already serialized
        result[lang] = shadowMap;
      }
    }
    
    return result;
  }
  
  /**
   * Deserializes shadow environments from storage formats
   * 
   * Handles multiple serialization formats for compatibility:
   * - Map instances (already deserialized)
   * - Array format: [[key, value], ...] from JSON
   * - Object format: {key: value, ...} from module exports
   * 
   * @param shadowEnvs - Serialized shadow environments (object with language keys)
   * @returns Deserialized shadow environment capture
   */
  static deserialize(
    shadowEnvs: any
  ): ShadowEnvironmentCapture {
    if (!shadowEnvs) return {};
    
    const result: ShadowEnvironmentCapture = {};
    
    for (const [lang, shadowData] of Object.entries(shadowEnvs)) {
      if (!shadowData) continue;
      
      // Check if already a Map
      if (shadowData instanceof Map) {
        result[lang as keyof ShadowEnvironmentCapture] = shadowData;
        continue;
      }
      
      // Convert plain object/array to Map
      const map = new Map<string, any>();
      
      if (Array.isArray(shadowData)) {
        // Handle array format [[key, value], ...]
        shadowData.forEach(([key, value]: [string, any]) => {
          map.set(key, value);
        });
      } else if (typeof shadowData === 'object') {
        // Handle plain object format {key: value, ...}
        Object.entries(shadowData).forEach(([key, value]) => {
          map.set(key, value);
        });
      }
      
      if (map.size > 0) {
        result[lang as keyof ShadowEnvironmentCapture] = map;
      }
    }
    
    return result;
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
    capturedEnvs?: any  // Can be various formats depending on source
  ): void {
    if (!capturedEnvs) return;
    
    // Handle different formats of captured shadow environments
    // capturedEnvs can be: { js: Map, node: Map, ... } or similar structure
    
    for (const [lang, shadowEnv] of Object.entries(capturedEnvs)) {
      if (shadowEnv) {
        // shadowEnv could be a Map or other format
        env.setShadowEnv(lang, shadowEnv);
      }
    }
  }
  
  /**
   * Create a new environment with shadow environments
   */
  static createWithShadows(
    baseEnv: Environment,
    shadows?: any  // Can be various formats depending on source
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