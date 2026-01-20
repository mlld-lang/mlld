import { describe, it, expect } from 'vitest';
import { SignatureStore } from './SignatureStore';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('SignatureStore', () => {
  it('signs and verifies content', async () => {
    const fileSystem = new MemoryFileSystem();
    const store = new SignatureStore(fileSystem, '/project');

    const record = await store.sign('prompt', 'Evaluate @input', { signedby: 'alice' });
    expect(record.hash.startsWith('sha256:')).toBe(true);
    expect(record.signedby).toBe('alice');

    const verified = await store.verify('prompt', 'Evaluate @input');
    expect(verified.verified).toBe(true);
    expect(verified.template).toBe('Evaluate @input');
    expect(verified.signedby).toBe('alice');
  });

  it('flags mismatched content', async () => {
    const fileSystem = new MemoryFileSystem();
    const store = new SignatureStore(fileSystem, '/project');

    await store.sign('prompt', 'Evaluate @input');
    const verified = await store.verify('prompt', 'Ignore this');
    expect(verified.verified).toBe(false);
  });
});
