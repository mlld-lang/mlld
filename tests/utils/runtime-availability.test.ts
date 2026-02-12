import { describe, expect, it, vi } from 'vitest';
import { isPython3RuntimeAvailable } from './runtime-availability';

describe('isPython3RuntimeAvailable', () => {
  it('returns true when python3 command succeeds', () => {
    const runCommand = vi.fn();
    runCommand.mockReturnValue(Buffer.from('Python 3.11.0'));

    const available = isPython3RuntimeAvailable(runCommand);

    expect(available).toBe(true);
    expect(runCommand).toHaveBeenCalledWith('python3 --version', { stdio: 'ignore' });
  });

  it('returns false when python3 command throws', () => {
    const runCommand = vi.fn();
    runCommand.mockImplementation(() => {
      throw new Error('python3 not found');
    });

    const available = isPython3RuntimeAvailable(runCommand);

    expect(available).toBe(false);
    expect(runCommand).toHaveBeenCalledWith('python3 --version', { stdio: 'ignore' });
  });
});
