import { ShadowEnvironmentCapture } from '../../env/types/ShadowEnvironmentCapture';
import { Environment } from '../../env/Environment';

/**
 * Resolves shadow environment for a specific language with fallback chain
 * Priority: captured (lexical) > current environment (dynamic)
 * 
 * @param language The language to resolve (js, javascript, node, nodejs)
 * @param capturedEnvs Shadow environments captured at definition time
 * @param currentEnv Current execution environment
 * @returns The resolved shadow environment Map or undefined
 */
export function resolveShadowEnvironment(
  language: string,
  capturedEnvs: ShadowEnvironmentCapture | undefined,
  currentEnv: Environment
): Map<string, any> | undefined {
  // Normalize language aliases for consistent lookup
  const normalizedLang = normalizeLanguage(language);
  
  // 1. Check captured environment first (lexical scope)
  if (capturedEnvs) {
    const captured = capturedEnvs[normalizedLang as keyof ShadowEnvironmentCapture];
    if (captured && captured.size > 0) {
      return captured;
    }
  }
  
  // 2. Fall back to dynamic scope (current environment)
  return currentEnv.getShadowEnv(language);
}

/**
 * Detects conflicts between captured and current shadow environments
 * WHY: When modules import other modules with shadow environments, 
 * we may have diamond dependencies where the same shadow function
 * exists in multiple contexts.
 */
function detectShadowConflicts(
  captured: Map<string, any> | undefined,
  current: Map<string, any> | undefined
): string[] {
  const conflicts: string[] = [];
  
  if (captured && current) {
    for (const [name, capturedFunc] of captured) {
      const currentFunc = current.get(name);
      if (currentFunc && currentFunc !== capturedFunc) {
        conflicts.push(name);
      }
    }
  }
  
  return conflicts;
}

/**
 * Merges shadow functions for execution context
 * Current environment functions take precedence over captured
 * Also filters out any functions that conflict with parameter names
 * 
 * @param captured Shadow functions from definition time
 * @param current Shadow functions from execution environment  
 * @param paramNames Set of parameter names to avoid conflicts
 * @returns Arrays of function names and values for Function constructor
 */
export function mergeShadowFunctions(
  captured: Map<string, any> | undefined,
  current: Map<string, any> | undefined,
  paramNames: Set<string>
): { names: string[], values: any[] } {
  const merged = new Map<string, any>();
  
  // Detect conflicts for debugging (only in debug mode)
  if (process.env.MLLD_DEBUG === 'true') {
    const conflicts = detectShadowConflicts(captured, current);
    if (conflicts.length > 0) {
      console.warn(
        `[Shadow Environment] Conflict detected for functions: ${conflicts.join(', ')}. ` +
        `Current environment shadows are overriding captured ones.`
      );
    }
  }
  
  // Start with captured (lexical scope)
  if (captured) {
    for (const [name, func] of captured) {
      if (!paramNames.has(name)) {
        merged.set(name, func);
      }
    }
  }
  
  // Override with current (dynamic scope) 
  if (current) {
    for (const [name, func] of current) {
      if (!paramNames.has(name)) {
        merged.set(name, func);
      }
    }
  }
  
  // Convert to arrays for Function constructor
  const names: string[] = [];
  const values: any[] = [];
  for (const [name, func] of merged) {
    names.push(name);
    values.push(func);
  }
  
  return { names, values };
}

/**
 * Normalizes language names to canonical form
 * js/javascript -> js, node/nodejs -> node
 */
function normalizeLanguage(language: string): string {
  switch (language) {
    case 'js':
    case 'javascript':
      return 'js';
    case 'node':
    case 'nodejs':
      return 'node';
    default:
      return language;
  }
}