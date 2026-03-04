export type AgentType = 'claude' | 'codex';

export interface AgentDefinition {
  type: AgentType;
  displayName: string;
  registryModule: string;
  configDirName: '.claude' | '.codex';
  command: 'claude' | 'codex';
  tokenEnvVar: string;
  credentialTokenPaths: string[];
}

export interface PulledAgentModule {
  ref: string;
  relativePath: string;
  source: string;
}

const BASE_MODULE = `\
/exe @keychainRef(boxName) = \`keychain:mlld-box/@boxName\`
/exe @emptyMcpConfig() = null
/export { @keychainRef, @emptyMcpConfig }
`;

const CLAUDE_MODULE = `\
/import { @keychainRef, @emptyMcpConfig } from "./base.mld"

/var @settings = {
  "permissions": {
    "allow": ["Bash(*)", "Read(*)", "Write(*)"]
  }
}

/var @claudeMd = "You are working in a sandboxed mlld workspace."

/var @setup = [
  { "settings.json": @settings, desc: "Claude Code permissions" },
  { "CLAUDE.md": @claudeMd, desc: "Agent instructions" }
]

/exe @policy(boxName) = {
  auth: {
    claude: { from: @keychainRef(@boxName), as: "CLAUDE_CODE_OAUTH_TOKEN" }
  },
  capabilities: {
    danger: ["@keychain"]
  }
}

/exe @configureAuth(boxName) = @keychainRef(@boxName)

/exe @spawn(boxName, prompt, configDir) = run { CLAUDE_CONFIG_DIR=@configDir claude -p @prompt } using auth:claude with { policy: @policy(@boxName) }

/exe @shell(boxName, configDir) = run { CLAUDE_CONFIG_DIR=@configDir claude } using auth:claude with { policy: @policy(@boxName) }

/exe @mcpConfig() = @emptyMcpConfig()

/export { @setup, @configureAuth, @spawn, @shell, @mcpConfig }
`;

const CODEX_MODULE = `\
/import { @keychainRef, @emptyMcpConfig } from "./base.mld"

/var @settings = {
  "permissions": {
    "allow": ["Bash(*)", "Read(*)", "Write(*)"]
  }
}

/var @agentsMd = "You are working in a sandboxed mlld workspace."

/var @setup = [
  { "settings.json": @settings, desc: "Codex permissions" },
  { "AGENTS.md": @agentsMd, desc: "Agent instructions" }
]

/exe @policy(boxName) = {
  auth: {
    codex: { from: @keychainRef(@boxName), as: "CODEX_OAUTH_TOKEN" }
  },
  capabilities: {
    danger: ["@keychain"]
  }
}

/exe @configureAuth(boxName) = @keychainRef(@boxName)

/exe @spawn(boxName, prompt, configDir) = run { CODEX_CONFIG_DIR=@configDir codex -p @prompt } using auth:codex with { policy: @policy(@boxName) }

/exe @shell(boxName, configDir) = run { CODEX_CONFIG_DIR=@configDir codex } using auth:codex with { policy: @policy(@boxName) }

/exe @mcpConfig() = @emptyMcpConfig()

/export { @setup, @configureAuth, @spawn, @shell, @mcpConfig }
`;

const AGENT_DEFINITIONS: Record<AgentType, AgentDefinition> = {
  claude: {
    type: 'claude',
    displayName: 'Claude Code',
    registryModule: '@mlld/agents/claude',
    configDirName: '.claude',
    command: 'claude',
    tokenEnvVar: 'CLAUDE_CODE_OAUTH_TOKEN',
    credentialTokenPaths: ['oauth_token', 'token', 'oauthToken']
  },
  codex: {
    type: 'codex',
    displayName: 'Codex',
    registryModule: '@mlld/agents/codex',
    configDirName: '.codex',
    command: 'codex',
    tokenEnvVar: 'CODEX_OAUTH_TOKEN',
    credentialTokenPaths: ['oauth_token', 'token', 'oauthToken']
  }
};

const MODULE_CATALOG: Record<string, PulledAgentModule> = {
  '@mlld/agents/base': {
    ref: '@mlld/agents/base',
    relativePath: 'agents/base.mld',
    source: BASE_MODULE
  },
  '@mlld/agents/claude': {
    ref: '@mlld/agents/claude',
    relativePath: 'agents/claude.mld',
    source: CLAUDE_MODULE
  },
  '@mlld/agents/codex': {
    ref: '@mlld/agents/codex',
    relativePath: 'agents/codex.mld',
    source: CODEX_MODULE
  }
};

export function getAgentDefinition(type: AgentType): AgentDefinition {
  return AGENT_DEFINITIONS[type];
}

export function getDefaultAgentType(): AgentType {
  return 'claude';
}

export function listAgentTypes(): AgentType[] {
  return ['claude', 'codex'];
}

export function pullAgentRegistryModules(agentType: AgentType): PulledAgentModule[] {
  const definition = getAgentDefinition(agentType);
  const baseModule = MODULE_CATALOG['@mlld/agents/base'];
  const agentModule = MODULE_CATALOG[definition.registryModule];
  if (!baseModule || !agentModule) {
    throw new Error(`Missing registry module template for ${definition.registryModule}`);
  }
  return [baseModule, agentModule];
}
