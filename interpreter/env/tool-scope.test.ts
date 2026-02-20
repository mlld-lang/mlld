import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('environment tool scoping', () => {
  it('enforces tool scope attenuation in child environments', () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), '/');
    env.setAllowedTools(['alpha', 'beta']);

    const child = env.createChildEnvironment();
    expect(child.isToolAllowed('alpha')).toBe(true);
    expect(child.isToolAllowed('beta')).toBe(true);

    expect(() => child.setAllowedTools(['alpha', 'gamma'])).toThrow(/outside parent/i);
    expect(() => child.setAllowedTools(['alpha'])).not.toThrow();
  });
});
