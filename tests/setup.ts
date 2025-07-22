// Test setup file
import * as fs from 'fs';
import * as path from 'path';

// Set test environment variable
process.env.MLLD_TEST = '1';

// Suppress llmxml logging during tests
process.env.LOG_LEVEL = 'error';

// Load .env.test if it exists
const envTestPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  const envContent = fs.readFileSync(envTestPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

// Mock readline for tests to prevent prompts
import { vi } from 'vitest';

// Mock readline module to auto-respond in tests
vi.mock('readline/promises', () => ({
  createInterface: () => ({
    question: vi.fn().mockResolvedValue('y'), // Auto-approve
    close: vi.fn()
  })
}));