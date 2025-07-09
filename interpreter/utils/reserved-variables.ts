/**
 * Utilities for computing reserved variable values
 * This keeps test-specific logic out of the main Environment class
 */

/**
 * Get the current time value for @NOW variable
 * Handles test mocking via MLLD_MOCK_TIME environment variable
 */
export function getTimeValue(): string {
  const mockTime = process.env.MLLD_MOCK_TIME;
  if (mockTime) {
    // If it's a number, convert Unix timestamp to ISO
    if (/^\d+$/.test(mockTime)) {
      return new Date(parseInt(mockTime) * 1000).toISOString();
    }
    // Otherwise parse as ISO string
    return new Date(mockTime).toISOString();
  }
  // Default to current time in ISO format
  return new Date().toISOString();
}

/**
 * Get the project path value for @PROJECTPATH variable
 * This is a placeholder that gets replaced with actual project path later
 */
export function getProjectPathValue(basePath: string): string {
  // For now, return basePath. The actual project path discovery
  // happens asynchronously and updates this value
  return basePath;
}