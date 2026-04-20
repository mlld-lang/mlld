import type { DataLabel } from './security';
import type { SessionDefinition, SessionScopedAttachment } from './session';
import type { NormalizedShelfScope, ShelfDefinition } from './shelf';
import type { ToolCollection } from './tools';
import type { PolicyConfig } from '../policy/union';

export type PolicyDerivedConstraints = {
  policy?: PolicyConfig;
  policyFragment?: PolicyConfig;
  policyEnv?: PolicyConfig['env'];
};

export type EnvironmentConfig = {
  provider?: string;
  auth?: string | string[];
  display?: string;
  taint?: DataLabel[];
  name?: string;
  from?: string;
  profile?: string;
  profiles?: Record<string, unknown>;
  mcpConfig?: unknown;
  shelf?: NormalizedShelfScope | ShelfDefinition;
  session?: SessionScopedAttachment | SessionDefinition;
  seed?: unknown;
  tools?: ToolCollection | string[];
  _policyDerivedConstraints?: PolicyDerivedConstraints;
  [key: string]: unknown;
};

export type EnvironmentCreateOptions = {
  name?: string;
  from?: string;
  [key: string]: unknown;
};

export type EnvironmentCreateResult = {
  envName: string;
  created: boolean;
};

export type EnvironmentCommand = {
  argv: string[];
  cwd?: string;
  vars?: Record<string, string>;
  secrets?: Record<string, string>;
  stdin?: string;
};

export type EnvironmentResult = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};
