// Test setup file

// Set test environment variable
process.env.MLLD_TEST = '1';

// Mock readline for tests to prevent prompts
import { vi } from 'vitest';

// Mock readline module to auto-respond in tests
vi.mock('readline/promises', () => ({
  createInterface: () => ({
    question: vi.fn().mockResolvedValue('y'), // Auto-approve
    close: vi.fn()
  })
}));