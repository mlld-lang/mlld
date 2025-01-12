import { beforeEach } from 'vitest';
import { InterpreterState } from '../state/state';

// Mock state for testing
let mockState: InterpreterState;

beforeEach(() => {
  mockState = new InterpreterState();
});

export { mockState }; 