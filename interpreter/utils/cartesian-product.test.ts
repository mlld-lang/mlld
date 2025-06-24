import { describe, it, expect } from 'vitest';
import { 
  cartesianProduct, 
  validateArrayInputs, 
  calculateTotalCombinations, 
  isWithinPerformanceLimit,
  FOREACH_PERFORMANCE_LIMIT
} from './cartesian-product';

describe('cartesianProduct', () => {
  it('should handle empty input', () => {
    expect(cartesianProduct([])).toEqual([]);
  });

  it('should handle single array', () => {
    const result = cartesianProduct([[1, 2, 3]]);
    expect(result).toEqual([[1], [2], [3]]);
  });

  it('should handle two arrays', () => {
    const result = cartesianProduct([['a', 'b'], [1, 2]]);
    expect(result).toEqual([
      ['a', 1],
      ['a', 2],
      ['b', 1],
      ['b', 2]
    ]);
  });

  it('should handle three arrays', () => {
    const result = cartesianProduct([['x', 'y'], [1, 2], ['A', 'B']]);
    expect(result).toEqual([
      ['x', 1, 'A'],
      ['x', 1, 'B'],
      ['x', 2, 'A'],
      ['x', 2, 'B'],
      ['y', 1, 'A'],
      ['y', 1, 'B'],
      ['y', 2, 'A'],
      ['y', 2, 'B']
    ]);
  });

  it('should handle empty arrays', () => {
    const result = cartesianProduct([[], [1, 2]]);
    expect(result).toEqual([]);
  });

  it('should handle arrays with different types', () => {
    const result = cartesianProduct([['string'], [42], [true]]);
    expect(result).toEqual([['string', 42, true]]);
  });
});

describe('validateArrayInputs', () => {
  it('should validate array inputs', () => {
    const lengths = validateArrayInputs([[1, 2], ['a', 'b', 'c']]);
    expect(lengths).toEqual([2, 3]);
  });

  it('should throw error for non-array input', () => {
    expect(() => {
      validateArrayInputs([{}, [1, 2]]);
    }).toThrow('Argument 1 to foreach must be an array, got object');
  });

  it('should throw error for string input', () => {
    expect(() => {
      validateArrayInputs(['not an array', [1, 2]]);
    }).toThrow('Argument 1 to foreach must be an array, got string');
  });
});

describe('calculateTotalCombinations', () => {
  it('should calculate total combinations', () => {
    expect(calculateTotalCombinations([2, 3])).toBe(6);
    expect(calculateTotalCombinations([2, 3, 4])).toBe(24);
    expect(calculateTotalCombinations([1, 1, 1])).toBe(1);
  });

  it('should handle empty input', () => {
    expect(calculateTotalCombinations([])).toBe(1);
  });

  it('should handle zero length arrays', () => {
    expect(calculateTotalCombinations([0, 5])).toBe(0);
  });
});

describe('isWithinPerformanceLimit', () => {
  it('should return true for small arrays', () => {
    const smallArrays = [[1, 2], ['a', 'b'], [true, false]]; // 2 * 2 * 2 = 8
    expect(isWithinPerformanceLimit(smallArrays)).toBe(true);
  });

  it('should return false for large arrays', () => {
    // Create arrays that would generate more than FOREACH_PERFORMANCE_LIMIT combinations
    const largeArray = new Array(Math.ceil(Math.sqrt(FOREACH_PERFORMANCE_LIMIT)) + 1).fill(0).map((_, i) => i);
    const largeArrays = [largeArray, largeArray]; // Would exceed limit
    expect(isWithinPerformanceLimit(largeArrays)).toBe(false);
  });

  it('should handle edge case at the limit', () => {
    // Create arrays that generate exactly the limit
    const exactLimitArrays = [[...Array(FOREACH_PERFORMANCE_LIMIT).keys(}];
    expect(isWithinPerformanceLimit(exactLimitArrays)).toBe(true);
  });
});