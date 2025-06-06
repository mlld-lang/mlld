/**
 * Built-in functions for mlld
 * These functions are available in @when conditions and other contexts
 */

import type { Environment } from '../env/Environment';

/**
 * Built-in function type
 */
export type BuiltinFunction = (args: any[], env: Environment) => boolean | string | number | any;

/**
 * Registry of built-in functions
 */
export const builtinFunctions: Record<string, BuiltinFunction> = {
  /**
   * @equals(value) - Check if the current value equals the given value
   */
  equals: (args: any[], env: Environment): boolean => {
    if (args.length !== 1) {
      throw new Error('@equals requires exactly one argument');
    }
    
    // Get the current value from the when context
    const currentValue = env.getVariable('_whenValue')?.value;
    const compareValue = args[0]?.value ?? args[0];
    
    return currentValue === compareValue;
  },

  /**
   * @contains(value) - Check if the current array/string contains the given value
   */
  contains: (args: any[], env: Environment): boolean => {
    if (args.length !== 1) {
      throw new Error('@contains requires exactly one argument');
    }
    
    // Get the current value from the when context
    const currentValue = env.getVariable('_whenValue')?.value;
    const searchValue = args[0]?.value ?? args[0];
    
    if (Array.isArray(currentValue)) {
      return currentValue.includes(searchValue);
    } else if (typeof currentValue === 'string') {
      return currentValue.includes(String(searchValue));
    }
    
    return false;
  },

  /**
   * @length() - Get the length of the current array/string
   */
  length: (args: any[], env: Environment): number => {
    const currentValue = env.getVariable('_whenValue')?.value;
    
    if (Array.isArray(currentValue) || typeof currentValue === 'string') {
      return currentValue.length;
    }
    
    return 0;
  },

  /**
   * @not(value) - Negate a boolean value
   */
  not: (args: any[], env: Environment): boolean => {
    if (args.length !== 1) {
      throw new Error('@not requires exactly one argument');
    }
    
    const value = args[0]?.value ?? args[0];
    return !value;
  }
};

/**
 * Check if a function name is a built-in function
 */
export function isBuiltinFunction(name: string): boolean {
  return name in builtinFunctions;
}

/**
 * Execute a built-in function
 */
export function executeBuiltinFunction(
  name: string, 
  args: any[], 
  env: Environment
): any {
  const func = builtinFunctions[name];
  if (!func) {
    throw new Error(`Unknown built-in function: @${name}`);
  }
  
  return func(args, env);
}