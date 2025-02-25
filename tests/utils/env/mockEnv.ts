/**
 * Utility for mocking environment variables in CLI tests
 * 
 * This utility allows testing with various environment configurations
 * without affecting the actual environment variables.
 */

/**
 * Environment variables to set for testing
 */
interface EnvVars {
  [key: string]: string;
}

/**
 * Result of mockEnv call
 */
interface MockEnvResult {
  /** Function to restore the original environment variables */
  restore: () => void;
}

/**
 * Mock environment variables for testing
 * @param envVars - Object mapping environment variable names to values
 * @returns Object containing a restore function
 */
export function mockEnv(envVars: EnvVars = {}): MockEnvResult {
  // Save original environment
  const originalEnv = { ...process.env };
  
  // Set environment variables for test
  Object.entries(envVars).forEach(([key, value]) => {
    process.env[key] = value;
  });
  
  return {
    restore: () => {
      // Restore original environment
      process.env = { ...originalEnv };
    }
  };
}

/**
 * Example usage:
 * 
 * ```typescript
 * it('should resolve environment variables', async () => {
 *   const { restore } = mockEnv({ 'TEST_VAR': 'test-value' });
 *   const { mocks, restoreConsole } = mockConsole();
 *   
 *   try {
 *     await cli.run(['--eval', '@text result = "#{env.TEST_VAR}"']);
 *     expect(mocks.log).toHaveBeenCalledWith('test-value');
 *   } finally {
 *     restore();
 *     restoreConsole();
 *   }
 * });
 * ```
 */ 