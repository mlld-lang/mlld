import type { DataLabel } from './security';

export type EnvironmentConfig = {
  provider?: string;
  auth?: string | string[];
  taint?: DataLabel[];
  [key: string]: unknown;
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
  handle?: unknown;
};
