import { vi } from 'vitest';
import { createPathMock } from './__mocks__/path';

// Configure path mock first to ensure it's available for all tests
vi.mock('path', () => {
  // Create a mock instance with the current platform
  const mock = createPathMock();
  
  // Return both named exports and default export
  return {
    __esModule: true,
    default: mock.default,
    ...mock,
  };
});

// Initialize test environment
beforeAll(() => {
  // Reset modules before all tests
  vi.resetModules();
});

// Clean up after tests
afterAll(() => {
  vi.resetModules();
}); 