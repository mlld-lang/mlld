/**
 * Utility functions for cartesian product operations in foreach expressions
 */

/**
 * Generates the cartesian product of multiple arrays.
 * 
 * @param arrays - Array of arrays to compute cartesian product of
 * @returns Array of tuples containing all combinations
 * 
 * @example
 * cartesianProduct([[1, 2], ['a', 'b']]) 
 * // Returns: [[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]
 */
export function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) {
    return [];
  }
  
  if (arrays.length === 1) {
    return arrays[0].map(item => [item]);
  }
  
  // Recursive approach to build cartesian product
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  
  const result: T[][] = [];
  
  for (const firstItem of first) {
    for (const restTuple of restProduct) {
      result.push([firstItem, ...restTuple]);
    }
  }
  
  return result;
}

/**
 * Validates that all inputs are arrays and returns their lengths.
 * 
 * @param arrays - Arrays to validate
 * @returns Array of lengths for each input array
 * @throws Error if any input is not an array
 */
export function validateArrayInputs(arrays: any[]): number[] {
  const lengths: number[] = [];
  
  for (let i = 0; i < arrays.length; i++) {
    if (!Array.isArray(arrays[i])) {
      throw new Error(`Argument ${i + 1} to foreach must be an array, got ${typeof arrays[i]}`);
    }
    lengths.push(arrays[i].length);
  }
  
  return lengths;
}

/**
 * Calculates the total number of combinations for given array lengths.
 * Used for performance warnings and limits.
 * 
 * @param lengths - Array of lengths
 * @returns Total number of combinations
 */
export function calculateTotalCombinations(lengths: number[]): number {
  return lengths.reduce((total, length) => total * length, 1);
}

/**
 * Performance limit for foreach operations.
 * Prevents accidental generation of extremely large result sets.
 */
export const FOREACH_PERFORMANCE_LIMIT = 10000;

/**
 * Checks if the cartesian product would exceed performance limits.
 * 
 * @param arrays - Input arrays
 * @returns true if within limits, false otherwise
 */
export function isWithinPerformanceLimit(arrays: any[][]): boolean {
  const lengths = arrays.map(arr => arr.length);
  const totalCombinations = calculateTotalCombinations(lengths);
  return totalCombinations <= FOREACH_PERFORMANCE_LIMIT;
}