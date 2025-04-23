/**
 * @package
 * Test output filter service exports.
 * 
 * These exports allow for selective test output configuration without breaking
 * existing test code.
 */

// Export interfaces and types
export * from './ITestOutputFilterService';
export * from './TestOutputFilterService';

// Global instance for shared access across tests
import { TestOutputFilterService } from '@tests/utils/debug/TestOutputFilterService/TestOutputFilterService';

// Create a default instance
const defaultInstance = new TestOutputFilterService();

// Export for use by other modules
export const getOutputFilterInstance = () => defaultInstance;

// Try to add to global scope if available (will silently fail if global isn't accessible)
try {
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).testOutputFilter = (globalThis as any).testOutputFilter || defaultInstance;
  }
} catch (e) {
  // Ignore errors in environments that don't support globalThis
}