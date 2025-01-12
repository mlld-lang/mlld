import { vi } from 'vitest';

// Set up global mocks
vi.mock('fs');
vi.mock('path');

// Reset all mocks before each test
beforeEach(() => {
  vi.resetAllMocks();
}); 