import { describe, it, expect } from 'vitest';
import {
  getAgentDefinition,
  getDefaultAgentType,
  listAgentTypes,
  pullAgentRegistryModules
} from './box-agent-registry';

describe('box-agent-registry', () => {
  it('lists supported agent types', () => {
    expect(listAgentTypes()).toEqual(['claude', 'codex']);
    expect(getDefaultAgentType()).toBe('claude');
  });

  it('defines claude agent metadata', () => {
    const claude = getAgentDefinition('claude');
    expect(claude.registryModule).toBe('@mlld/agents/claude');
    expect(claude.configDirName).toBe('.claude');
    expect(claude.command).toBe('claude');
  });

  it('pulls base + agent templates for claude capture', () => {
    const modules = pullAgentRegistryModules('claude');
    expect(modules.map(module => module.ref)).toEqual([
      '@mlld/agents/base',
      '@mlld/agents/claude'
    ]);
    expect(modules[0].source).toContain('@keychainRef');
    expect(modules[1].source).toContain('@setup');
    expect(modules[1].source).toContain('claude -p @prompt');
  });
});
